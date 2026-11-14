// 📦 Per-lead packages — the offer a client actually receives.
//
// When a vendor sends a folder, its packages are COPIED onto the lead. From
// then on the lead owns them: the vendor can retitle, reprice and reword each
// one for that client without touching their master list, and the offer is
// preserved exactly as sent even if the master is later edited or deleted.
// This mirrors the model PerfectPoses has run in production for years.
//
// Once emailed, the set is locked — a vendor shouldn't be able to quietly
// change what a client is looking at. An explicit unlock reopens it.
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { serverError } from '../lib/httpError.js';
import { mine } from '../lib/tenancy.js';
import { actingVendorId } from '../lib/vendorScope.js';   // 🔒 which vendor this request acts for
import { quotePackage, extrasForLead, cleanLeadExtras, cleanPricing } from '../lib/packageQuote.js';
import { rebuildUnsignedContract, pickedOffer } from './payments.js';

const router = express.Router();


/** Load a lead this user is allowed to touch, or null. 🔒 */
async function ownedLead(req, leadId) {
  const lead = await prisma.leads.findUnique({
    where: { id: Number(leadId) },
    select: { id: true, vendor_id: true, packages_sent_at: true, status: true, hours: true, guests: true },
  });
  if (!lead) return null;
  if (req.user.role !== 'super_admin' && lead.vendor_id !== actingVendorId(req, { body: false })) return null;
  return lead;
}

/** 📦 Each package with its price for THIS client worked out (lib/packageQuote.js), so the panel never prices on its own. */
const withQuote = (lead) => (p) => ({ ...p, quote: quotePackage(p, lead) });
async function offerOf(lead) {
  const rows = await prisma.lead_packages.findMany({
    where: { lead_id: lead.id },                        // 🔒 tenancy via the lead
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  return rows.map(withQuote(lead));
}

/** 💸 An unsigned contract quotes the package in force; redraw it after that package (or the offer) changes. */
async function redrawIfInForce(leadId, pkgId) {
  const rows = await prisma.lead_packages.findMany({ where: { lead_id: leadId }, select: { id: true, is_selected: true } });   // 🔒 via the lead
  const inForce = pickedOffer(rows);
  if (!inForce || (pkgId && inForce.id !== pkgId)) return;   // nothing chosen yet: the pick itself builds the figures
  const full = await prisma.leads.findUnique({ where: { id: leadId } });
  if (full) await rebuildUnsignedContract(full);
}

// GET /api/lead-packages/:leadId → this lead's packages
router.get('/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ packages: await offerOf(lead), locked: !!lead.packages_sent_at, sent_at: lead.packages_sent_at });
  } catch (e) { serverError(res, e); }
});

// POST /api/lead-packages/:leadId/load → copy a folder's packages onto the lead.
// Replaces whatever was there: this is "load these packages for this client",
// not "append". Refuses while locked so a sent offer can't change underneath.
router.post('/:leadId/load', requireAuth, async (req, res) => {
  const { template_id } = req.body;
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.packages_sent_at) {
      return res.status(423).json({ error: 'These packages have been sent. Unlock them first to make changes.' });
    }

    const tpl = await prisma.package_templates.findFirst({
      where: { id: Number(template_id), vendor_id: lead.vendor_id },   // 🔒 tenancy
      select: { id: true, name: true, extras: true, tax_mode: true, tax_rate: true },
    });
    if (!tpl) return res.status(404).json({ error: 'Package folder not found' });

    const masters = await prisma.vendor_packages.findMany({
      where: { template_id: tpl.id, vendor_id: lead.vendor_id },       // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    if (!masters.length) return res.status(400).json({ error: 'That folder has no packages yet' });

    // one transaction: the lead never sits with half an offer on it
    await prisma.$transaction([
      prisma.lead_packages.deleteMany({ where: { lead_id: lead.id, ...mine(actingVendorId(req, { body: false })) } }),
      prisma.lead_packages.createMany({
        data: masters.map((m, i) => ({
          lead_id: lead.id,
          vendor_id: lead.vendor_id,                    // 🔒 stamped from the lead, not the request
          source_package_id: m.id,
          name: m.name,
          price: m.base_price ?? 0,
          inclusions: m.inclusions ?? [],
          sort_order: m.sort_order ?? i,
          // 📦 everything that prices it travels too; the extra-hour rate only prices pre-events added as extras
          price_mode: m.price_mode, min_guests: m.min_guests, per_hour_price: m.per_hour_price,
          description: m.description, badge: m.badge,
          extras: extrasForLead(tpl.extras, m.extras_state),   // the folder's extras, as this package offers them
          tax_mode: tpl.tax_mode, tax_rate: tpl.tax_rate,       // 🧾 the folder's tax wording, kept with the offer
        })),
      }),
      prisma.leads.update({
        where: { id: lead.id, ...mine(actingVendorId(req, { body: false })) },
        data: { package_template_id: tpl.id, package_id: null, package_snapshot: null, updated_at: new Date() },
      }),
    ]);

    await redrawIfInForce(lead.id, null);   // a contract built for the old offer quotes the new one
    res.json({ packages: await offerOf(lead), folder: tpl.name });
  } catch (e) { serverError(res, e); }
});

// PUT /api/lead-packages/:leadId/:id → edit one package for this client
router.put('/:leadId/:id', requireAuth, async (req, res) => {
  const { name, price, inclusions, admin_notes, per_hour_price, extras } = req.body;
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.packages_sent_at) {
      return res.status(423).json({ error: 'These packages have been sent. Unlock them first to make changes.' });
    }

    const nonNeg = (v) => Math.max(Number(v) || 0, 0);
    const data = { updated_at: new Date(), ...cleanPricing(req.body) };   // 💲 price mode, minimum guests, auto hours, line, ribbon
    if (name !== undefined) data.name = String(name).trim().slice(0, 120) || 'Package';
    if (price !== undefined) data.price = nonNeg(price);
    if (Array.isArray(inclusions)) data.inclusions = inclusions.map(s => String(s).trim()).filter(Boolean);
    if (admin_notes !== undefined) data.admin_notes = admin_notes || null;
    if (per_hour_price !== undefined) data.per_hour_price = per_hour_price === null || per_hour_price === '' ? null : nonNeg(per_hour_price);
    // this client's extras; a client's tick on an optional one survives the vendor editing the rest
    if (extras !== undefined) data.extras = cleanLeadExtras(extras);

    // scoped by lead_id too, so an id from another lead can't be edited here
    const { count } = await prisma.lead_packages.updateMany({
      where: { id: Number(req.params.id), lead_id: lead.id, ...mine(actingVendorId(req, { body: false })) },          // 🔒 tenancy on the write
      data,
    });
    if (!count) return res.status(404).json({ error: 'Package not found' });

    const pkg = await prisma.lead_packages.findUnique({ where: { id: Number(req.params.id) } });
    await redrawIfInForce(lead.id, pkg.id);
    res.json({ package: withQuote(lead)(pkg) });
  } catch (e) { serverError(res, e); }
});

// DELETE /api/lead-packages/:leadId/:id → drop one package from the offer
router.delete('/:leadId/:id', requireAuth, async (req, res) => {
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.packages_sent_at) {
      return res.status(423).json({ error: 'These packages have been sent. Unlock them first to make changes.' });
    }
    const { count } = await prisma.lead_packages.deleteMany({
      where: { id: Number(req.params.id), lead_id: lead.id, ...mine(actingVendorId(req, { body: false })) },          // 🔒 tenancy on the write
    });
    if (!count) return res.status(404).json({ error: 'Package not found' });
    await redrawIfInForce(lead.id, null);   // one left now means that one is in force
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// PUT /api/lead-packages/:leadId/lock → lock or unlock the offer.
// Locking is what "Send Packages" does; unlocking is the deliberate act of
// reopening an offer the client may already be looking at.
router.put('/:leadId/lock/set', requireAuth, async (req, res) => {
  const { locked } = req.body;
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await prisma.leads.update({
      where: { id: lead.id, ...mine(actingVendorId(req, { body: false })) },
      data: {
        packages_sent_at: locked ? new Date() : null,
        // Sending the offer moves the lead along the pipeline. Only from 'new':
        // a lead that's already booked shouldn't drop back a stage because the
        // vendor re-sent their packages, and unlocking to make an edit isn't an
        // un-send — the client has already seen them.
        ...(locked && lead.status === 'new' ? { status: 'quoted' } : {}),
        updated_at: new Date(),
      },
    });
    res.json({ ok: true, locked: !!locked });
  } catch (e) { serverError(res, e); }
});

export default router;
