import express from 'express';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

const KNOWLEDGE_FIELDS = [
  'business_name', 'tagline', 'service_area', 'contact', 'hours',
  'services', 'packages', 'faqs', 'policies', 'notes',
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
    const { rows } = await query(
      `SELECT s.vendor_id, s.active, s.share_token, s.access_code, s.subscribed_at,
              v.business_name, v.email,
              (k.vendor_id IS NOT NULL) AS has_knowledge
       FROM chatbot_subscribers s
       JOIN vendors v ON v.id = s.vendor_id
       LEFT JOIN chatbot_knowledge k ON k.vendor_id = s.vendor_id
       ORDER BY s.subscribed_at DESC`);
    res.json({ subscribers: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ➕ add a subscriber (vendor subscribes to the chatbot)
router.post('/subscribers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { vendor_id } = req.body;
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });
  try {
    const token = crypto.randomBytes(8).toString('hex');
    await query(
      `INSERT INTO chatbot_subscribers (vendor_id, share_token) VALUES ($1,$2)
       ON CONFLICT (vendor_id) DO NOTHING`, [vendor_id, token]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔌 toggle active / inactive
router.put('/subscribers/:vendorId/active', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE chatbot_subscribers SET active=$1 WHERE vendor_id=$2 RETURNING active',
      [!!req.body.active, req.params.vendorId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not a subscriber' });
    res.json({ active: rows[0].active });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🗑️ remove a subscriber
router.delete('/subscribers/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await query('DELETE FROM chatbot_subscribers WHERE vendor_id=$1', [req.params.vendorId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔑 set the access code for the shareable fill-in link
router.put('/subscribers/:vendorId/code', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE chatbot_subscribers SET access_code=$1 WHERE vendor_id=$2 RETURNING access_code, share_token',
      [(req.body.access_code || '').trim() || null, req.params.vendorId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not a subscriber' });
    res.json({ access_code: rows[0].access_code, share_token: rows[0].share_token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📚 knowledge — read (super admin)
router.get('/knowledge/:vendorId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { rows: sub } = await query(
      `SELECT s.share_token, s.access_code, s.active, v.business_name
       FROM chatbot_subscribers s JOIN vendors v ON v.id=s.vendor_id WHERE s.vendor_id=$1`,
      [req.params.vendorId]);
    if (!sub[0]) return res.status(404).json({ error: 'Not a subscriber' });
    const { rows } = await query('SELECT * FROM chatbot_knowledge WHERE vendor_id=$1', [req.params.vendorId]);
    res.json({
      knowledge: rows[0] || emptyKnowledge(Number(req.params.vendorId)),
      subscriber: sub[0],
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
  const vals = KNOWLEDGE_FIELDS.map(f => (body[f] ?? '').toString());
  const cols = KNOWLEDGE_FIELDS.join(', ');
  const params = KNOWLEDGE_FIELDS.map((_, i) => `$${i + 2}`).join(', ');
  const updates = KNOWLEDGE_FIELDS.map((f, i) => `${f}=$${i + 2}`).join(', ');
  await query(
    `INSERT INTO chatbot_knowledge (vendor_id, ${cols}) VALUES ($1, ${params})
     ON CONFLICT (vendor_id) DO UPDATE SET ${updates}, updated_at=now()`,
    [vendorId, ...vals]);
}

// ── 🌐 PUBLIC (vendor fills their own knowledge via share link) ──

// meta for the fill-in page (does it exist? is a code required?)
router.get('/fill/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.vendor_id, s.access_code, s.active, v.business_name
       FROM chatbot_subscribers s JOIN vendors v ON v.id=s.vendor_id WHERE s.share_token=$1`,
      [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Link not found' });
    res.json({ business_name: rows[0].business_name, needs_code: !!rows[0].access_code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// unlock with the access code → returns the current knowledge to edit
router.post('/fill/:token/unlock', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT vendor_id, access_code FROM chatbot_subscribers WHERE share_token=$1', [req.params.token]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'Link not found' });
    if (s.access_code && (req.body.code || '') !== s.access_code) {
      return res.status(401).json({ error: 'Wrong access code' });
    }
    const { rows: k } = await query('SELECT * FROM chatbot_knowledge WHERE vendor_id=$1', [s.vendor_id]);
    res.json({ knowledge: k[0] || emptyKnowledge(s.vendor_id), fields: KNOWLEDGE_FIELDS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// vendor submits their filled knowledge
router.post('/fill/:token', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT vendor_id, access_code FROM chatbot_subscribers WHERE share_token=$1', [req.params.token]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'Link not found' });
    if (s.access_code && (req.body.code || '') !== s.access_code) {
      return res.status(401).json({ error: 'Wrong access code' });
    }
    await saveKnowledge(s.vendor_id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
