import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendAsVendor } from './email.js';

const router = express.Router();
function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function eventKey(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

/** Parse "HH:MM" or "H:MM" into minutes from midnight; null if unusable. */
function minsOf(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Hours for one assignment. Prefer real check-in/out stamps; otherwise the
 * scheduled arrive→leave window on the event day. Overnight shifts (leave
 * before arrive) count across midnight.
 */
function hoursWorked(a) {
  if (a.checked_in_at && a.checked_out_at) {
    const ms = new Date(a.checked_out_at) - new Date(a.checked_in_at);
    if (ms > 0) return Math.round((ms / 3600000) * 100) / 100;
  }
  const start = minsOf(a.arrive_time);
  const end = minsOf(a.leave_time);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'biweek') d.setDate(d.getDate() - 13);
  else if (period === 'month') d.setDate(d.getDate() - 29);
  else d.setDate(d.getDate() - 6); // week
  return d.toISOString().slice(0, 10);
}

function shapeRow(a) {
  const lead = a.leads || {};
  const member = a.crew_members || {};
  const hours = hoursWorked(a);
  return {
    id: a.id,
    duty: a.duty,
    arrive_time: a.arrive_time,
    leave_time: a.leave_time,
    checkin_token: a.checkin_token,
    checked_in_at: a.checked_in_at,
    checked_out_at: a.checked_out_at,
    hours,
    member_id: a.crew_member_id,
    member_name: member.name || null,
    member_role: member.role || null,
    member_email: member.email || null,
    member_phone: member.phone || null,
    lead_id: a.lead_id,
    client_name: lead.name || null,
    event_type: lead.event_type || null,
    event_date: lead.event_date || null,
    location: lead.location || null,
    timing_from: lead.timing_from || null,
    timing_to: lead.timing_to || null,
  };
}

/* ── 👷 CREW MEMBERS (vendor roster) ── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const crew = await prisma.crew_members.findMany({
      where: { vendor_id: Number(vid(req)) },    // 🔒 tenancy
      orderBy: { name: 'asc' },
    });
    res.json({ crew });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 📅 Schedule for the Crew page — upcoming or past assignments across every
 * booked (or dated) job this vendor owns. No schema change: reads lead_crew
 * joined to leads + crew_members.
 *
 * view=upcoming|past  member_id?  period=week|biweek|month (past totals only)
 */
router.get('/schedule', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    const view = req.query.view === 'past' ? 'past' : 'upcoming';
    const memberId = req.query.member_id ? Number(req.query.member_id) : null;
    const period = ['week', 'biweek', 'month'].includes(req.query.period) ? req.query.period : 'week';
    const today = todayKey();

    const rows = await prisma.lead_crew.findMany({
      where: {
        crew_members: { vendor_id: v },          // 🔒 tenancy via owning member
        ...(memberId ? { crew_member_id: memberId } : {}),
      },
      include: {
        crew_members: { select: { id: true, name: true, role: true, email: true, phone: true } },
        leads: {
          select: {
            id: true, name: true, event_type: true, event_date: true,
            location: true, timing_from: true, timing_to: true, status: true, vendor_id: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Drop rows whose lead somehow isn't this vendor (belt + braces)
    const owned = rows.filter(r => r.leads && (req.user.role === 'super_admin' || r.leads.vendor_id === v));

    const upcoming = [];
    const past = [];
    for (const r of owned) {
      const key = eventKey(r.leads.event_date);
      const item = shapeRow(r);
      // Done (checked out) always belongs in Past — even if the event date is
      // still in the future. Otherwise date-only past; undated stays Upcoming.
      if (r.checked_out_at || (key && key < today)) past.push(item);
      else upcoming.push(item);
    }

    upcoming.sort((a, b) => String(a.event_date || '9999').localeCompare(String(b.event_date || '9999'))
      || String(a.arrive_time || '').localeCompare(String(b.arrive_time || '')));
    past.sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));

    const list = view === 'past' ? past : upcoming;

    // Hours roll-up for the past view (and always returned so the UI can show
    // period chips without a second round-trip).
    const from = periodStart(period);
    const totalsMap = new Map();
    for (const item of past) {
      // Prefer checkout day for Done jobs so future-dated completed work still
      // lands in this week's / month's hours roll-up.
      const k = eventKey(item.checked_out_at) || eventKey(item.event_date);
      if (!k || k < from || k > today) continue;
      if (item.hours == null) continue;
      const cur = totalsMap.get(item.member_id) || {
        member_id: item.member_id,
        member_name: item.member_name,
        hours: 0,
        jobs: 0,
      };
      cur.hours = Math.round((cur.hours + item.hours) * 100) / 100;
      cur.jobs += 1;
      totalsMap.set(item.member_id, cur);
    }

    res.json({
      view,
      period,
      period_from: from,
      period_to: today,
      assignments: list,
      totals: [...totalsMap.values()].sort((a, b) => a.member_name.localeCompare(b.member_name)),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, role, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const member = await prisma.crew_members.create({
      data: {
        vendor_id: Number(vid(req)),             // 🔒 tenancy
        name, role: role || null, phone: phone || null, email: email || null,
      },
    });
    res.status(201).json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.crew_members.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const { name, role, phone, email } = req.body;
    const data = { role: role ?? null, phone: phone ?? null, email: email ?? null };
    if (name !== undefined && name !== null) data.name = name;   // COALESCE($1,name)
    const member = await prisma.crew_members.update({ where: { id }, data });
    res.json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.crew_members.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.crew_members.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 📅 EVENT CREW (assign to lead + schedule) ── */
async function leadOwned(req, res, leadId) {
  const lead = await prisma.leads.findUnique({ where: { id: Number(leadId) } });
  if (!lead) { res.status(404).json({ error: 'Lead not found' }); return null; }
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) {
    res.status(403).json({ error: 'Forbidden' }); return null;    // 🔒 tenancy
  }
  return lead;
}

router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await leadOwned(req, res, req.params.leadId);
    if (!lead) return;
    const rows = await prisma.lead_crew.findMany({
      where: { lead_id: lead.id },
      orderBy: { id: 'asc' },
      include: { crew_members: { select: { name: true, role: true, phone: true, email: true } } },
    });
    const assignments = rows.map(({ crew_members, ...a }) => ({
      ...a,
      name: crew_members?.name ?? null, role: crew_members?.role ?? null,
      phone: crew_members?.phone ?? null, email: crew_members?.email ?? null,
    }));
    res.json({ assignments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await leadOwned(req, res, req.params.leadId);
    if (!lead) return;
    const { crew_member_id, duty, arrive_time, leave_time } = req.body;
    if (!crew_member_id) return res.status(400).json({ error: 'crew_member_id required' });
    // 🔒 tenancy: the crew member must belong to the same vendor as the lead,
    // otherwise one vendor could attach another vendor's staff to their event.
    const member = await prisma.crew_members.findFirst({
      where: { id: Number(crew_member_id), vendor_id: lead.vendor_id },
      select: { id: true },
    });
    if (!member) return res.status(400).json({ error: 'Crew member not found' });
    const assignment = await prisma.lead_crew.create({
      data: {
        lead_id: lead.id, crew_member_id: member.id,
        duty: duty || null, arrive_time: arrive_time || null, leave_time: leave_time || null,
        checkin_token: crypto.randomBytes(16).toString('hex'),
      },
    });
    res.status(201).json({ assignment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assignment/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.lead_crew.findUnique({
      where: { id },
      select: { leads: { select: { vendor_id: true } } },
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && row.leads?.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.lead_crew.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 📧 Email the crew member their check-in link for this assignment.
 * Also returns the URL so the vendor can copy it without a second call.
 */
router.post('/assignment/:id/remind', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.lead_crew.findUnique({
      where: { id },
      include: {
        crew_members: { select: { name: true, email: true, vendor_id: true } },
        leads: {
          select: {
            vendor_id: true, name: true, event_type: true, event_date: true,
            location: true, timing_from: true, timing_to: true,
          },
        },
      },
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const owner = row.leads?.vendor_id ?? row.crew_members?.vendor_id;
    if (req.user.role !== 'super_admin' && owner !== vid(req)) {
      return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    }

    let token = row.checkin_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await prisma.lead_crew.update({ where: { id }, data: { checkin_token: token } });
    }

    // Prefer APP_URL; else browser Origin (frontend host); else API host as last resort
    const base = (process.env.APP_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link = `${base}/checkin/${token}`;
    const email = row.crew_members?.email;
    const when = row.leads?.event_date ? String(row.leads.event_date).slice(0, 10) : 'TBC';
    const where = row.leads?.location || 'TBC';
    const duty = row.duty || row.crew_members?.name || 'Crew';
    const times = [row.arrive_time, row.leave_time].filter(Boolean).join(' – ')
      || [row.leads?.timing_from, row.leads?.timing_to].filter(Boolean).join(' – ')
      || 'See vendor';

    // copy-link callers pass { send_email: false }; email button leaves it true/omitted
    const wantEmail = req.body?.send_email !== false && req.body?.send_email !== 'false';

    let mailed = false;
    let mailError = null;
    if (wantEmail) {
      if (email) {
        const subject = `Crew reminder · ${row.leads?.name || 'Event'} · ${when}`;
        const text = [
          `Hi ${row.crew_members.name},`,
          '',
          `You're down for: ${duty}`,
          `Client / event: ${row.leads?.name || '—'} · ${row.leads?.event_type || '—'}`,
          `When: ${when} · ${times}`,
          `Where: ${where}`,
          '',
          'Open this link on the day to check in and check out:',
          link,
          '',
          'Thanks!',
        ].join('\n');
        const html = `<p>Hi ${esc(row.crew_members.name)},</p>
<p>You're down for <strong>${esc(duty)}</strong>.</p>
<p>
  <strong>Client / event:</strong> ${esc(row.leads?.name || '—')} · ${esc(row.leads?.event_type || '—')}<br/>
  <strong>When:</strong> ${esc(when)} · ${esc(times)}<br/>
  <strong>Where:</strong> ${esc(where)}
</p>
<p><a href="${link}">Check in / check out</a></p>
<p style="color:#666;font-size:13px">${esc(link)}</p>`;
        const result = await sendAsVendor(owner, { to: email, subject, text, html });
        mailed = !!result.ok;
        if (!result.ok) mailError = result.message || result.error || 'Email failed';
      } else {
        mailError = 'This crew member has no email on file';
      }
    }

    res.json({ ok: true, link, emailed: mailed, email: email || null, error: mailed ? null : mailError });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── ✅ PUBLIC CHECK-IN (crew taps link) ── */
const MAX_CHECKIN_M = 500; // half kilometre
const geocodeCache = new Map(); // location string → { lat, lng } | { error }

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Resolve event address → lat/lng (OpenStreetMap Nominatim). Cached in-process. */
/** Resolve event address → lat/lng (OpenStreetMap Nominatim). Cached in-process.
 *  `precise` is false for city/region hits or huge bounding boxes — the 500 m
 *  gate must not run against those, or crew get blocked for vague addresses.
 */
async function geocodeLocation(location) {
  const q = String(location || '').trim();
  if (!q) return { error: 'Event has no address on file', precise: false };
  if (geocodeCache.has(q)) return geocodeCache.get(q);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'iwopo-crew-checkin/1.0 (attendance geo gate)', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      const out = { error: 'Could not look up event address right now', precise: false };
      geocodeCache.set(q, out);
      return out;
    }
    const rows = await r.json();
    if (!rows?.length) {
      const out = { error: 'Event address could not be found', precise: false };
      geocodeCache.set(q, out);
      return out;
    }
    const hit = rows[0];
    const out = {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      precise: isPreciseGeocode(hit),
    };
    geocodeCache.set(q, out);
    return out;
  } catch {
    return { error: 'Could not look up event address right now', precise: false };
  }
}

function isPreciseGeocode(hit) {
  if (!hit) return false;
  const cls = String(hit.class || '');
  const typ = String(hit.type || '');
  const coarse = new Set([
    'country', 'state', 'region', 'province', 'county', 'city', 'town', 'village',
    'municipality', 'suburb', 'neighbourhood', 'neighborhood', 'borough', 'district',
    'island', 'continent', 'archipelago', 'hamlet', 'locality',
  ]);
  if (cls === 'boundary') return false;
  if (cls === 'place' && coarse.has(typ)) return false;
  if (Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4) {
    const [south, north, west, east] = hit.boundingbox.map(Number);
    if ([south, north, west, east].every(Number.isFinite)) {
      const midLon = (west + east) / 2;
      const midLat = (south + north) / 2;
      const heightM = haversineM(south, midLon, north, midLon);
      const widthM = haversineM(midLat, west, midLat, east);
      // City-sized boxes are not reliable enough for a 500 m check
      if (Math.max(heightM, widthM) > 2500) return false;
    }
  }
  return Number.isFinite(Number(hit.lat)) && Number.isFinite(Number(hit.lon));
}

router.get('/checkin/:token', async (req, res) => {
  try {
    const a = await prisma.lead_crew.findFirst({
      where: { checkin_token: req.params.token },   // the token is the access key
      include: {
        crew_members: { select: { name: true } },
        leads: {
          select: {
            event_type: true, event_date: true, location: true, name: true,
            timing_from: true, timing_to: true, vendor_id: true,
          },
        },
      },
    });
    if (!a) return res.status(404).json({ error: 'Invalid link' });
    const { crew_members, leads, ...rest } = a;
    // Crew page is public — pull the vendor's clock preference so hours match the panel
    let timeFormat = '12h';
    if (leads?.vendor_id) {
      const vs = await prisma.vendor_settings.findUnique({
        where: { vendor_id: leads.vendor_id },
        select: { time_format: true },
      });
      if (vs?.time_format) timeFormat = vs.time_format;
    }
    const venue = await geocodeLocation(leads?.location);
    res.json({
      assignment: {
        ...rest,
        name: crew_members?.name ?? null,
        event_type: leads?.event_type ?? null, event_date: leads?.event_date ?? null,
        location: leads?.location ?? null, client_name: leads?.name ?? null,
        timing_from: leads?.timing_from ?? null, timing_to: leads?.timing_to ?? null,
        time_format: timeFormat,
      },
      venue: venue.lat != null
        ? { lat: venue.lat, lng: venue.lng, precise: !!venue.precise }
        : null,
      venue_error: venue.error || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkin/:token', async (req, res) => {
  try {
    const { action, declarations, lat, lng } = req.body; // in | out
    const a = await prisma.lead_crew.findFirst({
      where: { checkin_token: req.params.token },
      include: { leads: { select: { location: true } } },
    });
    if (!a) return res.status(404).json({ error: 'Invalid link' });

    if (action === 'out') {
      const assignment = await prisma.lead_crew.update({
        where: { id: a.id },
        data: { checked_out_at: new Date() },
      });
      return res.json({ assignment });
    }

    // ── Submit attendance (check-in) — declarations + location ──
    const d = declarations || {};
    const need = ['on_time', 'dressed', 'professional', 'location_on'];
    if (!need.every(k => d[k] === true)) {
      return res.status(400).json({ error: 'Please tick all declarations before submitting' });
    }

    const skipped = req.body.location_skipped === true;
    const crewLat = Number(lat);
    const crewLng = Number(lng);
    const hasCoords = Number.isFinite(crewLat) && Number.isFinite(crewLng);

    // Prefer real GPS. If the browser permanently blocked permission, the
    // client may send location_skipped so attendance is not stuck.
    if (!skipped && (!hasCoords || d.location_on !== true)) {
      return res.status(400).json({ error: 'Location must be turned on to submit attendance' });
    }
    if (skipped && d.location_on !== true) {
      return res.status(400).json({ error: 'Please confirm the location declaration before submitting' });
    }

    const venue = await geocodeLocation(a.leads?.location);
    let distanceM = null;
    if (!skipped && hasCoords && venue.lat != null && venue.lng != null && venue.precise) {
      distanceM = haversineM(crewLat, crewLng, venue.lat, venue.lng);
      if (distanceM > MAX_CHECKIN_M) {
        return res.status(400).json({
          error: `You are about ${(distanceM / 1000).toFixed(1)} km from the event. You must be within 500 m to submit attendance.`,
          distance_m: Math.round(distanceM),
        });
      }
    }

    const assignment = await prisma.lead_crew.update({
      where: { id: a.id },
      data: { checked_in_at: new Date() },
    });
    res.json({
      assignment,
      distance_m: distanceM != null ? Math.round(distanceM) : null,
      distance_enforced: !!(!skipped && venue.precise && venue.lat != null),
      location_skipped: skipped,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
