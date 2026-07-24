import express from 'express';
import prisma from '../config/prisma.js';
import { moneySummary } from './payments.js';
import { notify } from './notifications.js';

const router = express.Router();

// helper: lead by client token (the token itself is the access key)
async function leadByToken(token) {
  return prisma.leads.findFirst({ where: { client_token: token } });
}

/* 🌐 PUBLIC: GET /api/portal/:token → lead + vendor packages + money */
router.get('/:token', async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    const vendor = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id },
      select: { business_name: true },
    });
    // Packages the client may choose from — the folder the vendor sent, not
    // every folder they own. A wedding client seeing corporate pricing is both
    // confusing and commercially unhelpful. Falls back to everything for leads
    // created before folders were assignable.
    const tplWhere = { vendor_id: lead.vendor_id };            // 🔒 tenancy
    if (lead.package_template_id) tplWhere.id = lead.package_template_id;
    const templates = await prisma.package_templates.findMany({
      where: tplWhere,
      orderBy: { id: 'asc' },
    });
    const packages = await prisma.vendor_packages.findMany({
      where: {
        vendor_id: lead.vendor_id,                             // 🔒 tenancy
        ...(lead.package_template_id ? { template_id: lead.package_template_id } : {}),
      },
      orderBy: { base_price: 'asc' },
    });
    const money = await moneySummary(lead);
    res.json({
      lead: {
        name: lead.name, event_type: lead.event_type, event_date: lead.event_date,
        hours: lead.hours, package_id: lead.package_id, status: lead.status,
      },
      business_name: vendor?.business_name,
      templates, packages, money,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 🌐 PUBLIC: POST /api/portal/:token/pick → client picks a package */
router.post('/:token/pick', async (req, res) => {
  const { package_id } = req.body;
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    // 🔒 the package must belong to the lead's vendor
    const p = await prisma.vendor_packages.findFirst({
      where: {
        id: Number(package_id),
        vendor_id: lead.vendor_id,                             // 🔒 tenancy
        // and only from the folder the vendor actually sent — the portal hides
        // the others, but the id could still be posted directly
        ...(lead.package_template_id ? { template_id: lead.package_template_id } : {}),
      },
    });
    if (!p) return res.status(400).json({ error: 'Package not found' });
    const snapshot = {
      name: p.name, base_price: p.base_price, included_hours: p.included_hours,
      per_hour_price: p.per_hour_price, inclusions: p.inclusions,
    };
    const updated = await prisma.leads.update({
      where: { id: lead.id },
      data: { package_id: p.id, package_snapshot: snapshot, updated_at: new Date() },
    });
    notify(lead.vendor_id, `📦 ${lead.name || 'Client'} picked "${p.name}"`, `Lead #${lead.id}`, 'package');
    res.json({ ok: true, money: await moneySummary(updated) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 🌐 PUBLIC: POST /api/portal/:token/office-visit → client requests to pay in person */
router.post('/:token/office-visit', async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    notify(lead.vendor_id, `🏢 ${lead.name || 'Client'} wants to pay in person`, `Lead #${lead.id}`, 'payment');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
