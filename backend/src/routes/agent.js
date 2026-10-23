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
import { openFollowups, actOnFollowup, scanVendor } from '../lib/followups.js';
import { listStages, stagesFor, setStages, addOutsideMessage, deleteOutsideMessage } from '../lib/projectStages.js';
import path from 'node:path';
import fs from 'node:fs';
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { requireAuth } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { limit } from '../middleware/rateLimit.js';
import { TOOLS, runTool } from '../lib/agentTools.js';
import { ACTION_TOOLS, runActionTool, confirmAction, cancelAction, isSmallChange } from '../lib/agentActions.js';
import { vapid } from '../lib/agentPush.js';
import { liveSession, liveSetup } from '../lib/geminiLive.js';
import { emailWarning } from '../lib/emailCheck.js';
import { compactResult, unpanel, unmerge, takesClient } from '../lib/tornadoLean.js';
import { SECTIONS, kbSync } from '../lib/agentKb.js';
import { rulesFor } from '../lib/agentRules.js';
import { finishedPcJobs, pcAllowed } from '../lib/pcAgent.js';
import { whatsNew, clipManifest, clipFile, recordClips, voiceBank } from '../lib/voiceClips.js';
import { gdocAllowed, docStatus, docSetup, syncDoc } from '../lib/googleDoc.js';
import { operate } from '../lib/panelOperator.js';
import { earTurn, galeUp, galeGreetingPcm } from '../lib/earBrain.js';
import { proposeOperatorCall } from '../lib/agentActions.js';
import { runTraining, undoLastTraining } from '../lib/agentTraining.js';
import { alertsFor } from '../lib/agentReminders.js';
import { buildBriefing, briefingText, knowledgeText, saveConversation } from '../lib/agentKnowledge.js';

const ALL_TOOLS = [...TOOLS, ...ACTION_TOOLS];
const ACTIONS = new Set(ACTION_TOOLS.map(t => t.name));
/* ⚡ the tool list never changes between turns: marked for Claude's prompt cache,
   so a follow-up question does not pay to re-read it (faster and cheaper) */
const CACHED_TOOLS = ALL_TOOLS.map((t, i) => (i === ALL_TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));
// 🛡️ the owner's private PC tools are left out for every other vendor (pcAgent.js → pcAllowed)
const PRIVATE_TOOLS = new Set(['pc_task', 'delivery_log']);
const PUBLIC_TOOLS = ALL_TOOLS.filter(t => !PRIVATE_TOOLS.has(t.name)).map((t, i, a) => (i === a.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));

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
Be warm and natural, like a friendly, capable office manager who knows the business well — a little personal, never stiff. Answer short and clear: the key facts first, a few short lines, no long paragraphs. Dates as "Sat 14 Jun". Money with the currency sign.
If a request is unclear, ask ONE short question.
Dates in tool results already carry their weekday — copy them as given and never work out a weekday yourself.
When asked to CHECK a contract (or "is it right / any mistakes"), do not summarise it: compare it line by line with the lead and the vendor's packages that preview_contract returns — names, event day and weekday, venue, times and hours, guests, package and price, deposit and balance, everything the client asked for in their form answers — and list each mismatch, gap or leftover text as a short numbered point. If nothing is wrong, say so in one line.
You can draft, inspect and check contracts with preview_contract — in the chat only. You can NEVER send, release or save a contract: the vendor does that themselves in Contracts & Invoices. Say so plainly if asked.
You may PROPOSE: an email to a client (answers, instructions, reminders), sending packages, adding a new lead, updating a lead (status such as booked, date, venue, times, guests, contact details, client notes), a private note on a lead, or archiving a lead. Each becomes a Yes/No card for the vendor and nothing happens until they press Yes. After proposing, say in one line what is waiting for their Yes. Never claim something was done before the Yes.
Packages can only be proposed for a contract the vendor has already released.
You can save reminders (set_reminder — deliveries promised to clients, tasks, alarms at a time), list and complete them, and tell the time anywhere (world_time). You may also answer general everyday questions from your own knowledge.
For anything else that would change data (payments, invoices, deleting for good), say it is not something you can do yet.${voice ? `

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
    const knowledge = await knowledgeText(v).catch(() => '');
    const briefing = await briefingText(v).catch(() => '');
    const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [...history];
    let inTok = 0, outTok = 0;
    const looked = [];
    const proposals = [];         // actions waiting for the vendor's Yes
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: MAX_TOKENS, system: [{ type: 'text', text: systemPrompt(vendor?.business_name, today, req.body?.voice === true), cache_control: { type: 'ephemeral' } }, { type: 'text', text: `What you know (facts and memories):\n${knowledge}\n\nThe business right now (refreshed every 15 minutes — use tools for details):\n${briefing}` }], tools: (await pcAllowed(vid(req))) ? CACHED_TOOLS : PUBLIC_TOOLS, messages }),
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

/* ── 🌪️ Tornado on Gemini Live (lib/geminiLive.js) — a single-use token + the locked setup ── */
router.get('/gemini/session', requireAuth, limit({ name: 'agent-gemini', max: 20, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') }), async (req, res) => {
  try { res.json(await liveSession(vid(req))); }
  catch (e) { res.status(409).json({ error: e.message }); }
});

/* ── 🧠 knowledge & memory (lib/agentKnowledge.js) ── */
router.get('/knowledge', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const rows = await prisma.agent_memory.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' } });
    const b = await prisma.agent_briefing.findUnique({ where: { vendor_id: v } });
    const talks = await prisma.agent_conversations.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 15, select: { id: true, summary: true, created_at: true } });
    const reminders = await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null }, orderBy: { due_at: 'asc' }, take: 30, select: { id: true, title: true, kind: true, due_at: true } });
    res.json({ items: rows.map(r => ({ id: r.id, kind: r.kind, text: r.text, at: r.created_at })), briefing: b?.text || await briefingText(v), briefingAt: b?.updated_at || new Date(), conversations: talks, reminders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/knowledge', requireAuth, async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: 'Write something first' });
    const r = await prisma.agent_memory.create({ data: { vendor_id: vid(req), kind: 'fact', text } });
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/knowledge/:id', requireAuth, async (req, res) => {
  try {
    const { count } = await prisma.agent_memory.deleteMany({ where: { id: Number(req.params.id), vendor_id: vid(req) } });   // 🔒
    res.status(count ? 200 : 404).json(count ? { ok: true } : { error: 'Not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try { const { count } = await prisma.agent_conversations.deleteMany({ where: { id: Number(req.params.id), vendor_id: vid(req) } }); res.status(count ? 200 : 404).json({ ok: !!count }); }   // 🔒
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/reminders/:id', requireAuth, async (req, res) => {
  try { const { count } = await prisma.agent_reminders.updateMany({ where: { id: Number(req.params.id), vendor_id: vid(req), done_at: null }, data: { done_at: new Date() } }); res.status(count ? 200 : 404).json({ ok: !!count }); }   // 🔒
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/knowledge/refresh', requireAuth, async (req, res) => {
  try { res.json({ briefing: await buildBriefing(vid(req)), briefingAt: new Date() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/** 🧠 A conversation just ended — remember what it was about (summary for the next one). */
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const turns = Array.isArray(req.body?.turns) ? req.body.turns.slice(-120) : [];
    const row = await saveConversation(vid(req), turns, req.body?.startedAt);
    res.json({ saved: !!row, summary: row?.summary || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 💵 Tornado's voice cost ─────────────────────────────────────────────
   Google list prices for gemini-3.1-flash-live (USD per million tokens),
   overridable in platform_settings if Google changes them. */
const VOICE_PRICES = { in_text: 0.75, in_audio: 3.0, out_text: 4.5, out_audio: 12.0 };
const vDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
async function voicePrices() {
  const out = { ...VOICE_PRICES };
  for (const k of Object.keys(out)) { const v = Number(await getSetting(`gemini_price_${k}`, '')); if (v > 0) out[k] = v; }
  return out;
}
async function voiceTotals(v) {
  const day = vDay(), month = day.slice(0, 7);
  const rows = await prisma.agent_voice_usage.findMany({ where: { vendor_id: v, day: { startsWith: month } }, select: { day: true, cost_micro: true } });
  const usd = (list) => list.reduce((t, r) => t + Number(r.cost_micro), 0) / 1e6;
  const rate = Number(await getSetting('usd_to_cad', '')) || 1.38;
  const today = usd(rows.filter(r => r.day === day)), mon = usd(rows);
  return { today_usd: today, month_usd: mon, today_cad: today * rate, month_cad: mon * rate, usd_to_cad: rate, month };
}

/** The app reports the tokens of each reply; the day's total grows. */
router.post('/voice-usage', requireAuth, async (req, res) => {
  try {
    const v = vid(req), p = await voicePrices();
    const n = (k) => Math.max(0, Math.min(5e6, Math.round(Number(req.body?.[k]) || 0)));
    const t = { in_text: n('in_text'), in_audio: n('in_audio'), out_text: n('out_text'), out_audio: n('out_audio') };
    const micro = Math.round(Object.keys(t).reduce((sum, k) => sum + t[k] * p[k], 0));      // tokens × $/M = micro-dollars
    if (micro || Object.values(t).some(Boolean)) {
      const day = vDay();
      await prisma.agent_voice_usage.upsert({
        where: { vendor_id_day: { vendor_id: v, day } },
        create: { vendor_id: v, day, ...Object.fromEntries(Object.entries(t).map(([k, x]) => [k, BigInt(x)])), cost_micro: BigInt(micro) },
        update: { ...Object.fromEntries(Object.entries(t).map(([k, x]) => [k, { increment: BigInt(x) }])), cost_micro: { increment: BigInt(micro) }, updated_at: new Date() },
      });
    }
    res.json({ added_usd: micro / 1e6, ...(await voiceTotals(v)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/voice-usage', requireAuth, async (req, res) => {
  try { res.json({ ...(await voiceTotals(vid(req))), prices: await voicePrices() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/** 📥 New texts, calls and leads since `since` — the app polls this during a conversation. */
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const since = new Date(Number(req.query.since) || Date.now() - 60e3);
    const when = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' });
    const comms = await privateDb.comms_events.findMany({ where: { vendor_id: v, direction: 'incoming', created_at: { gt: since } }, orderBy: { occurred_at: 'asc' }, take: 20, select: { kind: true, status: true, from_number: true, contact_name: true, body: true, occurred_at: true } }).catch(() => []);
    const leads = await prisma.leads.findMany({ where: { vendor_id: v, created_at: { gt: since } }, orderBy: { created_at: 'asc' }, take: 10, select: { id: true, name: true, event_type: true, event_date: true, email: true } });
    // 🏷️ who it is, by name — an unsaved number is matched to a lead through the contact index
    // (Raj, 2026-10-12: Yuffie's text reached Tornado as a bare number and it missed it was her)
    const last10 = (x) => String(x || '').replace(/\D/g, '').slice(-10);
    const people = comms.length ? await prisma.agent_contacts.findMany({ where: { vendor_id: v, phone: { not: null } }, select: { phone: true, name: true } }) : [];
    const byPhone = new Map(people.map(p => [last10(p.phone), p.name]));
    const who = (e) => e.contact_name || byPhone.get(last10(e.from_number)) || `the number ending ${last10(e.from_number).slice(-4)}`;
    const items = [
      ...comms.map(e => e.kind === 'call'
        ? `NEW ${/miss|no-answer/i.test(e.status || '') ? 'MISSED CALL' : 'CALL'} from ${who(e)} at ${when(e.occurred_at)}`
        : `NEW TEXT from ${who(e)} at ${when(e.occurred_at)}: "${String(e.body || '').slice(0, 200)}"`),
      ...leads.map(l => `New lead: ${l.name}${l.event_type ? ` (${l.event_type}${l.event_date ? `, ${new Date(l.event_date).toDateString()}` : ''})` : ''}${emailWarning(l.email) ? ` — ⚠️ their email ${l.email} looks wrong: ${emailWarning(l.email)}` : ''}`),
    ];
    items.push(...await finishedPcJobs(v, since).catch(() => []));   // 🖥️ a long PC job finished
    items.push(...(OPERATOR_DONE.get(v) || [])); OPERATOR_DONE.delete(v);   // 🧠 a long panel task finished
    // ✅ Tornado tells him these now — they count as seen (never announced again on the next wake-up)
    if (comms.length || leads.length) {
      const now = new Date();
      if (leads.length) await prisma.leads.updateMany({ where: { vendor_id: v, id: { in: leads.map(l => l.id) } }, data: { seen_at: now } });
      if (comms.length) await privateDb.comms_notices.updateMany({ where: { vendor_id: v, seen_at: null, created_at: { gt: since } }, data: { seen_at: now } }).catch(() => {});
    }
    res.json({ items, now: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 🎙️ the greeting and "what's new", played by the app from Tornado's recorded lines (lib/voiceClips.js) ── */
router.get('/whats-new', requireAuth, async (req, res) => {
  try { res.json(await whatsNew(vid(req), { markSeen: true })); } catch (e) { res.status(500).json({ error: e.message }); }   // read out = seen
});
router.get('/voice-clips', requireAuth, (req, res) => {
  const m = clipManifest(vid(req));
  res.json(m ? { version: m.version, keys: Object.keys(m.lines) } : { version: null, keys: [] });
});
router.get('/voice-clips/:key', requireAuth, (req, res) => {
  const f = clipFile(vid(req), req.params.key);              // 🔒 a clip name inside this vendor's folder, never a path
  if (!f) return res.status(404).json({ error: 'No such clip' });
  res.set('Cache-Control', 'private, max-age=86400').type('application/octet-stream').sendFile(f);
});
router.post('/voice-clips/record', requireAuth, async (req, res) => {
  const key = req.body?.key ? String(req.body.key) : null;      // one line again, or all missing ones
  try { res.json(await recordClips(vid(req), { force: req.body?.force === true || !!key, only: key ? [key] : null })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/voice-bank', requireAuth, (req, res) => res.json(voiceBank(vid(req))));

/* ── 📄 the knowledge base mirrored into one Google Doc (lib/googleDoc.js) — owner-only ── */
async function gdocOwner(req, res, next) { if (!(await gdocAllowed(vid(req)))) return res.status(403).json({ error: 'Not available' }); next(); }
router.get('/gdoc', requireAuth, gdocOwner, async (req, res) => res.json(await docStatus()));
router.post('/gdoc/setup', requireAuth, gdocOwner, async (req, res) => {
  try { res.json(await docSetup({ link: req.body?.link, key: req.body?.key })); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/gdoc/sync', requireAuth, gdocOwner, async (req, res) => {
  try { res.json(await syncDoc(vid(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ── 📋 the phone's Tornado log, sent when a conversation ends — kept per vendor (newest 3,000 lines) so a
   problem on the phone can be read on the server. The vendor's own device log; nothing is shown to anyone else. ── */
router.post('/app-log', requireAuth, async (req, res) => {
  try {
    const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).slice(-150).map(l => String(l).replace(/[\r\n]+/g, ' ').slice(0, 400));
    if (!lines.length) return res.json({ ok: true });
    const dir = path.join(process.cwd(), '..', 'storage', 'agent-logs');
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `vendor-${vid(req)}.log`);        // 🔒 the file name comes from the login, never the request
    let old = [];
    try { old = (await fs.promises.readFile(file, 'utf8')).split('\n'); } catch { /* first log */ }
    const merged = [...old, `— ${new Date().toISOString()} —`, ...lines].filter(Boolean).slice(-3000);
    await fs.promises.writeFile(file, merged.join('\n') + '\n');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 🎧 ear mode: the phone heard him (Google speech, on the phone) — Haiku thinks, Gemini speaks (lib/earBrain.js) ── */
router.post('/ear/turn', requireAuth, limit({ name: 'agent-ear', max: 60, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') }), async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (type, data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
  try { await earTurn({ vendorId: vid(req), auth: req.headers.authorization, sessionId: req.body?.session, text: String(req.body?.text || ''), send }); }
  catch (e) { send('error', { message: e.message }); }
  res.end();
});

/* ── 🧭 project stages, outside messages, email log (lib/projectStages.js). Reached only here, so only by
   vendors with the AI Agent; the vendor always comes from the login, never the body. ── */
/* ⏰ smart reminders */
router.get('/followups', requireAuth, async (req, res) => { try { res.json({ followups: await openFollowups(vid(req)) }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/followups/scan', requireAuth, async (req, res) => { try { await scanVendor(vid(req)); res.json({ followups: await openFollowups(vid(req)) }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/followups/:id', requireAuth, async (req, res) => {
  try {
    const action = ['done', 'mute', 'snooze'].includes(req.body?.action) ? req.body.action : 'done';
    res.json(await actOnFollowup(vid(req), { id: req.params.id, action, hours: req.body?.hours }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stages', requireAuth, async (req, res) => {
  try { res.json({ bookings: await listStages(vid(req)) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/stages/:leadId', requireAuth, async (req, res) => {
  try { const s = await stagesFor(vid(req), req.params.leadId); return s ? res.json(s) : res.status(404).json({ error: 'No such booking' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/stages/:leadId', requireAuth, async (req, res) => {
  try { const s = await setStages(vid(req), req.params.leadId, req.body || {}); return s ? res.json(s) : res.status(404).json({ error: 'No such booking' }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/stages/:leadId/messages', requireAuth, async (req, res) => {
  try { const m = await addOutsideMessage(vid(req), req.params.leadId, req.body || {}); return m ? res.json(m) : res.status(404).json({ error: 'No such booking' }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/stages/messages/:id', requireAuth, async (req, res) => {
  try { return (await deleteOutsideMessage(vid(req), req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/** 🧠 panel tasks that finished after Tornado stopped waiting — handed over with the next [Update] */
const OPERATOR_DONE = new Map();

/* ── 🎧 Deepgram ear (optional, Raj 2026-10-16): the phone streams its mic straight to Deepgram. The key stays
   here; the phone gets a 60-second token that only opens one stream. Owner-only (same list as the PC agent),
   because the key is the platform owner's own Deepgram account. ── */
const dgLimit = limit({ name: 'agent-dg', max: 20, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') });
router.get('/ear/deepgram-token', requireAuth, dgLimit, async (req, res) => {
  try {
    if (!(await pcAllowed(vid(req)))) return res.status(404).json({ error: 'Not available.' });
    const key = await getSetting('deepgram_api_key', '');
    if (!key) return res.status(404).json({ error: 'No Deepgram key in Super Admin settings.' });
    const r = await fetch('https://api.deepgram.com/v1/auth/grant', { method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl_seconds: 60 }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return res.status(502).json({ error: j.err_msg || `Deepgram ${r.status}` });
    res.json({ token: j.access_token, expires_in: j.expires_in });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* 💵 seconds of speech the phone sent to Deepgram → the same daily cost record the cost bar reads */
/* 🎙️ Gale (Raj, 2026-10-16): is the PC voice up, and its recorded greeting (made once, kept, saved on the phone) */
router.get('/ear/voice-status', requireAuth, async (req, res) => {
  if (!(await pcAllowed(vid(req)))) return res.json({ gale: false });
  res.json({ gale: await galeUp() });
});
const GALE_FILE = path.join(process.cwd(), '../storage/agent-voice/gale-greeting.pcm');
router.get('/ear/gale-greeting', requireAuth, async (req, res) => {
  try {
    if (!(await pcAllowed(vid(req)))) return res.status(404).end();
    let pcm = null, version = '';
    try { pcm = fs.readFileSync(GALE_FILE); version = fs.readFileSync(GALE_FILE + '.v', 'utf8'); } catch {}
    if (!pcm || req.query.fresh === '1') {
      const g = await galeGreetingPcm();
      if (!g) return pcm ? res.set('X-Version', version).type('application/octet-stream').send(pcm) : res.status(503).json({ error: 'PC voice is off' });
      fs.mkdirSync(path.dirname(GALE_FILE), { recursive: true });
      fs.writeFileSync(GALE_FILE, g.pcm); fs.writeFileSync(GALE_FILE + '.v', g.version);
      pcm = g.pcm; version = g.version;
    }
    res.set('X-Version', version).type('application/octet-stream').send(pcm);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ear/deepgram-usage', requireAuth, dgLimit, async (req, res) => {
  try {
    const v = Number(vid(req));
    const secs = Math.max(0, Math.min(3600, Number(req.body?.seconds) || 0));
    if (!secs || !(await pcAllowed(v))) return res.json({ ok: true, added_usd: 0 });
    const perMin = Number(await getSetting('ear_deepgram_per_min', '')) || 0.0048;
    const micro = Math.round((secs / 60) * perMin * 1e6);
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
    await prisma.agent_voice_usage.upsert({
      where: { vendor_id_day: { vendor_id: v, day } },
      create: { vendor_id: v, day, in_text: 0n, in_audio: 0n, out_text: 0n, out_audio: 0n, cost_micro: BigInt(micro) },
      update: { cost_micro: { increment: BigInt(micro) }, updated_at: new Date() },
    });
    res.json({ ok: true, added_usd: micro / 1e6 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 📜 the Rules tab: exactly what Tornado reads at the start (and re-reads every reply) ── */
router.get('/rules', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const tok = (x) => Math.round(String(x).length / 4);
    const setup = await liveSetup(v, { preview: true });                  // a preview: no wake-up is counted
    const rules = (await rulesFor(v)).map(r => ({ key: r.key, title: r.title, text: r.text, protected: r.protected, tokens: tok(r.text), live: /\{\{\w+\}\}/.test(r.text), updated_at: r.updated_at }));
    const decls = setup.tools.flatMap(t => t.functionDeclarations || []);
    const tools = decls.map(d => ({ name: d.name, description: d.description, tokens: tok(JSON.stringify(d)) }));
    const runs = await prisma.agent_training_runs.findMany({ where: { vendor_id: v }, orderBy: { id: 'desc' }, take: 6, select: { id: true, at: true, manual: true, status: true, summary: true, chars_before: true, chars_after: true, conversations: true, cost_usd: true, undone_at: true } });
    const history = await prisma.agent_rule_history.findMany({ where: { vendor_id: v }, orderBy: { id: 'desc' }, take: 20, select: { at: true, title: true, action: true, reason: true, run_id: true } });
    const rulesTokens = tok(setup.systemInstruction.parts[0].text), toolsTokens = tok(JSON.stringify(setup.tools));
    res.json({ rules, tools, runs, history, rules_tokens: rulesTokens, tools_tokens: toolsTokens, total_tokens: rulesTokens + toolsTokens });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/** 🧠 Train now (the same run the weekly schedule does). */
router.post('/rules/train', requireAuth, async (req, res) => {
  try { res.json(await runTraining(vid(req), { manual: true })); } catch (e) { res.status(500).json({ error: e.message }); }
});
/** ↩️ Undo the last training. */
router.post('/rules/undo', requireAuth, async (req, res) => {
  try { res.json(await undoLastTraining(vid(req))); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 📚 the knowledge base, as tabs on the Knowledge page ── */
router.get('/kb/sections', requireAuth, async (req, res) => {
  try {
    const counts = await prisma.agent_kb.groupBy({ by: ['section'], where: { vendor_id: vid(req) }, _count: { _all: true } });
    res.json({ sections: SECTIONS.map(([key, label]) => ({ key, label, count: counts.find(c => c.section === key)?._count._all || 0 })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/kb', requireAuth, async (req, res) => {
  try {
    const section = SECTIONS.some(s => s[0] === req.query.section) ? req.query.section : null;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const rows = await prisma.agent_kb.findMany({
      where: { vendor_id: vid(req), ...(section ? { section } : {}), ...(q ? { text: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: { updated_at: 'desc' }, take: 400, select: { id: true, section: true, text: true, updated_at: true },
    });
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/kb/refresh', requireAuth, async (req, res) => {
  try { res.json(await kbSync(vid(req))); } catch (e) { res.status(500).json({ error: e.message }); }
});

/** ⏰ The alerts still to come — the phone app schedules them as alarms that ring with the app closed. */
router.get('/reminders/alerts', requireAuth, async (req, res) => {
  try { res.json({ alerts: await alertsFor(vid(req), { from: new Date(), days: 45 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Tornado asked the app to use a tool; the app asks here, as the vendor.
 * Read tools answer with data; propose_… tools answer with a proposal the
 * owner must say yes to (the app also shows it as a card); confirm_action
 * runs it, cancel_action drops it. No tool can send a contract.
 */
const READ = new Set(TOOLS.map(t => t.name));
router.post('/tool', requireAuth, limit({ name: 'agent-tool', max: 120, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') }), async (req, res) => {
  try {
    const v = vid(req);
    let name = String(req.body?.name || '');
    let input = (req.body?.parameters && typeof req.body.parameters === 'object') ? req.body.parameters : {};
    // 🗂️ the voice model's one "panel" tool → the page's own tool (tornadoLean.js)
    if (name === 'panel') ({ name, input } = unpanel(input));
    // 👥 a client's name instead of a lead id — only when exactly ONE client matches; two or more → the list, and Tornado asks which
    if (takesClient(name) && input.client && !input.lead_id) {
      const q = String(input.client).trim(), digits = q.replace(/\D/g, '');
      const found = await prisma.leads.findMany({ where: { vendor_id: vid(req), archived_at: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 7 ? [{ phone: { contains: digits.slice(-7) } }] : [])] }, orderBy: { event_date: 'desc' }, take: 6, select: { id: true, name: true, event_type: true, event_date: true, location: true } });
      if (!found.length) return res.json({ result: { error: `No client called ${q}` } });
      if (found.length > 1) return res.json({ result: { which_one: found.map(l => `#${l.id} ${l.name} — ${l.event_type || 'event'}${l.event_date ? `, ${new Date(l.event_date).toDateString()}` : ''}${l.location ? `, ${l.location}` : ''}`), note: 'More than one client by that name — ask the owner which one, then call again with lead_id.' } });
      input = { ...input, lead_id: found[0].id };
    }
    ({ name, input } = unmerge(name, input));                    // 🧰 a merged voice tool → the original tool
    if (name === 'confirm_action') return res.json({ result: compactResult(await confirmAction(input.proposal_id, v, req.headers.authorization)) });
    if (name === 'cancel_action') { cancelAction(input.proposal_id, v); return res.json({ result: { ok: true, message: 'Cancelled — nothing was done.' } }); }
    let out;
    if (name === 'panel_task') {
      // 🧠 the panel operator: answers within ~25 s, or keeps going and reports as an [Update]
      const job = operate({ vendorId: v, userId: req.user?.id, task: input.task })   // 🧬 the operator makes its own one-vendor login
        .then(r => (r.ask ? { ...r, proposal: proposeOperatorCall(v, r.ask) } : r))
        .catch(e => ({ summary: `The panel task failed: ${e.message}` }));
      const quick = await Promise.race([job, new Promise(r => setTimeout(() => r(null), 25_000))]);
      if (quick) out = quick.proposal ? { proposal: quick.proposal, summary: quick.summary } : { summary: quick.summary };
      else {
        job.then(r => { const list = OPERATOR_DONE.get(v) || []; list.push(r.proposal ? `PANEL TASK needs his yes: ${r.ask.summary} (proposal_id ${r.proposal.id})` : `PANEL TASK DONE: ${r.summary}`); OPERATOR_DONE.set(v, list); });
        out = { status: 'working', note: 'It has started — tell him in a few words; the result comes as an [Update].' };
      }
    } else if (READ.has(name)) out = await runTool(name, input, v);
    else if (ACTIONS.has(name)) out = await runActionTool(name, input, v, req.headers.authorization);
    else return res.status(400).json({ error: `Unknown tool ${name}` });
    // 🧰 for the self-training only (never sent to Tornado) — kept 28 days
    prisma.agent_tool_log.create({ data: { vendor_id: v, tool: name.slice(0, 60), args: JSON.stringify(input).slice(0, 600), result: JSON.stringify(out ?? {}).slice(0, 600), error: Boolean(out?.error) } }).catch(() => {});
    // ⚡ a small internal change is done straight away — Tornado just says it's done
    if (out?.proposal && isSmallChange(out.proposal.id)) {
      const done = await confirmAction(out.proposal.id, v, req.headers.authorization);
      return res.json({ result: compactResult({ ...done, done_without_asking: true }) });
    }
    if (out?.proposal) {
      return res.json({
        proposal: out.proposal,
        // everything else the tool returned (the thread before a text, a heads-up) goes to Tornado too
        result: { ...Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'proposal')), proposal_id: out.proposal.id, about_to: out.proposal.title, details: out.proposal.details, next: /^(Text|Email|Send)/.test(out.proposal.title)
          ? 'NOT SENT. Read him the exact words of this message, word for word, then ask "Send it?". It must say what HE asked to say (his words and meaning), never what the client wants. Call confirm_action only after his clear yes; if he changes anything, draft it again.'
          : 'Tell the owner in one short sentence what you will do and ask if you should go ahead. Call confirm_action with this proposal_id only after a clear yes.' },
      });
    }
    res.json({ result: compactResult(out) });
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
