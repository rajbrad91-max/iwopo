import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { generateReply, isActiveSubscriber } from '../lib/tasveer.js';

const router = express.Router();

// 🚦 simple in-memory rate limit: 30 messages / hour / (ip+session)
const hits = new Map();
const RATE_MAX = 30;
const RATE_WINDOW = 3600 * 1000;
function rateLimited(key) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.start > RATE_WINDOW) { hits.set(key, { start: now, n: 1 }); return false; }
  rec.n++;
  return rec.n > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > RATE_WINDOW) hits.delete(k);
}, RATE_WINDOW);

const KNOWLEDGE_FIELDS = [
  'business_name', 'tagline', 'about_team', 'service_area', 'contact', 'hours',
  'services', 'languages', 'delivery_time', 'packages', 'faqs', 'policies',
  'avoid_topics', 'tone_notes', 'notes',
];

function emptyKnowledge(vendorId) {
  const k = { vendor_id: vendorId };
  for (const f of KNOWLEDGE_FIELDS) k[f] = '';
  return k;
}

// ── 🔒 SUPER ADMIN ───────────────────────────────────────

// 📋 subscribers list (only vendors who subscribed to the chatbot)
router.get('/subscribers', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await prisma.chatbot_subscribers.findMany({
      orderBy: { subscribed_at: 'desc' },
      include: { vendors: { select: { business_name: true, email: true } } },
    });
    // which of these vendors already have a knowledge row?
    const known = await prisma.chatbot_knowledge.findMany({ select: { vendor_id: true } });
    const knownSet = new Set(known.map(k => k.vendor_id));
    const subscribers = rows.map(({ vendors, ...s }) => ({
      vendor_id: s.vendor_id, active: s.active, share_token: s.share_token,
      access_code: s.access_code, subscribed_at: s.subscribed_at,
      business_name: vendors?.business_name ?? null,
      email: vendors?.email ?? null,
      has_knowledge: knownSet.has(s.vendor_id),
    }));
    res.json({ subscribers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ➕ add a subscriber (vendor subscribes to the chatbot)
router.post('/subscribers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { vendor_id } = req.body;
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });
  try {
    // ON CONFLICT (vendor_id) DO NOTHING — leave an existing subscription alone
    await prisma.chatbot_subscribers.upsert({
      where: { vendor_id: Number(vendor_id) },
      update: {},
      create: { vendor_id: Number(vendor_id), share_token: crypto.randomBytes(8).toString('hex') },
    });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔌 toggle active / inactive
router.put('/subscribers/:vendorId/active', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { count } = await prisma.chatbot_subscribers.updateMany({
      where: { vendor_id: Number(req.params.vendorId) },
      data: { active: !!req.body.active },
    });
    if (!count) return res.status(404).json({ error: 'Not a subscriber' });
    res.json({ active: !!req.body.active });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🗑️ remove a subscriber
router.delete('/subscribers/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.chatbot_subscribers.deleteMany({ where: { vendor_id: Number(req.params.vendorId) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔑 set the access code for the shareable fill-in link
router.put('/subscribers/:vendorId/code', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const { count } = await prisma.chatbot_subscribers.updateMany({
      where: { vendor_id: vendorId },
      data: { access_code: (req.body.access_code || '').trim() || null },
    });
    if (!count) return res.status(404).json({ error: 'Not a subscriber' });
    const s = await prisma.chatbot_subscribers.findUnique({
      where: { vendor_id: vendorId },
      select: { access_code: true, share_token: true },
    });
    res.json({ access_code: s.access_code, share_token: s.share_token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📚 knowledge — read (super admin)
router.get('/knowledge/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const sub = await prisma.chatbot_subscribers.findUnique({
      where: { vendor_id: vendorId },
      select: { share_token: true, access_code: true, active: true, vendors: { select: { business_name: true } } },
    });
    if (!sub) return res.status(404).json({ error: 'Not a subscriber' });
    const knowledge = await prisma.chatbot_knowledge.findUnique({ where: { vendor_id: vendorId } });
    const { vendors, ...subRest } = sub;
    res.json({
      knowledge: knowledge || emptyKnowledge(vendorId),
      subscriber: { ...subRest, business_name: vendors?.business_name ?? null },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📚 knowledge — save (super admin edit)
router.put('/knowledge/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await saveKnowledge(req.params.vendorId, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// shared upsert used by both super-admin edit and the public fill-in form
async function saveKnowledge(vendorId, body) {
  const data = {};
  for (const f of KNOWLEDGE_FIELDS) data[f] = (body[f] ?? '').toString();
  await prisma.chatbot_knowledge.upsert({
    where: { vendor_id: Number(vendorId) },
    update: { ...data, updated_at: new Date() },
    create: { vendor_id: Number(vendorId), ...data },
  });
}

// ── 🌐 PUBLIC (vendor fills their own knowledge via share link) ──

// meta for the fill-in page (does it exist? is a code required?)
router.get('/fill/:token', async (req, res) => {
  try {
    const s = await prisma.chatbot_subscribers.findFirst({
      where: { share_token: req.params.token },   // the token is the access key
      select: { vendor_id: true, access_code: true, active: true, vendors: { select: { business_name: true } } },
    });
    if (!s) return res.status(404).json({ error: 'Link not found' });
    res.json({ business_name: s.vendors?.business_name ?? null, needs_code: !!s.access_code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// unlock with the access code → returns the current knowledge to edit
router.post('/fill/:token/unlock', async (req, res) => {
  try {
    const s = await prisma.chatbot_subscribers.findFirst({
      where: { share_token: req.params.token },
      select: { vendor_id: true, access_code: true },
    });
    if (!s) return res.status(404).json({ error: 'Link not found' });
    if (s.access_code && (req.body.code || '') !== s.access_code) {
      return res.status(401).json({ error: 'Wrong access code' });
    }
    const k = await prisma.chatbot_knowledge.findUnique({ where: { vendor_id: s.vendor_id } });
    res.json({ knowledge: k || emptyKnowledge(s.vendor_id), fields: KNOWLEDGE_FIELDS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// vendor submits their filled knowledge
router.post('/fill/:token', async (req, res) => {
  try {
    const s = await prisma.chatbot_subscribers.findFirst({
      where: { share_token: req.params.token },
      select: { vendor_id: true, access_code: true },
    });
    if (!s) return res.status(404).json({ error: 'Link not found' });
    if (s.access_code && (req.body.code || '') !== s.access_code) {
      return res.status(401).json({ error: 'Wrong access code' });
    }
    await saveKnowledge(s.vendor_id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 💰 cost + usage per vendor (super admin)
router.get('/costs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const grouped = await prisma.chatbot_usage.groupBy({
      by: ['vendor_id'],
      _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      _count: { _all: true },
      _max: { created_at: true },
    });
    // attach the business name for each vendor in the roll-up
    const names = await prisma.vendors.findMany({
      where: { id: { in: grouped.map(g => g.vendor_id) } },
      select: { id: true, business_name: true },
    });
    const nameBy = new Map(names.map(v => [v.id, v.business_name]));
    const vendors = grouped
      .map(g => ({
        vendor_id: g.vendor_id,
        business_name: nameBy.get(g.vendor_id) ?? null,
        input_tokens: Number(g._sum.input_tokens || 0),
        output_tokens: Number(g._sum.output_tokens || 0),
        cost_usd: Number(g._sum.cost_usd || 0).toFixed(4),
        messages: g._count._all,
        last_used: g._max.created_at,
      }))
      .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd));
    const total = vendors.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    res.json({ vendors, total_usd: Number(total.toFixed(4)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ❓ pending (unanswered) questions for a vendor
router.get('/pending/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const pending = await prisma.chatbot_pending.findMany({
      where: { vendor_id: Number(req.params.vendorId), status: 'pending' },
      orderBy: { id: 'desc' },
    });
    res.json({ pending });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/pending/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.chatbot_pending.update({
      where: { id: Number(req.params.id) },
      data: { answer: req.body.answer || null, status: req.body.dismiss ? 'dismissed' : 'answered' },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📨 visitor messages left for a vendor
router.get('/messages/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const messages = await prisma.chatbot_messages.findMany({
      where: { vendor_id: Number(req.params.vendorId) },
      orderBy: { id: 'desc' },
      take: 100,
    });
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/messages/:id/read', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.chatbot_messages.update({
      where: { id: Number(req.params.id) },
      data: { status: 'read' },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 🌐 PUBLIC CHAT (the widget talks to this) ──

router.post('/chat/:vendorId', async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId, 10);
    if (!vendorId) return res.status(400).json({ error: 'Bad vendor' });

    if (!(await isActiveSubscriber(vendorId))) {
      return res.status(403).json({ error: 'Chat is not available.' });
    }

    const text = (req.body.message || '').toString().slice(0, 2000).trim();
    if (!text) return res.status(400).json({ error: 'Empty message' });
    const session = (req.body.session || '').toString().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'anon';
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-40) : [];

    const ip = (req.ip || 'unknown').toString();
    if (rateLimited(`${ip}:${session}:${vendorId}`)) {
      return res.json({ reply: "Thanks for all the questions! For anything more, please reach out to the team directly.", done: true });
    }

    const vendor = await prisma.vendors.findUnique({ where: { id: vendorId }, select: { business_name: true } });
    const out = await generateReply(vendorId, vendor?.business_name || '', text, history, session);
    res.json({ reply: out.reply, lead_saved: out.lead_saved, done: false });
  } catch (e) {
    console.error('chat error', e.message);
    res.status(500).json({ reply: "Sorry, something went wrong. Please try again." });
  }
});

// ── 🧑‍💼 VENDOR (their own chatbot only) ──

function vid(req) { return req.user.vendor_id; }

// am I subscribed? (drives the panel: history vs upsell)
router.get('/my/status', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.chatbot_subscribers.findUnique({
      where: { vendor_id: vid(req) },             // 🔒 tenancy — own row only
      select: { active: true },
    });
    res.json({ subscribed: !!sub, active: !!sub?.active });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 💬 my chat history — grouped into conversations (last 30 days only)
router.get('/my/history', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const sub = await prisma.chatbot_subscribers.findUnique({
      where: { vendor_id: v },                    // 🔒 tenancy
      select: { active: true },
    });
    if (!sub) return res.status(403).json({ error: 'Not subscribed' });

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);   // interval '30 days'
    const rows = await prisma.chatbot_transcripts.findMany({
      where: { vendor_id: v, created_at: { gt: since } },          // 🔒 tenancy
      select: { session: true, role: true, content: true, created_at: true },
      orderBy: [{ session: 'asc' }, { id: 'asc' }],
    });

    // group rows into conversations keyed by session
    const bySession = new Map();
    for (const r of rows) {
      if (!bySession.has(r.session)) bySession.set(r.session, { session: r.session, started_at: r.created_at, messages: [] });
      const c = bySession.get(r.session);
      c.messages.push({ role: r.role, content: r.content, at: r.created_at });
      c.last_at = r.created_at;
    }
    const conversations = [...bySession.values()].sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
    res.json({ conversations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
