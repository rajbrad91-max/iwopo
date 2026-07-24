import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const MAX_PACKAGES = 3;   // per template
const MAX_TEMPLATES = 6;  // per vendor

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// 📁 TEMPLATES
// GET /api/vendor-packages/templates → templates with their packages nested
router.get('/templates', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const tpls = await prisma.package_templates.findMany({
      where: { vendor_id: Number(v) },                       // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const pkgs = await prisma.vendor_packages.findMany({
      where: { vendor_id: Number(v) },                       // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ templates: tpls.map(t => ({ ...t, packages: pkgs.filter(p => p.template_id === t.id) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/vendor-packages/templates → add template (max 6)
router.post('/templates', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const n = await prisma.package_templates.count({ where: { vendor_id: Number(v) } });
    if (n >= MAX_TEMPLATES)
      return res.status(400).json({ error: `Max ${MAX_TEMPLATES} templates allowed` });
    const template = await prisma.package_templates.create({
      data: { vendor_id: Number(v), name: req.body.name || 'New Event', sort_order: n + 1 }, // 🔒 tenancy
    });
    res.status(201).json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/templates/:id → rename
router.put('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.package_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    const template = await prisma.package_templates.update({ where: { id }, data: { name: req.body.name } });
    res.json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/vendor-packages/templates/:id (keeps at least 1)
router.delete('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.package_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    const n = await prisma.package_templates.count({ where: { vendor_id: own.vendor_id } });
    if (n <= 1) return res.status(400).json({ error: 'Keep at least 1 template' });
    await prisma.package_templates.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendor-packages → my packages
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const packages = await prisma.vendor_packages.findMany({
      where: { vendor_id: Number(v) },                        // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ packages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/vendor-packages → add (max 3 per template)
router.post('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { name, template_id } = req.body;
  if (!template_id) return res.status(400).json({ error: 'template_id required' });
  try {
    const tpl = await prisma.package_templates.findUnique({
      where: { id: Number(template_id) }, select: { id: true, vendor_id: true },
    });
    if (!tpl || (req.user.role !== 'super_admin' && tpl.vendor_id !== v))
      return res.status(403).json({ error: 'Invalid template' });   // 🔒 tenancy
    const n = await prisma.vendor_packages.count({ where: { template_id: tpl.id } });
    if (n >= MAX_PACKAGES)
      return res.status(400).json({ error: `Max ${MAX_PACKAGES} packages per template` });
    const pkg = await prisma.vendor_packages.create({
      data: {
        vendor_id: tpl.vendor_id,                             // 🔒 inherited from the template
        template_id: tpl.id, name: name || 'New Package', sort_order: n + 1,
      },
    });
    res.status(201).json({ package: pkg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/:id → rename / pricing / inclusions
router.put('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.vendor_packages.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy

    const { name, base_price, included_hours, per_hour_price, inclusions } = req.body;
    // COALESCE($n, col): only overwrite what was supplied
    const data = { updated_at: new Date() };
    if (name !== undefined && name !== null) data.name = name;
    if (base_price !== undefined && base_price !== null) data.base_price = Number(base_price);
    if (included_hours !== undefined && included_hours !== null) data.included_hours = Number(included_hours);
    if (per_hour_price !== undefined && per_hour_price !== null) data.per_hour_price = Number(per_hour_price);
    if (inclusions !== undefined && inclusions !== null) data.inclusions = inclusions;  // Json column
    const pkg = await prisma.vendor_packages.update({ where: { id }, data });
    res.json({ package: pkg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/vendor-packages/:id (not the default one)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.vendor_packages.findUnique({ where: { id }, select: { vendor_id: true, is_default: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    if (own.is_default) return res.status(400).json({ error: "Can't delete the default package" });
    await prisma.vendor_packages.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/assign-folder/:leadId → send a whole folder to a lead.
// The vendor picks the folder ("Wedding", "Corporate"); the client picks a
// package from it in their portal. Without this the portal showed every folder
// the vendor owned, so a wedding client saw the corporate pricing too.
router.put('/assign-folder/:leadId', requireAuth, async (req, res) => {
  const v = vid(req);
  const leadId = Number(req.params.leadId);
  const { template_id } = req.body;
  try {
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });      // 🔒 tenancy

    let tplId = null;
    if (template_id) {
      // the folder must belong to this lead's vendor, not merely exist
      const tpl = await prisma.package_templates.findFirst({
        where: { id: Number(template_id), vendor_id: lead.vendor_id },   // 🔒 tenancy
        select: { id: true },
      });
      if (!tpl) return res.status(404).json({ error: 'Package folder not found' });
      tplId = tpl.id;
    }

    // changing the folder clears any package the client had already chosen from
    // the old one — it would otherwise sit on the lead pointing somewhere the
    // client can no longer see
    const updated = await prisma.leads.update({
      where: { id: leadId },
      data: { package_template_id: tplId, package_id: null, package_snapshot: null, updated_at: new Date() },
    });
    res.json({ lead: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/assign/:leadId → link lead to package (+snapshot)
router.put('/assign/:leadId', requireAuth, async (req, res) => {
  const v = vid(req);
  const leadId = Number(req.params.leadId);
  const { package_id } = req.body;
  try {
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy

    let snapshot = null;
    if (package_id) {
      // 🔒 the package must belong to the same vendor as the lead
      const pkg = await prisma.vendor_packages.findFirst({
        where: { id: Number(package_id), vendor_id: lead.vendor_id },
      });
      if (!pkg) return res.status(400).json({ error: 'Package not valid for this vendor' });
      snapshot = pkg;                                         // Json column — stored as-is
    }
    const updated = await prisma.leads.update({
      where: { id: leadId },
      data: { package_id: package_id ? Number(package_id) : null, package_snapshot: snapshot, updated_at: new Date() },
    });
    res.json({ lead: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
