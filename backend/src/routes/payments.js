import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// 🔒 tenancy gate: load a lead and refuse it if it isn't this vendor's
async function leadFor(req, res, leadId) {
  const lead = await prisma.leads.findUnique({ where: { id: Number(leadId) } });
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

  const agg = await prisma.payments.aggregate({
    where: { lead_id: lead.id },
    _sum: { amount: true },
  });
  const paid = Number(agg._sum.amount || 0);   // Decimal → number, same as the old SUM

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
    const payments = await prisma.payments.findMany({
      where: { lead_id: lead.id },
      orderBy: { paid_at: 'desc' },
    });
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
    await prisma.payments.create({
      data: {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead, never the body
        lead_id: lead.id,
        amount: Number(amount),
        method: method || 'manual',
        note: note || null,
      },
    });
    const payments = await prisma.payments.findMany({
      where: { lead_id: lead.id },
      orderBy: { paid_at: 'desc' },
    });
    res.status(201).json({ payments, summary: await moneySummary(lead) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/payments/:id
/* ✅ PUT /api/payments/lead/:leadId/confirm-claim
 *
 * The client pressed "I've paid" in their portal; this is the vendor saying the
 * money actually arrived. Recording it here rather than when the client claims
 * is the whole point — nothing counts as paid on a client's word.
 *
 * Records a real payment for the amount the vendor confirms, then clears the
 * claim so the prompt disappears. Dismissing without payment (the client was
 * mistaken) just clears the flag.
 */
router.put('/lead/:leadId/confirm-claim', requireAuth, async (req, res) => {
  const { amount, method, note, dismiss } = req.body;
  try {
    const lead = await leadFor(req, res, req.params.leadId);   // 🔒 tenancy + 403
    if (!lead) return;
    if (!lead.payment_claimed_at) return res.status(400).json({ error: 'No payment claim on this lead' });

    if (!dismiss) {
      if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount required' });
      await prisma.payments.create({
        data: {
          vendor_id: lead.vendor_id,           // 🔒 stamped from the owning lead, never the body
          lead_id: lead.id,
          amount: Number(amount),
          method: method || 'direct',
          note: note || 'Confirmed from client claim',
        },
      });
    }

    await prisma.leads.update({
      where: { id: lead.id },
      data: { payment_claimed_at: null, updated_at: new Date() },
    });

    const payments = await prisma.payments.findMany({
      where: { lead_id: lead.id },
      orderBy: { paid_at: 'desc' },
    });
    const fresh = await prisma.leads.findUnique({ where: { id: lead.id } });
    res.json({ payments, summary: await moneySummary(fresh) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pay = await prisma.payments.findUnique({ where: { id } });
    if (!pay) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && pay.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy
    await prisma.payments.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/payments/lead/:leadId/money → deposit % / discount % / price override
router.put('/lead/:leadId/money', requireAuth, async (req, res) => {
  const { deposit_percent, discount_percent, price_override } = req.body;
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    // COALESCE($n, col): only overwrite what was supplied. price_override is
    // deliberately settable to null (clearing a manual price).
    const data = { updated_at: new Date() };
    if (deposit_percent !== undefined && deposit_percent !== null) data.deposit_percent = Number(deposit_percent);
    if (discount_percent !== undefined && discount_percent !== null) data.discount_percent = Number(discount_percent);
    if (price_override !== undefined) {
      data.price_override = (price_override === null || price_override === '') ? null : Number(price_override);
    }
    const updated = await prisma.leads.update({ where: { id: lead.id }, data });
    res.json({ lead: updated, summary: await moneySummary(updated) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/payments/lead/:leadId/web-payment → toggle online card payment
router.put('/lead/:leadId/web-payment', requireAuth, async (req, res) => {
  try {
    const lead = await leadFor(req, res, req.params.leadId);
    if (!lead) return;
    const updated = await prisma.leads.update({
      where: { id: lead.id },
      data: { web_payment_enabled: !!req.body.enabled, updated_at: new Date() },
    });
    res.json({ web_payment_enabled: updated.web_payment_enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
