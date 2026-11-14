/**
 * 🌦️ GET /api/weather/dashboard — the small forecast beside the dashboard tiles (Raj, 2026-11-14).
 *
 * Raj's rule: when the vendor's next booked event is within 7 days, show the forecast for that ONE event — its day
 * and its place. Otherwise show today and tomorrow where the vendor is (the city of their time zone).
 *
 * → { mode: 'event', lead_id, name, event, date, place, day: { code, max, min, rain }, unit }
 * → { mode: 'days', place, days: [today, tomorrow], unit }
 * → { mode: 'none' } when there is nothing to show or the weather service is down — the card simply stays hidden.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { actingVendorId } from '../lib/vendorScope.js';   // 🔒 which vendor this request acts for
import { resolveTimezone } from '../lib/timezones.js';
import { eventsForLead } from '../lib/leadEvents.js';
import { countryCode, unitFor, findPlace, forecast } from '../lib/weather.js';

const router = express.Router();
const WINDOW_DAYS = 7;

/** "YYYY-MM-DD" for a day in a time zone, `plus` days from today */
function dayIn(tz, plus = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
}

/** the vendor's next booked event from today to 7 days out (any part of the booking: mehndi, wedding…), or null */
async function nextEvent(vendorId, from, to) {
  // a booking's other events sit around its main date, so look a month either side of the window
  const lo = new Date(`${from}T00:00:00Z`); lo.setUTCDate(lo.getUTCDate() - 31);
  const hi = new Date(`${to}T00:00:00Z`); hi.setUTCDate(hi.getUTCDate() + 31);
  const leads = await prisma.leads.findMany({
    where: { vendor_id: vendorId, status: 'booked', archived_at: null, event_date: { gte: lo, lte: hi } },   // 🔒 tenancy
    select: { id: true, name: true, event_type: true, event_date: true, timing_from: true, timing_to: true, location: true, hours: true, guests: true, pre_events: true },
  });
  const all = leads.flatMap(l => eventsForLead(l).map(e => ({ ...e, lead: l })))
    .filter(e => e.date >= from && e.date <= to)
    .sort((a, b) => (a.date + (a.from || '99:99')).localeCompare(b.date + (b.from || '99:99')));
  return all[0] || null;
}

router.get('/dashboard', requireAuth, async (req, res) => {
  const vendorId = Number(actingVendorId(req));
  if (!vendorId) return res.json({ mode: 'none' });
  try {
    const [vendor, settings] = await Promise.all([
      prisma.vendors.findUnique({ where: { id: vendorId }, select: { country: true } }),
      prisma.vendor_settings.findUnique({ where: { vendor_id: vendorId }, select: { timezone: true } }),
    ]);
    const cc = countryCode(vendor?.country);
    const unit = unitFor(cc);
    const { tz, city } = resolveTimezone(settings?.timezone, vendor?.country);
    const today = dayIn(tz);
    const home = city ? await findPlace(city, cc) : null;

    const ev = await nextEvent(vendorId, today, dayIn(tz, WINDOW_DAYS));
    if (ev) {
      // the event's own place, else the booking's, else home — the forecast is for where the vendor will be
      const where = (ev.location && await findPlace(ev.location, cc)) || (ev.lead.location && await findPlace(ev.lead.location, cc)) || home;
      if (where) {
        const day = (await forecast(where.lat, where.lon, unit)).find(d => d.date === ev.date);
        if (day) {
          return res.json({ mode: 'event', lead_id: ev.lead.id, name: ev.lead.name || '', event: ev.name || '', date: ev.date,
            place: where.name, day: { code: day.code, max: day.max, min: day.min, rain: day.rain }, unit });
        }
      }
    }

    if (!home) return res.json({ mode: 'none' });
    const days = (await forecast(home.lat, home.lon, unit)).filter(d => d.date >= today).slice(0, 2);
    res.json(days.length ? { mode: 'days', place: home.name, days, unit } : { mode: 'none' });
  } catch (e) {
    // the weather is a nicety: a slow or broken weather service must never break the dashboard
    console.warn('weather:', e.message);
    res.json({ mode: 'none' });
  }
});

export default router;
