import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyNewLead } from './email.js';
import { notify } from './notifications.js';

const router = express.Router();

// Which vendor am I? (super_admin can pass ?vendor_id=, vendors use their own)
function vendorIdFor(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/leads  → list (vendor-scoped 🔒, active only)
router.get('/', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows } = vid
      ? await query(`SELECT l.*, p.name AS package_name FROM leads l
          LEFT JOIN vendor_packages p ON p.id = l.package_id
          WHERE l.vendor_id=$1 AND l.archived_at IS NULL ORDER BY l.created_at DESC`, [vid])
      : await query(`SELECT l.*, p.name AS package_name FROM leads l
          LEFT JOIN vendor_packages p ON p.id = l.package_id
          WHERE l.archived_at IS NULL ORDER BY l.created_at DESC`);
    res.json({ leads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/history → archived leads 📜
router.get('/history', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows } = vid
      ? await query('SELECT * FROM leads WHERE vendor_id=$1 AND archived_at IS NOT NULL ORDER BY archived_at DESC', [vid])
      : await query('SELECT * FROM leads WHERE archived_at IS NOT NULL ORDER BY archived_at DESC');
    res.json({ leads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/bulk-archive  { ids: [] } 🗑️ (archive, not hard delete)
router.post('/bulk-archive', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids' });
  try {
    const { rowCount } = vid
      ? await query('UPDATE leads SET archived_at=NOW() WHERE id=ANY($1) AND vendor_id=$2', [ids, vid])
      : await query('UPDATE leads SET archived_at=NOW() WHERE id=ANY($1)', [ids]);
    res.json({ archived: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/restore ↩️
router.post('/:id/restore', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const { rows } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    await query('UPDATE leads SET archived_at=NULL WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leads/:id/flags → billed / delivered toggles + booking notes + ceremony
router.put('/:id/flags', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const { billed, delivered, booking_notes, ceremony } = req.body;
  try {
    const { rows: own } = await query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE leads SET billed=COALESCE($1,billed), delivered=COALESCE($2,delivered),
        booking_notes=COALESCE($3,booking_notes), ceremony=COALESCE($4,ceremony), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [billed ?? null, delivered ?? null, booking_notes ?? null, ceremony ?? null, req.params.id]);
    res.json({ lead: rows[0] });
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
  'notes','internal_notes','status','role','instagram','heard','custom_data'];

// POST /api/leads → create (public inquiry OR admin). vendor_id required.
router.post('/', async (req, res) => {
  const b = req.body;
  const vendor_id = b.vendor_id;
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });
  const cols = ['vendor_id', 'client_token', ...FIELDS.filter(f => b[f] !== undefined)];
  const vals = [vendor_id, (await import('crypto')).randomBytes(20).toString('hex'),
    ...FIELDS.filter(f => b[f] !== undefined).map(f => f === 'custom_data' ? JSON.stringify(b[f]) : b[f])];
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  try {
    const { rows } = await query(
      `INSERT INTO leads (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    notifyNewLead(rows[0]);
    notify(rows[0].vendor_id, `🆕 New inquiry from ${rows[0].name || 'a client'}`, `${rows[0].event_type || 'Event'} · ${rows[0].event_date ? String(rows[0].event_date).slice(0,10) : 'no date'}`, 'lead');
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
