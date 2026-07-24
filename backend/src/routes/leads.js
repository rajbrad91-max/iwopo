import express from 'express';
import prisma from '../config/prisma.js';
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

// 🔒 tenancy helper: a vendor is always pinned to their own rows; only a super_admin
// who hasn't picked a vendor sees across tenants (matches the previous SQL behaviour).
function scope(vid, extra = {}) {
  return vid ? { vendor_id: Number(vid), ...extra } : extra;
}

// GET /api/leads/unread-count → how many NEW leads, for the sidebar badge 🔴
// "Unread" is seen_at IS NULL, deliberately NOT status='new'. Status is the sales
// pipeline (new → quoted → booked) and the panel filters and counts on it, so
// marking a lead read must not move it out of the "New" filter.
router.get('/unread-count', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const count = await prisma.leads.count({
      where: scope(vid, { archived_at: null, seen_at: null }),   // 🔒 tenancy
    });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/mappable-columns → what a form field can be linked to.
// Lets the builder offer the same list the server enforces, so the two can't drift.
router.get('/mappable-columns', requireAuth, async (req, res) => {
  res.json({
    columns: Object.entries(MAPPABLE_COLUMNS).map(([key, v]) => ({
      key, label: v.label, types: v.types,
    })),
  });
});

// PUT /api/leads/mark-seen → clear the sidebar badge.
// Stamps seen_at on this vendor's unread leads. Status is left alone, so a lead
// the vendor has merely glanced at still counts as "New" in the pipeline filters.
router.put('/mark-seen', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  try {
    const { count } = await prisma.leads.updateMany({
      where: { vendor_id: Number(vid), archived_at: null, seen_at: null },   // 🔒 tenancy on the write
      data: { seen_at: new Date() },
    });
    res.json({ ok: true, cleared: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads  → list (vendor-scoped 🔒, active only)
router.get('/', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const rows = await prisma.leads.findMany({
      where: scope(vid, { archived_at: null }),
      orderBy: { created_at: 'desc' },
      include: { vendor_packages: { select: { name: true } } },
    });
    // keep the old shape: package_name flattened onto the lead
    const leads = rows.map(({ vendor_packages, ...l }) => ({ ...l, package_name: vendor_packages?.name ?? null }));
    res.json({ leads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/history → archived leads 📜
router.get('/history', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const leads = await prisma.leads.findMany({
      where: scope(vid, { archived_at: { not: null } }),
      orderBy: { archived_at: 'desc' },
    });
    res.json({ leads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/bulk-archive  { ids: [] } 🗑️ (archive, not hard delete)
router.post('/bulk-archive', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids' });
  try {
    const { count } = await prisma.leads.updateMany({
      where: scope(vid, { id: { in: ids } }),      // 🔒 tenancy on the write itself
      data: { archived_at: new Date() },
    });
    res.json({ archived: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/bulk-delete  { ids: [] } 🗑️ (hard delete)
router.post('/bulk-delete', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids' });
  try {
    const { count } = await prisma.leads.deleteMany({
      where: scope(vid, { id: { in: ids } }),      // 🔒 tenancy on the write itself
    });
    res.json({ deleted: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/restore ↩️
router.post('/:id/restore', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.leads.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    await prisma.leads.update({ where: { id }, data: { archived_at: null } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leads/:id/flags → billed / delivered toggles + booking notes + ceremony
router.put('/:id/flags', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const id = Number(req.params.id);
  const { billed, delivered, booking_notes, ceremony } = req.body;
  try {
    const own = await prisma.leads.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });
    // COALESCE($n, col): only overwrite the fields actually supplied
    const data = { updated_at: new Date() };
    if (billed !== undefined && billed !== null) data.billed = billed;
    if (delivered !== undefined && delivered !== null) data.delivered = delivered;
    if (booking_notes !== undefined && booking_notes !== null) data.booking_notes = booking_notes;
    if (ceremony !== undefined && ceremony !== null) data.ceremony = ceremony;
    const lead = await prisma.leads.update({ where: { id }, data });
    res.json({ lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:id → single lead (scoped)
router.get('/:id', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid)
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy
    res.json({ lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const FIELDS = ['name','email','phone','event_type','event_date','timing_from','timing_to',
  'location','hours','guests','gr_bride','gr_bride_venue','gr_groom','gr_groom_venue',
  'notes','internal_notes','status','role','instagram','heard','custom_data'];

// Raw SQL accepted loose strings for dates/ints; Prisma is strict, so coerce here.
// Blank strings become null rather than throwing.
const DATE_FIELDS = new Set(['event_date']);
const INT_FIELDS = new Set(['hours', 'guests']);
const BOOL_FIELDS = new Set(['gr_bride', 'gr_groom']);
function coerceLeadField(field, val) {
  if (val === '' || val === null) return null;
  if (DATE_FIELDS.has(field)) { const d = new Date(val); return isNaN(d) ? null : d; }
  if (INT_FIELDS.has(field)) {
    // A mapped dropdown can send "1 hr 30 min" or "150 guests" — parseInt would
    // read 1 and quietly drop the half hour, so round a "x hr y min" value up to
    // whole hours and otherwise take the first number present.
    if (typeof val === 'string') {
      const hm = val.match(/(\d+)\s*hr[s]?(?:\s*(\d+)\s*min)?/i);
      if (hm) return parseInt(hm[1], 10) + (hm[2] ? Math.round(parseInt(hm[2], 10) / 60) : 0);
    }
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }
  if (BOOL_FIELDS.has(field)) return !!val;
  return val;                                  // custom_data is a Json column — pass through
}

/**
 * 🔗 Custom fields live in custom_data (a free-form bag keyed by field id), but
 * Bookings / Calendar / Details read the REAL columns (event_date, location…).
 * This syncs the bag → the columns so an answer the client gave actually shows up.
 */
/**
 * Which real lead columns a custom field may be linked to, and which field types
 * are allowed to fill each. A vendor picks the link in the form builder
 * ("this dropdown IS the Event Type"), which is stored as `maps_to` on the field.
 *
 * Mapping used to be by TYPE alone (date → event_date, location → location).
 * That silently lost data: a form with three date fields sent all three, but only
 * one could win, and a dropdown called "Type of Event" never reached event_type
 * at all — so the vendor's lead view showed blanks while the answers sat unread
 * in custom_data.
 */
const MAPPABLE_COLUMNS = {
  event_type:     { label: 'Event Type',        types: ['dropdown', 'text'] },
  event_date:     { label: 'Event Date',        types: ['date'] },
  timing_from:    { label: 'Timing From',       types: ['time'] },
  timing_to:      { label: 'Timing To',         types: ['time'] },
  location:       { label: 'Location',          types: ['location', 'text'] },
  hours:          { label: 'Hours',             types: ['hours', 'dropdown', 'text'] },
  guests:         { label: 'Est. Guests',       types: ['text', 'dropdown'] },
  gr_bride:       { label: 'Getting Ready — Bride (yes/no)',  types: ['checkbox'] },
  gr_bride_venue: { label: 'Getting Ready — Bride venue',     types: ['location', 'text'] },
  gr_groom:       { label: 'Getting Ready — Groom (yes/no)',  types: ['checkbox'] },
  gr_groom_venue: { label: 'Getting Ready — Groom venue',     types: ['location', 'text'] },
};

// legacy fallback: forms built before `maps_to` existed relied on type alone
const TYPE_TO_COLUMN = {
  date: 'event_date',
  location: 'location',
};

/**
 * Copy answers out of the custom_data bag into the real lead columns.
 * Prefers an explicit `maps_to` on the field; falls back to the old type rule
 * only for fields that have no mapping set, so existing forms keep working.
 */
async function mapCustomToColumns(vendorId, body, { overwrite = false } = {}) {
  const cd = body.custom_data;
  if (!cd || typeof cd !== 'object') return body;

  let fields = [];
  try {
    const s = await prisma.inquiry_settings.findUnique({
      where: { vendor_id: Number(vendorId) },   // 🔒 tenancy: only this vendor's form definition
      select: { custom_fields: true },
    });
    fields = s?.custom_fields || [];
  } catch { return body; }
  if (!Array.isArray(fields) || !fields.length) return body;

  const out = { ...body };
  const usedLegacy = new Set();

  // pass 1 — explicit links win, and they win over any legacy guess
  for (const f of fields) {
    const col = f.maps_to;
    if (!col || !MAPPABLE_COLUMNS[col]) continue;
    const val = cd[f.id];
    if (val === undefined || val === '') continue;
    if (!overwrite && out[col] !== undefined && out[col] !== null && out[col] !== '') continue;
    out[col] = val;
    usedLegacy.add(col);
  }

  // pass 2 — legacy type rule, only for columns nothing claimed explicitly
  for (const f of fields) {
    if (f.maps_to) continue;                    // this field opted in above
    const col = TYPE_TO_COLUMN[f.type];
    if (!col || usedLegacy.has(col)) continue;
    const val = cd[f.id];
    if (val === undefined || val === '') continue;
    if (!overwrite && out[col] !== undefined && out[col] !== null && out[col] !== '') continue;
    out[col] = val;
    usedLegacy.add(col);
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

  // This route is PUBLIC, so the body is untrusted. Without these checks an empty
  // POST created a blank lead row, a bad email was stored as-is, and an unknown
  // vendor_id surfaced a raw Prisma foreign-key error to the caller.
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address does not look right' });
  }

  const vendorExists = await prisma.vendors.count({ where: { id: Number(vendor_id) } });
  if (!vendorExists) return res.status(404).json({ error: 'Vendor not found' });

  // 🔗 pull real columns (event_date, location…) out of the custom-field bag
  const mapped = await mapCustomToColumns(vendor_id, b);

  // build the row from the whitelisted FIELDS only (never trust arbitrary body keys)
  const data = { vendor_id: Number(vendor_id), client_token: (await import('crypto')).randomBytes(20).toString('hex') };
  for (const f of FIELDS) {
    if (mapped[f] === undefined) continue;
    data[f] = coerceLeadField(f, mapped[f]);
  }
  data.name = name;     // use the trimmed/validated values
  data.email = email;

  try {
    const lead = await prisma.leads.create({ data });
    notifyNewLead(lead);
    notify(lead.vendor_id, `🆕 New inquiry from ${lead.name || 'a client'}`, `${lead.event_type || 'Event'} · ${lead.event_date ? String(lead.event_date).slice(0,10) : 'no date'}`, 'lead');
    res.status(201).json({ lead });
  } catch (e) {
    // a public caller must never see a raw Prisma error
    console.error('[leads] create failed:', e.message);
    res.status(500).json({ error: 'Could not save your inquiry. Please try again.' });
  }
});

// PUT /api/leads/:id → update (scoped)
router.put('/:id', requireAuth, async (req, res) => {
  const vid = vendorIdFor(req);
  const id = Number(req.params.id);
  try {
    const exist = await prisma.leads.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!exist) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && exist.vendor_id !== vid)
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy

    const b = req.body;
    const ownerVid = exist.vendor_id;

    // 🔗 keep the real columns in sync with the custom-field bag on every edit.
    // Here the mapped value WINS (the vendor just changed it in the form).
    const mapped = await mapCustomToColumns(ownerVid, b, { overwrite: true });

    const data = {};
    for (const f of FIELDS) {
      if (mapped[f] === undefined) continue;
      data[f] = coerceLeadField(f, mapped[f]);
    }
    if (!Object.keys(data).length) return res.json({ ok: true });
    data.updated_at = new Date();
    const lead = await prisma.leads.update({ where: { id }, data });
    res.json({ lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 toggle Secure Login (client portal gate)
router.put('/:id/gateway', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  const id = Number(req.params.id);
  try {
    const own = await prisma.leads.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.leads.update({
      where: { id },
      data: { gateway_enabled: !!req.body.enabled, updated_at: new Date() },
    });
    res.json({ ok: true, gateway_enabled: !!req.body.enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📤 Send Packages — emails the client portal link (reuses email settings)
router.post('/:id/send-packages', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  const id = Number(req.params.id);
  try {
    const lead = await prisma.leads.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email' });

    const link = `https://iwopo.com/portal/${lead.client_token}`;
    const subject = 'Your packages are ready 🎉';
    const body = `Hi ${lead.name},\n\nView your custom packages and book here:\n${link}\n\nThank you!`;
    await sendLeadEmail(req, lead, subject, body);
    // ⏳ auto-start the offer countdown if enabled and not yet started
    if (lead.timer_enabled && !lead.timer_started_at) {
      await prisma.leads.update({ where: { id: lead.id }, data: { timer_started_at: new Date() } });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⏳ Save offer countdown settings (vendor sets hours + on/off)
router.put('/:id/timer', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  const id = Number(req.params.id);
  const { enabled, hours, restart } = req.body;
  try {
    const own = await prisma.leads.findUnique({ where: { id }, select: { vendor_id: true, timer_started_at: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const h = Math.min(Math.max(Number(hours) || 72, 1), 720);
    // restart resets the clock; turning off clears the start; otherwise keep it
    const data = { timer_enabled: !!enabled, timer_hours: h, updated_at: new Date() };
    if (restart) data.timer_started_at = new Date();
    else if (!enabled) data.timer_started_at = null;
    const up = await prisma.leads.update({
      where: { id },
      data,
      select: { timer_enabled: true, timer_hours: true, timer_started_at: true },
    });
    res.json(up);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
