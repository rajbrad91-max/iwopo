import express from 'express';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/contracts/lead/:leadId → contracts for a lead
router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const { rows: leads } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.leadId]);
    if (!leads[0]) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && leads[0].vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query('SELECT * FROM contracts WHERE lead_id=$1 ORDER BY created_at DESC', [req.params.leadId]);
    res.json({ contracts: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/contracts/lead/:leadId → create
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { title, body } = req.body;
  if (!body) return res.status(400).json({ error: 'Contract text required' });
  try {
    const { rows: leads } = await query('SELECT * FROM leads WHERE id=$1', [req.params.leadId]);
    const lead = leads[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await query(
      `INSERT INTO contracts (vendor_id, lead_id, token, title, body, status)
       VALUES ($1,$2,$3,$4,$5,'sent') RETURNING *`,
      [lead.vendor_id, lead.id, token, title || 'Service Agreement', body]);
    res.status(201).json({ contract: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/contracts/:id → void
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT vendor_id, status FROM contracts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    if (rows[0].status === 'signed') return res.status(400).json({ error: 'Signed contracts cannot be deleted (audit)' });
    await query('DELETE FROM contracts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: GET /api/contracts/sign/:token → view for signing
router.get('/sign/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.title, c.body, c.status, c.signed_name, c.signed_at, l.name AS client_name, v.business_name
       FROM contracts c JOIN leads l ON l.id=c.lead_id JOIN vendors v ON v.id=c.vendor_id
       WHERE c.token=$1`, [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: POST /api/contracts/sign/:token → client signs
router.post('/sign/:token', async (req, res) => {
  const { signed_name } = req.body;
  if (!signed_name || signed_name.trim().length < 2)
    return res.status(400).json({ error: 'Please type your full name to sign' });
  try {
    const { rows } = await query('SELECT * FROM contracts WHERE token=$1', [req.params.token]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (c.status === 'signed') return res.status(400).json({ error: 'Already signed ✅' });
    if (c.status === 'void') return res.status(400).json({ error: 'This contract is void' });
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
    const { rows: upd } = await query(
      `UPDATE contracts SET status='signed', signed_name=$1, signed_ip=$2, signed_at=NOW(), updated_at=NOW()
       WHERE id=$3 RETURNING *`, [signed_name.trim(), ip, c.id]);
    res.json({ contract: upd[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
