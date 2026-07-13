import express from 'express';
import { query } from '../config/db.js';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { notifyNewLead, sendLeadEmail } from './email.js';
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

// POST /api/leads/bulk-delete  { ids: [] } 🗑️ (hard delete)
router.post('/bulk-delete', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids' });
  try {
    const { rowCount } = vid
      ? await query('DELETE FROM leads WHERE id=ANY($1) AND vendor_id=$2', [ids, vid])
      : await query('DELETE FROM leads WHERE id=ANY($1)', [ids]);
    res.json({ deleted: rowCount });
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

/**
 * 🔗 Custom fields live in custom_data (a free-form bag keyed by field id), but
 * Bookings / Calendar / Details read the REAL columns (event_date, location…).
 * This syncs the bag → the columns so a date the vendor typed actually shows up.
 * Type drives the mapping: a 'date' custom field IS the event date, etc.
 */
const TYPE_TO_COLUMN = {
  date: 'event_date',
  location: 'location',
};

async function mapCustomToColumns(vendorId, body, { overwrite = false } = {}) {
  const cd = body.custom_data;
  if (!cd || typeof cd !== 'object') return body;

  let fields = [];
  try {
    const { rows } = await query('SELECT custom_fields FROM inquiry_settings WHERE vendor_id=$1', [vendorId]);
    fields = rows[0]?.custom_fields || [];
  } catch { return body; }
  if (!Array.isArray(fields) || !fields.length) return body;

  const out = { ...body };
  for (const f of fields) {
    const col = TYPE_TO_COLUMN[f.type];
    if (!col) continue;                       // only types that have a real column
    const val = cd[f.id];
    if (val === undefined || val === '') continue;
    // on create: don't clobber a value the caller explicitly set.
    // on edit (overwrite): the form is the source of truth — the new value wins.
    if (!overwrite && out[col] !== undefined && out[col] !== null && out[col] !== '') continue;
    out[col] = val;
  }
  return out;
}

// POST /api/leads → create (public inquiry OR logged-in vendor panel).
// Public form sends vendor_id in the body; the vendor panel is authenticated,
// so we take vendor_id from the token instead of trusting the body.
router.post('/', async (req, res) => {
  const b = req.body;

  let vendor_id = b.vendor_id || null;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    try {
      const user = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev-secret-change-me');
      if (user.role === 'super_admin') vendor_id = b.vendor_id || null;   // super admin must say which vendor
      else vendor_id = user.vendor_id;                                     // vendors always their own
    } catch { /* bad token → fall back to body (public form) */ }
  }

  if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });

  // 🔗 pull real columns (event_date, location…) out of the custom-field bag
  const mapped = await mapCustomToColumns(vendor_id, b);

  const cols = ['vendor_id', 'client_token', ...FIELDS.filter(f => mapped[f] !== undefined)];
  const vals = [vendor_id, (await import('crypto')).randomBytes(20).toString('hex'),
    ...FIELDS.filter(f => mapped[f] !== undefined).map(f => f === 'custom_data' ? JSON.stringify(mapped[f]) : mapped[f])];
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
    const ownerVid = exist[0].vendor_id;

    // 🔗 keep the real columns in sync with the custom-field bag on every edit.
    // Here the mapped value WINS (the vendor just changed it in the form).
    const mapped = await mapCustomToColumns(ownerVid, b, { overwrite: true });

    const upd = FIELDS.filter(f => mapped[f] !== undefined);
    if (!upd.length) return res.json({ ok: true });
    const set = upd.map((f, i) => `${f}=$${i + 1}`).join(',');
    const vals = upd.map(f => f === 'custom_data' ? JSON.stringify(mapped[f]) : mapped[f]);
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE leads SET ${set}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    res.json({ lead: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 toggle Secure Login (client portal gate)
router.put('/:id/gateway', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  try {
    const { rows } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    await query('UPDATE leads SET gateway_enabled=$1, updated_at=NOW() WHERE id=$2', [!!req.body.enabled, req.params.id]);
    res.json({ ok: true, gateway_enabled: !!req.body.enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📤 Send Packages — emails the client portal link (reuses email settings)
router.post('/:id/send-packages', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  try {
    const { rows } = await query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email' });

    const link = `https://alphabetaone.com/portal/${lead.client_token}`;
    const subject = 'Your packages are ready 🎉';
    const body = `Hi ${lead.name},\n\nView your custom packages and book here:\n${link}\n\nThank you!`;
    await sendLeadEmail(req, lead, subject, body);
    // ⏳ auto-start the offer countdown if enabled and not yet started
    if (lead.timer_enabled && !lead.timer_started_at) {
      await query('UPDATE leads SET timer_started_at=NOW() WHERE id=$1', [lead.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⏳ Save offer countdown settings (vendor sets hours + on/off)
router.put('/:id/timer', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  const { enabled, hours, restart } = req.body;
  try {
    const { rows } = await query('SELECT vendor_id, timer_started_at FROM leads WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    const h = Math.min(Math.max(Number(hours) || 72, 1), 720);
    // restart resets the clock; turning off clears the start
    const started = restart ? 'NOW()' : (enabled ? 'timer_started_at' : 'NULL');
    const { rows: up } = await query(
      `UPDATE leads SET timer_enabled=$1, timer_hours=$2, timer_started_at=${started}, updated_at=NOW() WHERE id=$3
       RETURNING timer_enabled, timer_hours, timer_started_at`,
      [!!enabled, h, req.params.id]);
    res.json(up[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
