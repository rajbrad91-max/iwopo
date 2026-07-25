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

const router = express.Router();

function vid(req) {
  return req.user.role === 'super_admin' ? (req.query.vendor_id || null) : req.user.vendor_id;
}

/** Load a lead this user is allowed to touch, or null. 🔒 */
async function ownedLead(req, leadId) {
  const lead = await prisma.leads.findUnique({
    where: { id: Number(leadId) },
    select: { id: true, vendor_id: true, packages_sent_at: true, status: true },
  });
  if (!lead) return null;
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return null;
  return lead;
}

// GET /api/lead-packages/:leadId → this lead's packages
router.get('/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const packages = await prisma.lead_packages.findMany({
      where: { lead_id: lead.id },                      // 🔒 tenancy via the lead
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ packages, locked: !!lead.packages_sent_at, sent_at: lead.packages_sent_at });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      select: { id: true, name: true },
    });
    if (!tpl) return res.status(404).json({ error: 'Package folder not found' });

    const masters = await prisma.vendor_packages.findMany({
      where: { template_id: tpl.id, vendor_id: lead.vendor_id },       // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    if (!masters.length) return res.status(400).json({ error: 'That folder has no packages yet' });

    // one transaction: the lead never sits with half an offer on it
    await prisma.$transaction([
      prisma.lead_packages.deleteMany({ where: { lead_id: lead.id } }),
      prisma.lead_packages.createMany({
        data: masters.map((m, i) => ({
          lead_id: lead.id,
          vendor_id: lead.vendor_id,                    // 🔒 stamped from the lead, not the request
          source_package_id: m.id,
          name: m.name,
          price: m.base_price ?? 0,
          inclusions: m.inclusions ?? [],
          sort_order: m.sort_order ?? i,
        })),
      }),
      prisma.leads.update({
        where: { id: lead.id },
        data: { package_template_id: tpl.id, package_id: null, package_snapshot: null, updated_at: new Date() },
      }),
    ]);

    const packages = await prisma.lead_packages.findMany({
      where: { lead_id: lead.id },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ packages, folder: tpl.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/lead-packages/:leadId/:id → edit one package for this client
router.put('/:leadId/:id', requireAuth, async (req, res) => {
  const { name, price, inclusions, admin_notes } = req.body;
  try {
    const lead = await ownedLead(req, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.packages_sent_at) {
      return res.status(423).json({ error: 'These packages have been sent. Unlock them first to make changes.' });
    }

    const data = { updated_at: new Date() };
    if (name !== undefined) data.name = String(name).trim().slice(0, 120);
    if (price !== undefined) data.price = Number(price) || 0;
    if (Array.isArray(inclusions)) data.inclusions = inclusions.map(s => String(s).trim()).filter(Boolean);
    if (admin_notes !== undefined) data.admin_notes = admin_notes || null;

    // scoped by lead_id too, so an id from another lead can't be edited here
    const { count } = await prisma.lead_packages.updateMany({
      where: { id: Number(req.params.id), lead_id: lead.id },          // 🔒 tenancy on the write
      data,
    });
    if (!count) return res.status(404).json({ error: 'Package not found' });

    const pkg = await prisma.lead_packages.findUnique({ where: { id: Number(req.params.id) } });
    res.json({ package: pkg });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      where: { id: Number(req.params.id), lead_id: lead.id },          // 🔒 tenancy on the write
    });
    if (!count) return res.status(404).json({ error: 'Package not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      where: { id: lead.id },
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
