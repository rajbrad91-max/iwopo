/**
 * 🔍 Sorting and date filters for the Leads list (Raj, 2026-10-26).
 * "Today" is the VENDOR's today — midnight to midnight in their own time zone (Settings → timezone, else their
 * country's), never the server's (UTC). With no choice made, nothing here applies and the list is exactly as before.
 */
import { resolveTimezone } from './timezones.js';

export const LEAD_RANGES = ['today', 'yesterday', '7days', 'month'];
const LEAD_SORTS = {
  oldest: [{ created_at: 'asc' }],
  event: [{ event_date: { sort: 'asc', nulls: 'last' } }, { created_at: 'desc' }],
  name: [{ name: 'asc' }, { created_at: 'desc' }],
};

/** how far a time zone is ahead of UTC at a given moment, in ms */
function zoneOffset(tz, utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}
/** the UTC moment of local midnight on a calendar day in that zone (day may overflow: 0, 32… are normalised) */
function localMidnight(y, m, d, tz) {
  const n = new Date(Date.UTC(y, m - 1, d));
  const wall = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  let t = wall - zoneOffset(tz, wall);
  const again = wall - zoneOffset(tz, t);           // daylight-saving edge: settle on the offset in force at midnight
  if (again !== t) t = again;
  return new Date(t);
}
/** [from, to) in UTC for a named range, measured in the vendor's own calendar */
export function rangeBounds(range, tz, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(x => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  if (range === 'today') return [localMidnight(y, m, d, tz), localMidnight(y, m, d + 1, tz)];
  if (range === 'yesterday') return [localMidnight(y, m, d - 1, tz), localMidnight(y, m, d, tz)];
  if (range === '7days') return [localMidnight(y, m, d - 6, tz), localMidnight(y, m, d + 1, tz)];   // today and the 6 days before
  if (range === 'month') return [localMidnight(y, m, 1, tz), localMidnight(y, m + 1, 1, tz)];
  return null;
}

/** what a list request asked for → Prisma's where / orderBy (both empty when nothing was asked) */
export async function leadListing(prisma, vendorId, query = {}) {
  const sort = LEAD_SORTS[query.sort] ? query.sort : null;
  const range = LEAD_RANGES.includes(query.range) ? query.range : null;
  let where = {}, tz = null;
  if (range) {
    const [vs, v] = !vendorId ? [null, null] : await Promise.all([
      prisma.vendor_settings.findUnique({ where: { vendor_id: vendorId }, select: { timezone: true } }),
      prisma.vendors.findUnique({ where: { id: vendorId }, select: { country: true } }),
    ]);
    tz = resolveTimezone(vs?.timezone, v?.country)?.tz || 'UTC';
    const [from, to] = rangeBounds(range, tz);
    where = { created_at: { gte: from, lt: to } };
  }
  return { where, orderBy: sort ? LEAD_SORTS[sort] : null, range, sort, tz };
}
