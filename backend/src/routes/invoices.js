import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/invoices → all mine
router.get('/', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const rows = await prisma.invoices.findMany({
      where: v ? { vendor_id: Number(v) } : {},   // 🔒 tenancy (super_admin may span vendors)
      orderBy: { created_at: 'desc' },
      include: { leads: { select: { name: true } } },
    });
    const invoices = rows.map(({ leads, ...i }) => ({ ...i, client_name: leads?.name ?? null }));
    res.json({ invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/invoices/lead/:leadId
router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.leadId);
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const invoices = await prisma.invoices.findMany({
      where: { lead_id: leadId },
      orderBy: { created_at: 'desc' },
    });
    res.json({ invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/invoices/lead/:leadId → generate (auto from package + payments, or custom items)
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    const money = await moneySummary(lead);
    let items = req.body.items;
    if (!Array.isArray(items) || !items.length) {
      let pkgName = 'Services';
      if (lead.package_snapshot) {
        const p = typeof lead.package_snapshot === 'string' ? JSON.parse(lead.package_snapshot) : lead.package_snapshot;
        pkgName = p.name || 'Services';
      }
      items = [{ label: `${pkgName} — ${lead.event_type || 'Event'}${lead.event_date ? ' (' + String(lead.event_date).slice(0, 10) + ')' : ''}`, amount: money.base_total }];
    }
    const subtotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const discount = money.discount_amount;
    const total = Math.max(subtotal - discount, 0);
    const paid = money.paid;

    // invoice number: INV-<vendor>-<seq>
    const n = await prisma.invoices.count({ where: { vendor_id: lead.vendor_id } });
    const invoiceNumber = `INV-${lead.vendor_id}-${String(n + 1).padStart(4, '0')}`;

    const invoice = await prisma.invoices.create({
      data: {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead
        lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        invoice_number: invoiceNumber,
        items,                                  // Json column — Prisma serializes it
        subtotal, discount, total, paid,
        balance: Math.max(total - paid, 0),
        notes: req.body.notes || null,
        status: paid >= total && total > 0 ? 'paid' : 'issued',
      },
    });
    res.status(201).json({ invoice });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/invoices/:id → void
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.invoices.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && inv.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.invoices.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: GET /api/invoices/view/:token → client view
router.get('/view/:token', async (req, res) => {
  try {
    const inv = await prisma.invoices.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      include: {
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true } },
      },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const { leads, vendors, ...rest } = inv;
    res.json({
      invoice: {
        ...rest,
        client_name: leads?.name ?? null,
        client_email: leads?.email ?? null,
        event_type: leads?.event_type ?? null,
        event_date: leads?.event_date ?? null,
        business_name: vendors?.business_name ?? null,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
