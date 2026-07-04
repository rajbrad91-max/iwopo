import express from 'express';
import { query } from '../config/db.js';
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
    const { rows: tpls } = await query(
      'SELECT * FROM package_templates WHERE vendor_id=$1 ORDER BY sort_order, id', [v]);
    const { rows: pkgs } = await query(
      'SELECT * FROM vendor_packages WHERE vendor_id=$1 ORDER BY sort_order, id', [v]);
    res.json({ templates: tpls.map(t => ({ ...t, packages: pkgs.filter(p => p.template_id === t.id) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/vendor-packages/templates → add template (max 6)
router.post('/templates', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const { rows: cnt } = await query(
      'SELECT COUNT(*)::int AS n FROM package_templates WHERE vendor_id=$1', [v]);
    if (cnt[0].n >= MAX_TEMPLATES)
      return res.status(400).json({ error: `Max ${MAX_TEMPLATES} templates allowed` });
    const { rows } = await query(
      `INSERT INTO package_templates (vendor_id, name, sort_order) VALUES ($1,$2,$3) RETURNING *`,
      [v, req.body.name || 'New Event', cnt[0].n + 1]);
    res.status(201).json({ template: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/templates/:id → rename
router.put('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: own } = await query('SELECT vendor_id FROM package_templates WHERE id=$1', [req.params.id]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      'UPDATE package_templates SET name=$1 WHERE id=$2 RETURNING *', [req.body.name, req.params.id]);
    res.json({ template: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/vendor-packages/templates/:id (keeps at least 1)
router.delete('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: own } = await query('SELECT vendor_id FROM package_templates WHERE id=$1', [req.params.id]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });
    const { rows: cnt } = await query(
      'SELECT COUNT(*)::int AS n FROM package_templates WHERE vendor_id=$1', [own[0].vendor_id]);
    if (cnt[0].n <= 1) return res.status(400).json({ error: 'Keep at least 1 template' });
    await query('DELETE FROM package_templates WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendor-packages → my packages
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const { rows } = await query(
      'SELECT * FROM vendor_packages WHERE vendor_id=$1 ORDER BY sort_order, id', [v]);
    res.json({ packages: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/vendor-packages → add (max 3 per template)
router.post('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { name, template_id } = req.body;
  if (!template_id) return res.status(400).json({ error: 'template_id required' });
  try {
    const { rows: tpl } = await query('SELECT vendor_id FROM package_templates WHERE id=$1', [template_id]);
    if (!tpl[0] || (req.user.role !== 'super_admin' && tpl[0].vendor_id !== v))
      return res.status(403).json({ error: 'Invalid template' });
    const { rows: cnt } = await query(
      'SELECT COUNT(*)::int AS n FROM vendor_packages WHERE template_id=$1', [template_id]);
    if (cnt[0].n >= MAX_PACKAGES)
      return res.status(400).json({ error: `Max ${MAX_PACKAGES} packages per template` });
    const { rows } = await query(
      `INSERT INTO vendor_packages (vendor_id, template_id, name, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [tpl[0].vendor_id, template_id, name || 'New Package', cnt[0].n + 1]);
    res.status(201).json({ package: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/:id → rename / pricing / inclusions
router.put('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: own } = await query('SELECT vendor_id FROM vendor_packages WHERE id=$1', [req.params.id]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });

    const { name, base_price, included_hours, per_hour_price, inclusions } = req.body;
    const { rows } = await query(
      `UPDATE vendor_packages SET
        name=COALESCE($1,name), base_price=COALESCE($2,base_price),
        included_hours=COALESCE($3,included_hours), per_hour_price=COALESCE($4,per_hour_price),
        inclusions=COALESCE($5,inclusions), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name ?? null, base_price ?? null, included_hours ?? null, per_hour_price ?? null,
       inclusions ? JSON.stringify(inclusions) : null, req.params.id]);
    res.json({ package: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/vendor-packages/:id (not the default one)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: own } = await query('SELECT vendor_id, is_default FROM vendor_packages WHERE id=$1', [req.params.id]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });
    if (own[0].is_default) return res.status(400).json({ error: "Can't delete the default package" });
    await query('DELETE FROM vendor_packages WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor-packages/assign/:leadId → link lead to package (+snapshot)
router.put('/assign/:leadId', requireAuth, async (req, res) => {
  const v = vid(req);
  const { package_id } = req.body;
  try {
    const { rows: lead } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.leadId]);
    if (!lead[0]) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead[0].vendor_id !== v)
      return res.status(403).json({ error: 'Forbidden' });

    let snapshot = null;
    if (package_id) {
      const { rows: pkg } = await query('SELECT * FROM vendor_packages WHERE id=$1', [package_id]);
      if (!pkg[0] || pkg[0].vendor_id !== lead[0].vendor_id)
        return res.status(400).json({ error: 'Package not valid for this vendor' });
      snapshot = JSON.stringify(pkg[0]);
    }
    const { rows } = await query(
      `UPDATE leads SET package_id=$1, package_snapshot=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [package_id || null, snapshot, req.params.leadId]);
    res.json({ lead: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
