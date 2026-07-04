import express from 'express';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/invoices → all mine
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  const { rows } = v
    ? await query(`SELECT i.*, l.name AS client_name FROM invoices i JOIN leads l ON l.id=i.lead_id
                   WHERE i.vendor_id=$1 ORDER BY i.created_at DESC`, [v])
    : await query(`SELECT i.*, l.name AS client_name FROM invoices i JOIN leads l ON l.id=i.lead_id ORDER BY i.created_at DESC`);
  res.json({ invoices: rows });
});

// GET /api/invoices/lead/:leadId
router.get('/lead/:leadId', requireAuth, async (req, res) => {
  const { rows: leads } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.leadId]);
  if (!leads[0]) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role !== 'super_admin' && leads[0].vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await query('SELECT * FROM invoices WHERE lead_id=$1 ORDER BY created_at DESC', [req.params.leadId]);
  res.json({ invoices: rows });
});

// POST /api/invoices/lead/:leadId → generate (auto from package + payments, or custom items)
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { rows: leads } = await query('SELECT * FROM leads WHERE id=$1', [req.params.leadId]);
  const lead = leads[0];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });

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
  const { rows: cnt } = await query('SELECT COUNT(*)::int AS n FROM invoices WHERE vendor_id=$1', [lead.vendor_id]);
  const invoiceNumber = `INV-${lead.vendor_id}-${String(cnt[0].n + 1).padStart(4, '0')}`;

  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await query(
    `INSERT INTO invoices (vendor_id, lead_id, token, invoice_number, items, subtotal, discount, total, paid, balance, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [lead.vendor_id, lead.id, token, invoiceNumber, JSON.stringify(items), subtotal, discount, total, paid,
     Math.max(total - paid, 0), req.body.notes || null, paid >= total && total > 0 ? 'paid' : 'issued']);
  res.status(201).json({ invoice: rows[0] });
});

// DELETE /api/invoices/:id → void
router.delete('/:id', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT vendor_id FROM invoices WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });
  await query('DELETE FROM invoices WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// PUBLIC: GET /api/invoices/view/:token → client view
router.get('/view/:token', async (req, res) => {
  const { rows } = await query(
    `SELECT i.*, l.name AS client_name, l.email AS client_email, l.event_type, l.event_date, v.business_name
     FROM invoices i JOIN leads l ON l.id=i.lead_id JOIN vendors v ON v.id=i.vendor_id
     WHERE i.token=$1`, [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: rows[0] });
});

export default router;
