import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyNewLead } from './email.js';

const router = express.Router();

// Which vendor am I? (super_admin can pass ?vendor_id=, vendors use their own)
function vendorIdFor(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/leads  → list (vendor-scoped 🔒)
router.get('/', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows } = vid
      ? await query('SELECT * FROM leads WHERE vendor_id=$1 ORDER BY created_at DESC', [vid])
      : await query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ leads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:id → single lead (scoped)
router.get('/:id', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows } = await query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid)
      return res.status(403).json({ error: 'Forbidden' });
    res.json({ lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const FIELDS = ['name','email','phone','event_type','event_date','timing_from','timing_to',
  'location','hours','guests','gr_bride','gr_bride_venue','gr_groom','gr_groom_venue',
  'notes','internal_notes','status'];

// POST /api/leads → create (public inquiry OR admin). vendor_id required.
router.post('/', async (req, res) => {
  const b = req.body;
  const vendor_id = b.vendor_id;
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });
  const cols = ['vendor_id', ...FIELDS.filter(f => b[f] !== undefined)];
  const vals = [vendor_id, ...FIELDS.filter(f => b[f] !== undefined).map(f => b[f])];
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  try {
    const { rows } = await query(
      `INSERT INTO leads (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    notifyNewLead(rows[0]);
    res.status(201).json({ lead: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leads/:id → update (scoped)
router.put('/:id', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows: exist } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.id]);
    if (!exist[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && exist[0].vendor_id !== vid)
      return res.status(403).json({ error: 'Forbidden' });

    const b = req.body;
    const upd = FIELDS.filter(f => b[f] !== undefined);
    if (!upd.length) return res.json({ ok: true });
    const set = upd.map((f, i) => `${f}=$${i + 1}`).join(',');
    const vals = upd.map(f => b[f]);
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE leads SET ${set}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    res.json({ lead: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
