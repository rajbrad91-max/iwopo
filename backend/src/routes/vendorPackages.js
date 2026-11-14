import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { serverError } from '../lib/httpError.js';
import { mine } from '../lib/tenancy.js';
import { actingVendorId } from '../lib/vendorScope.js';   // 🔒 which vendor this request acts for
import { cleanFolderExtras, cleanExtrasState, cleanPricing, cleanTax } from '../lib/packageQuote.js';

const router = express.Router();
const MAX_PACKAGES = 3;   // per template
const MAX_TEMPLATES = 6;  // per vendor


// 📁 TEMPLATES
// GET /api/vendor-packages/templates → templates with their packages nested
router.get('/templates', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

// POST /api/vendor-packages/templates → add template (max 6)
router.post('/templates', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const n = await prisma.package_templates.count({ where: { vendor_id: Number(v) } });
    if (n >= MAX_TEMPLATES)
      return res.status(400).json({ error: `Max ${MAX_TEMPLATES} templates allowed` });
    const template = await prisma.package_templates.create({
      data: { vendor_id: Number(v), name: req.body.name || 'New Event', sort_order: n + 1 }, // 🔒 tenancy
    });
    res.status(201).json({ template });
  } catch (e) { serverError(res, e); }
});

// PUT /api/vendor-packages/templates/:id → rename, and the folder's extras
router.put('/templates/:id', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.package_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    const data = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 120);
    if (req.body.extras !== undefined) data.extras = cleanFolderExtras(req.body.extras);
    Object.assign(data, cleanTax(req.body));   // 🧾 tax included (%), plus tax, or not mentioned
    const template = await prisma.package_templates.update({ where: { id, ...mine(v) }, data });
    res.json({ template });
  } catch (e) { serverError(res, e); }
});

// DELETE /api/vendor-packages/templates/:id (keeps at least 1)
router.delete('/templates/:id', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.package_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    const n = await prisma.package_templates.count({ where: { vendor_id: own.vendor_id } });
    if (n <= 1) return res.status(400).json({ error: 'Keep at least 1 template' });
    await prisma.package_templates.delete({ where: { id, ...mine(v) } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// GET /api/vendor-packages → my packages
router.get('/', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const packages = await prisma.vendor_packages.findMany({
      where: { vendor_id: Number(v) },                        // 🔒 tenancy
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ packages });
  } catch (e) { serverError(res, e); }
});

// POST /api/vendor-packages → add (max 3 per template)
router.post('/', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

// PUT /api/vendor-packages/:id → rename / pricing / inclusions
router.put('/:id', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.vendor_packages.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy

    const { name, base_price, included_hours, per_hour_price, inclusions, extras_state } = req.body;
    // COALESCE($n, col): only overwrite what was supplied
    const nonNeg = (x) => Math.max(Number(x) || 0, 0);
    const data = { updated_at: new Date(), ...cleanPricing(req.body) };   // 💲 price mode, minimum guests, auto hours, line, ribbon
    if (name !== undefined && name !== null) data.name = String(name).trim().slice(0, 120) || 'New Package';
    if (base_price !== undefined && base_price !== null) data.base_price = nonNeg(base_price);
    if (included_hours !== undefined && included_hours !== null) data.included_hours = Math.round(nonNeg(included_hours));
    if (per_hour_price !== undefined && per_hour_price !== null) data.per_hour_price = nonNeg(per_hour_price);
    if (Array.isArray(inclusions)) data.inclusions = inclusions.map(s => String(s).trim()).filter(Boolean);  // Json column
    // offered / included / hidden, for the extras this package's folder actually has
    if (extras_state !== undefined) {
      const pk = await prisma.vendor_packages.findUnique({ where: { id }, select: { package_templates: { select: { extras: true } } } });
      const ids = (Array.isArray(pk?.package_templates?.extras) ? pk.package_templates.extras : []).map(x => x?.id).filter(Boolean);
      data.extras_state = cleanExtrasState(extras_state, ids);
    }
    const pkg = await prisma.vendor_packages.update({ where: { id, ...mine(v) }, data });
    res.json({ package: pkg });
  } catch (e) { serverError(res, e); }
});

// DELETE /api/vendor-packages/:id (not the default one)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = actingVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.vendor_packages.findUnique({ where: { id }, select: { vendor_id: true, is_default: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });    // 🔒 tenancy
    if (own.is_default) return res.status(400).json({ error: "Can't delete the default package" });
    await prisma.vendor_packages.delete({ where: { id, ...mine(v) } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

export default router;
