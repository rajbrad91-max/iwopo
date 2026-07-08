import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

async function leadFor(req, res, leadId) {
  const { rows } = await query('SELECT * FROM leads WHERE id=$1', [leadId]);
  const lead = rows[0];
  if (!lead) { res.status(404).json({ error: 'Lead not found' }); return null; }
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) {
    res.status(403).json({ error: 'Forbidden' }); return null;
  }
  return lead;
}

// 💰 Money summary for a lead: total, discount, deposit, paid, balance
export async function moneySummary(lead) {
  let total = lead.price_override != null ? Number(lead.price_override) : null;
  if (total == null && lead.package_snapshot) {
    const p = typeof lead.package_snapshot === 'string' ? JSON.parse(lead.package_snapshot) : lead.package_snapshot;
    const base = Number(p.base_price) || 0;
    const inclHrs = Number(p.included_hours) || 0;
    const perHr = Number(p.per_hour_price) || 0;
    const hrs = Number(lead.hours) || 0;
    const extra = hrs > inclHrs ? (hrs - inclHrs) * perHr : 0;
    total = base + extra;
  }
  if (total == null) total = 0;

  const discount = (Number(lead.discount_percent) || 0) / 100 * total;
  const finalTotal = Math.max(total - discount, 0);
  const deposit = (Number(lead.deposit_percent) || 0) / 100 * finalTotal;

  const { rows } = await query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE lead_id=$1', [lead.id]);
  const paid = Number(rows[0].paid);

  return {
    base_total: +total.toFixed(2),
    discount_percent: Number(lead.discount_percent) || 0,
    discount_amount: +discount.toFixed(2),
    final_total: +finalTotal.toFixed(2),
    deposit_percent: Number(lead.deposit_percent) || 0,
    deposit_amount: +deposit.toFixed(2),
    paid: +paid.toFixed(2),
    balance: +(finalTotal - paid).toFixed(2),
    web_payment_enabled: lead.web_payment_enabled !== false,
  };
}

// GET /api/payments/lead/:leadId → payments + summary
router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    const { rows: payments } = await query(
      'SELECT * FROM payments WHERE lead_id=$1 ORDER BY paid_at DESC', [lead.id]);
    res.json({ payments, summary: await moneySummary(lead) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payments/lead/:leadId → add payment
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { amount, method, note } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount required' });
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    await query(
      `INSERT INTO payments (vendor_id, lead_id, amount, method, note) VALUES ($1,$2,$3,$4,$5)`,
      [lead.vendor_id, lead.id, Number(amount), method || 'manual', note || null]);
    const { rows: payments } = await query(
      'SELECT * FROM payments WHERE lead_id=$1 ORDER BY paid_at DESC', [lead.id]);
    res.status(201).json({ payments, summary: await moneySummary(lead) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/payments/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    await query('DELETE FROM payments WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/payments/lead/:leadId/money → deposit % / discount % / price override
router.put('/lead/:leadId/money', requireAuth, async (req, res) => {
  const { deposit_percent, discount_percent, price_override } = req.body;
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    const { rows } = await query(
      `UPDATE leads SET
        deposit_percent=COALESCE($1,deposit_percent),
        discount_percent=COALESCE($2,discount_percent),
        price_override=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [deposit_percent ?? null, discount_percent ?? null,
       price_override === undefined ? lead.price_override : price_override, lead.id]);
    res.json({ lead: rows[0], summary: await moneySummary(rows[0]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/payments/lead/:leadId/web-payment → toggle online card payment
router.put('/lead/:leadId/web-payment', requireAuth, async (req, res) => {
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    const { rows } = await query(
      'UPDATE leads SET web_payment_enabled=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [!!req.body.enabled, lead.id]);
    res.json({ web_payment_enabled: rows[0].web_payment_enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
