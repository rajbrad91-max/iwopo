import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/bookings → booked leads (calendar-ready)
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    // 🔒 tenancy: a vendor is always filtered to their own leads; only a super_admin
    // with no vendor_id selected sees across tenants (same rule as before).
    const rows = await prisma.leads.findMany({
      where: v ? { vendor_id: Number(v), status: 'booked' } : { status: 'booked' },
      orderBy: { event_date: { sort: 'asc', nulls: 'last' } },
    });
    const bookings = [];
    for (const l of rows) bookings.push({ ...l, money: await moneySummary(l) });
    res.json({ bookings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 📋 GET /api/bookings/:leadId — everything the booking page needs, in one call.
 *
 * A booking is the same record as the lead, read at a different moment: the sale
 * is done, so this page is for running the day rather than editing the deal.
 * It returns the details, the money, every package that was offered with the
 * chosen one marked, the signed contract, invoices, the assigned crew and the
 * roster to assign from — so the page doesn't stitch seven requests together.
 *
 * Only a confirmed booking has a page, matching how the list is built.
 */
router.get('/:leadId', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.leadId);
    const lead = await prisma.leads.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) {
      return res.status(403).json({ error: 'Forbidden' });           // 🔒 tenancy
    }
    if (lead.status !== 'booked') {
      return res.status(409).json({ error: 'That lead is not a confirmed booking yet' });
    }

    const [packages, payments, contract, invoices, assigned, roster, money] = await Promise.all([
      prisma.lead_packages.findMany({ where: { lead_id: id }, orderBy: { id: 'asc' } }),
      prisma.payments.findMany({ where: { lead_id: id }, orderBy: { id: 'desc' } }),
      prisma.contracts.findFirst({
        where: { lead_id: id, status: 'signed' },
        orderBy: { id: 'desc' },
        select: { id: true, title: true, token: true, signed_at: true, signed_name: true },
      }),
      prisma.invoices.findMany({
        where: { lead_id: id },
        orderBy: { id: 'desc' },
        select: { id: true, token: true, invoice_number: true, total: true, paid: true, balance: true, created_at: true },
      }),
      prisma.lead_crew.findMany({ where: { lead_id: id }, orderBy: { id: 'asc' } }),
      prisma.crew_members.findMany({
        where: { vendor_id: lead.vendor_id },                       // 🔒 tenancy
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true },
      }),
      moneySummary(lead),
    ]);

    // name each assignment from the roster so the page needs no second lookup
    const byId = new Map(roster.map(c => [c.id, c]));
    const crew = assigned.map(a => ({
      ...a,
      name: byId.get(a.crew_member_id)?.name ?? 'Removed member',
      member_role: byId.get(a.crew_member_id)?.role ?? null,
    }));

    res.json({ booking: lead, money, packages, payments, contract, invoices, crew, roster });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/bookings/:leadId/status → new | contacted | quoted | booked | completed | cancelled
const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'completed', 'cancelled'];
router.put('/:leadId/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const id = Number(req.params.leadId);
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const own = await prisma.leads.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy
    const lead = await prisma.leads.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
    res.json({ lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
