/**
 * 🤖 AI Agent — the vendor's private AI agent (feature 'agent').
 *
 * Raj, 2026-10-10: "my own AI agent… it should understand my English even
 * though I'm not speaking very well". Claude is the brain; the tools in
 * lib/agentTools.js are its hands — the same reads the vendor's own panel
 * does, for this vendor only. No development, no Super Admin, no platform.
 *
 * 💲 Every call is counted in agent_usage; past the monthly cap the assistant
 *    stops answering until next month (or until the cap is raised).
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { limit } from '../middleware/rateLimit.js';
import { TOOLS, runTool } from '../lib/agentTools.js';
import { ACTION_TOOLS, runActionTool, confirmAction, cancelAction } from '../lib/agentActions.js';
import { vapid } from '../lib/agentPush.js';

const ALL_TOOLS = [...TOOLS, ...ACTION_TOOLS];
const ACTIONS = new Set(ACTION_TOOLS.map(t => t.name));

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);
const API_URL = 'https://api.anthropic.com/v1/messages';

/* Claude Haiku 5.5 — Anthropic's small, fast model (Oct 2026): plenty for
   reading a panel and answering, at about $0.10 / $0.50 per million tokens in
   / out (platform.claude.com/docs/en/about-claude/pricing). Model, prices and
   the cap are platform settings, so none of them needs a code change. */
const DEFAULTS = { model: 'claude-haiku-5-5', priceIn: 0.10, priceOut: 0.50, capUsd: 15 };
const MAX_STEPS = 6;
/* room to think AND answer: Haiku 5.5 thinks before it writes, and at 800 a
   longer question used the whole allowance thinking and came back empty */
const MAX_TOKENS = 3000;          // tool rounds per message — enough to look up and cross-check
const month = () => new Date().toISOString().slice(0, 7);

async function config() {
  const num = async (k, d) => { const n = Number(await getSetting(k, '')); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    // its OWN key — no falling back to the chatbot's, so the two never share a bill
    apiKey: await getSetting('agent_api_key', ''),
    model: (await getSetting('agent_model', '')) || DEFAULTS.model,
    priceIn: await num('agent_price_in_per_mtok', DEFAULTS.priceIn),
    priceOut: await num('agent_price_out_per_mtok', DEFAULTS.priceOut),
    capUsd: await num('agent_monthly_cap_usd', DEFAULTS.capUsd),
  };
}

async function spent(v) {
  const u = await prisma.agent_usage.findUnique({ where: { vendor_id_month: { vendor_id: v, month: month() } } });
  return { usd: Number(u?.cost_micro || 0) / 1e6, requests: u?.requests || 0 };
}

async function record(v, inTok, outTok, cfg) {
  const micro = BigInt(Math.round(inTok * cfg.priceIn + outTok * cfg.priceOut));   // $/Mtok × tokens = micro-dollars
  await prisma.agent_usage.upsert({
    where: { vendor_id_month: { vendor_id: v, month: month() } },
    create: { vendor_id: v, month: month(), input_tokens: BigInt(inTok), output_tokens: BigInt(outTok), cost_micro: micro, requests: 1 },
    update: { input_tokens: { increment: BigInt(inTok) }, output_tokens: { increment: BigInt(outTok) }, cost_micro: { increment: micro }, requests: { increment: 1 }, updated_at: new Date() },
  });
}

function systemPrompt(studio, today, voice = false) {
  return `You are the private assistant of ${studio || 'a wedding vendor'}, working inside their iwopo vendor panel. Today is ${today}.
The person talking to you runs the business. English may be their second language and their messages may come from speech-to-text — read for what they MEAN, forgive spelling and grammar, and never comment on it.
Use the tools to look things up; never invent a client, date, amount or status. If something is not in the panel, say so plainly.
Answer short and clear, like a helpful office manager: the key facts first, a few short lines, no long paragraphs. Dates as "Sat 14 Jun". Money with the currency sign.
If a request is unclear, ask ONE short question.
Dates in tool results already carry their weekday — copy them as given and never work out a weekday yourself.
When asked to CHECK a contract (or "is it right / any mistakes"), do not summarise it: compare it line by line with the lead and the vendor's packages that preview_contract returns — names, event day and weekday, venue, times and hours, guests, package and price, deposit and balance, everything the client asked for in their form answers — and list each mismatch, gap or leftover text as a short numbered point. If nothing is wrong, say so in one line.
You can draft, inspect and check contracts with preview_contract — in the chat only. You can NEVER send, release or save a contract: the vendor does that themselves in Contracts & Invoices. Say so plainly if asked.
You may PROPOSE an email (answers, instructions, reminders) or sending packages; the vendor gets a Yes/No card and nothing goes out until they press Yes. After proposing, say in one line what is waiting for their Yes. Never claim something was sent.
Packages can only be proposed for a contract the vendor has already released.
For anything else that would change data (bookings, payments, deleting), say it is not something you can do yet.${voice ? `

SPOKEN: this question was spoken and your answer will be read aloud. Reply like a person talking — one or two short sentences, the key fact first, no lists, no bold, no headings, no emojis, numbers in words people say ("three new leads"). If there is more, end with a short offer such as "Want the details?".` : ''}`;
}

router.get('/usage', requireAuth, async (req, res) => {
  try {
    const cfg = await config();
    const s = await spent(vid(req));
    res.json({ month: month(), spentUsd: Number(s.usd.toFixed(4)), requests: s.requests, capUsd: cfg.capUsd, ready: !!cfg.apiKey, model: cfg.model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * One turn of the conversation. The app keeps the conversation and sends it
 * each time: [{ role: 'user'|'assistant', content: 'text' }, …].
 */
router.post('/chat', requireAuth, limit({ name: 'agent-chat', max: 30, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') }), async (req, res) => {
  try {
    const v = vid(req);
    const cfg = await config();
    if (!cfg.apiKey) return res.status(409).json({ error: 'The assistant needs its own key — Super Admin → Settings → AI Agent.' });
    const s = await spent(v);
    if (s.usd >= cfg.capUsd) return res.status(402).json({ error: `This month's assistant budget ($${cfg.capUsd}) is used up. It starts again next month.` });

    // only text turns from the app, the last 20, each sensibly short
    const history = (Array.isArray(req.body?.messages) ? req.body.messages : [])
      .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!history.length || history[history.length - 1].role !== 'user') return res.status(400).json({ error: 'Say something first' });

    const vendor = await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true } });
    const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [...history];
    let inTok = 0, outTok = 0;
    const looked = [];
    const proposals = [];         // actions waiting for the vendor's Yes
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: MAX_TOKENS, system: systemPrompt(vendor?.business_name, today, req.body?.voice === true), tools: ALL_TOOLS, messages }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        await record(v, inTok, outTok, cfg);
        return res.status(502).json({ error: d?.error?.message ? `Claude: ${d.error.message}` : `Claude did not answer (${r.status})` });
      }
      inTok += d.usage?.input_tokens || 0;
      outTok += d.usage?.output_tokens || 0;
      const uses = (d.content || []).filter(c => c.type === 'tool_use');
      if (d.stop_reason !== 'tool_use' || !uses.length) {
        await record(v, inTok, outTok, cfg);
        const reply = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
        return res.json({ proposals, reply: reply || (d.stop_reason === 'max_tokens' ? 'That needs a longer answer than I can give in one go — could you ask it in smaller parts?' : 'Sorry, I could not put an answer together — please ask again.'), looked, usage: { inTok, outTok } });
      }
      messages.push({ role: 'assistant', content: d.content });
      const results = [];
      for (const u of uses) {
        looked.push(u.name);
        let out;
        try {
          out = ACTIONS.has(u.name)
            // acting tools run as the vendor themself, through the panel's own endpoints
            ? await runActionTool(u.name, u.input || {}, v, req.headers.authorization)
            : await runTool(u.name, u.input || {}, v);
        } catch (e) { out = { error: e.message }; }
        if (out?.proposal) { proposals.push(out.proposal); out = { waiting_for_vendor: 'A Yes/No card is shown to the vendor; nothing has been sent.' }; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) });
      }
      messages.push({ role: 'user', content: results });
    }
    await record(v, inTok, outTok, cfg);
    res.json({ proposals, reply: 'That needed more looking up than I can do in one go — could you ask it in smaller parts?', looked, usage: { inTok, outTok } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 🔔 pop-ups on the vendor's devices (lib/agentPush.js) ── */
router.get('/push/key', requireAuth, async (req, res) => {
  try { res.json({ key: await vapid() }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/push/subscribe', requireAuth, async (req, res) => {
  try {
    const s = req.body || {};
    const endpoint = String(s.endpoint || ''), p256dh = String(s.keys?.p256dh || ''), auth = String(s.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return res.status(400).json({ error: 'Not a push subscription' });
    // 🔒 the device is this vendor's — a browser re-subscribing moves to whoever is signed in
    await prisma.push_subscriptions.upsert({ where: { endpoint }, create: { vendor_id: vid(req), endpoint, p256dh, auth }, update: { vendor_id: vid(req), p256dh, auth } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/push/unsubscribe', requireAuth, async (req, res) => {
  try { await prisma.push_subscriptions.deleteMany({ where: { endpoint: String(req.body?.endpoint || ''), vendor_id: vid(req) } }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/** ✅ The vendor pressed Yes on a proposed action. */
router.post('/confirm', requireAuth, async (req, res) => {
  try { res.json(await confirmAction(req.body?.id, vid(req), req.headers.authorization)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
/** ❌ The vendor pressed No. */
router.post('/cancel', requireAuth, (req, res) => { cancelAction(req.body?.id, vid(req)); res.json({ ok: true }); });

export default router;
