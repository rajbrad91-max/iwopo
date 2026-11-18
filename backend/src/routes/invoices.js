import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary, pickedOffer, QUOTE_FIELDS } from './payments.js';
import { quotePackage } from '../lib/packageQuote.js';
import { currencyFor } from '../lib/currencies.js';
import { resolveTimezone } from '../lib/timezones.js';
import { serverError } from '../lib/httpError.js';
import { mine } from '../lib/tenancy.js';
import { actingVendorId } from '../lib/vendorScope.js';   // 🔒 which vendor this request acts for

const router = express.Router();


// GET /api/invoices → all mine
router.get('/', requireAuth, async (req, res) => {
  try {
    const v = actingVendorId(req);
    const rows = await prisma.invoices.findMany({
      where: v ? { vendor_id: Number(v) } : {},   // 🔒 tenancy (super_admin may span vendors)
      orderBy: { created_at: 'desc' },
      include: { leads: { select: { name: true } } },
    });
    const invoices = rows.map(({ leads, ...i }) => ({ ...i, client_name: leads?.name ?? null }));
    res.json({ invoices });
  } catch (e) { serverError(res, e); }
});

// GET /api/invoices/lead/:leadId
router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.leadId);
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== actingVendorId(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const invoices = await prisma.invoices.findMany({
      where: { lead_id: leadId },
      orderBy: { created_at: 'desc' },
    });
    res.json({ invoices });
  } catch (e) { serverError(res, e); }
});

// POST /api/invoices/lead/:leadId → generate (auto from package + payments, or custom items)
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== actingVendorId(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    const invoice = await prisma.invoices.create({ data: await invoiceData(lead, req.body.items, req.body.notes) });
    res.status(201).json({ invoice });
  } catch (e) { serverError(res, e); }
});

/** an extra's line as the client saw it on their package: "Second photographer × 4 hr", "Prints × 3" */
function extraLabel(x) {
  if (x.unit === 'per_hour') return `${x.name} × ${x.qty} hr`;
  if (x.unit === 'per_guest') return `${x.name} × ${x.qty} guests`;
  return x.qty > 1 ? `${x.name} × ${x.qty}` : x.name;
}

/** 📅 the booking's pre-events, plainly: name, day, time and what it is for — no hours or guests (Raj, 2026-11-18) */
function preEventsOf(lead) {
  return (Array.isArray(lead.pre_events) ? lead.pre_events : [])
    .filter(e => e && String(e.name || '').trim())
    .map(e => ({ name: String(e.name).trim(), date: e.date || '', from: e.from || '', to: e.to || '', service: e.service || '' }));
}

/**
 * 🧾 What an invoice bills, frozen when it is made: the package the client picked as they saw it when choosing — its
 * line under the name, what it includes and its tax wording — then each extra as its own line, marked when the client
 * added it (Raj, 2026-11-18). A vendor's own total wins: one line for the services, as before. The package line also
 * carries the booking's pre-events, which its price covers.
 * Each item: { label, amount, kind: 'package' | 'extra', description?, inclusions?, tax?, events?, client_added? }.
 */
export async function invoiceItems(lead) {
  const when = `${lead.event_type || 'Event'}${lead.event_date ? ' (' + String(lead.event_date).slice(0, 10) + ')' : ''}`;
  const picked = lead.price_override == null
    ? pickedOffer(await prisma.lead_packages.findMany({ where: { lead_id: lead.id }, select: { ...QUOTE_FIELDS, description: true } }))   // 🔒 via the lead
    : null;
  if (picked) {
    const q = quotePackage(picked, lead);
    return [
      {
        kind: 'package', label: `${picked.name} — ${when}${q.price_mode === 'per_guest' ? ` · ${q.guests} guests` : ''}`, amount: q.base,
        description: picked.description || '',
        inclusions: Array.isArray(picked.inclusions) ? picked.inclusions : [],
        tax: { mode: picked.tax_mode || 'none', rate: picked.tax_rate == null ? null : Number(picked.tax_rate) },
        events: preEventsOf(lead),
      },
      ...q.extras.map(x => ({ kind: 'extra', label: extraLabel(x), amount: x.amount, client_added: x.mode === 'optional' })),
    ];
  }
  let pkgName = 'Services';
  if (lead.package_snapshot) {
    const p = typeof lead.package_snapshot === 'string' ? JSON.parse(lead.package_snapshot) : lead.package_snapshot;
    pkgName = p.name || 'Services';
  }
  return [{ kind: 'package', label: `${pkgName} — ${when}`, amount: (await moneySummary(lead)).base_total, events: preEventsOf(lead) }];
}

/** The invoice for a lead: from its package and payments, or the items given. Shared by the button and by booking. */
async function invoiceData(lead, givenItems, notes) {
    const money = await moneySummary(lead);
    const items = Array.isArray(givenItems) && givenItems.length ? givenItems : await invoiceItems(lead);
    const subtotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const discount = money.discount_amount;
    const total = Math.max(subtotal - discount, 0);
    const paid = money.paid;

    // invoice number: INV-<vendor>-<seq>
    const n = await prisma.invoices.count({ where: { vendor_id: lead.vendor_id } });
    const invoiceNumber = `INV-${lead.vendor_id}-${String(n + 1).padStart(4, '0')}`;

    return {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead
        lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        invoice_number: invoiceNumber,
        items,                                  // Json column — Prisma serializes it
        subtotal, discount, total, paid,
        balance: Math.max(total - paid, 0),
        notes: notes || null,
        status: paid >= total && total > 0 ? 'paid' : 'issued',
      };
}

/**
 * 🧾 F2 (Raj, 2026-10-30): a lead that becomes booked gets its invoice made automatically — ready in Contracts &
 * Invoices — but it is NEVER sent: the vendor decides if and when the client gets it. One per lead; a lead that
 * already has one (made by hand or before) is left alone. Never throws: a booking must not fail over its invoice.
 */
export async function ensureInvoice(leadId) {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(leadId) } });
    if (!lead || lead.status !== 'booked') return null;
    const has = await prisma.invoices.findFirst({ where: { lead_id: lead.id }, select: { id: true } });
    if (has) return null;
    return await prisma.invoices.create({ data: await invoiceData(lead, null, null) });
  } catch (e) { console.error('auto-invoice failed for lead', leadId, e.message); return null; }
}

/**
 * 💵 A lead's invoices follow the money (Raj, 2026-11-18): the lines stay as booked, but what was paid and what is
 * left are brought up to date after every payment recorded or removed — before, they stayed as they were the day the
 * invoice was made, so a second instalment never showed.
 */
export async function refreshInvoicePaid(leadId) {
  const agg = await prisma.payments.aggregate({ where: { lead_id: Number(leadId) }, _sum: { amount: true } });
  const paid = Number(agg._sum.amount || 0);
  const invoices = await prisma.invoices.findMany({ where: { lead_id: Number(leadId) }, select: { id: true, total: true } });   // 🔒 via the lead
  for (const inv of invoices) {
    const total = Number(inv.total) || 0;
    await prisma.invoices.update({
      where: { id: inv.id },
      data: { paid, balance: Math.max(total - paid, 0), status: paid >= total && total > 0 ? 'paid' : 'issued' },
    });
  }
}

// DELETE /api/invoices/:id → void
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.invoices.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && inv.vendor_id !== actingVendorId(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.invoices.delete({ where: { id, ...mine(actingVendorId(req)) } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// PUBLIC: GET /api/invoices/view/:token → client view
router.get('/view/:token', async (req, res) => {
  try {
    const inv = await prisma.invoices.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      include: {
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    // 💵 each payment, so the invoice is the client's receipt too (Raj, 2026-11-18)
    const payments = await prisma.payments.findMany({
      where: { lead_id: inv.lead_id },          // 🔒 the invoice's own lead
      orderBy: [{ paid_at: 'asc' }, { id: 'asc' }],
      select: { paid_at: true, method: true, amount: true },
    });

    // the vendor's currency, resolved the same way everywhere else does it
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: inv.vendor_id }, select: { currency: true, timezone: true, time_format: true },
    });
    const vrow = await prisma.vendors.findUnique({
      where: { id: inv.vendor_id }, select: { country: true },
    });
    const invCurrency = currencyFor(vset?.currency, vrow?.country);
    const zone = resolveTimezone(vset?.timezone, vrow?.country);

    const { leads, vendors, ...rest } = inv;
    res.json({
      invoice: {
        ...rest,
        client_name: leads?.name ?? null,
        client_email: leads?.email ?? null,
        event_type: leads?.event_type ?? null,
        event_date: leads?.event_date ?? null,
        business_name: vendors?.business_name ?? null,
        currency: invCurrency,
        timezone: zone.tz || '',
        time_format: vset?.time_format === '24h' ? '24h' : '12h',
        // the vendor's own mark, so the client sees one business across the
        // portal, the contract and this invoice rather than three anonymous pages
        logo_path: vendors?.logo_path ?? null,
        payments,
      },
    });
  } catch (e) { serverError(res, e); }
});

export default router;
