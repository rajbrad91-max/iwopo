/**
 * ⏰ AI Agent / Tornado — reminders that get more insistent as the day nears.
 *
 * Raj, 2026-10-11: "if I told Sanjeev his data is delivered on Oct 15, remind
 * me a week before and two days before… two weeks before, more serious as it
 * gets closer… and not at all once it is delivered" — and "remind me at a
 * time of day / a future date, like an alarm".
 *
 *   delivery / task — alerts 14, 7, 2 and 1 days before (10:00) and on the day
 *                     (09:00), in the vendor's own time zone; skipped once the
 *                     lead is marked delivered or edited photos went out.
 *   alarm           — one alert, at the exact time.
 *
 * The phone app schedules these alerts itself (an alarm that rings even with
 * the app closed); the server also puts each one on the bell as it falls due.
 */
import prisma from '../config/prisma.js';
import { notify } from '../routes/notifications.js';

const STEPS = [
  { days: 14, hour: 10, urgency: 'heads-up', say: 'in two weeks' },
  { days: 7, hour: 10, urgency: 'soon', say: 'in one week' },
  { days: 2, hour: 10, urgency: 'close', say: 'in two days' },
  { days: 1, hour: 10, urgency: 'urgent', say: 'tomorrow' },
  { days: 0, hour: 9, urgency: 'today', say: 'today' },
];

/** The vendor's time zone (Preferences), Vancouver if none. */
export async function zoneOf(vendorId) {
  const s = await prisma.vendor_settings.findUnique({ where: { vendor_id: Number(vendorId) }, select: { timezone: true } }).catch(() => null);
  return s?.timezone || 'America/Vancouver';
}

/** A wall-clock time in a zone ("2026-10-15", 9) → the real moment. */
export function atLocal(dateStr, hour, minute, tz) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const asSeen = new Date(new Date(guess).toLocaleString('en-US', { timeZone: tz }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess + (asUtc - asSeen));
}
const localDate = (when, tz) => new Date(when).toLocaleDateString('en-CA', { timeZone: tz });   // YYYY-MM-DD
export const nice = (when, tz) => new Date(when).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Has the work behind this reminder already gone out? */
async function delivered(r) {
  if (!r.lead_id) return false;
  const l = await prisma.leads.findUnique({ where: { id: r.lead_id }, select: { delivered: true } });
  return !!l?.delivered;
}

/** Every alert still to come (or just missed) for the vendor's open reminders. */
export async function alertsFor(vendorId, { from = new Date(Date.now() - 6 * 3600e3), days = 45 } = {}) {
  const tz = await zoneOf(vendorId);
  const until = new Date(Date.now() + days * 86400e3);
  const open = await prisma.agent_reminders.findMany({
    where: { vendor_id: Number(vendorId), done_at: null, due_at: { gte: new Date(Date.now() - 2 * 86400e3) } },
    orderBy: { due_at: 'asc' },
  });
  const out = [];
  for (const r of open) {
    if (await delivered(r)) continue;
    if (r.kind === 'alarm') {
      if (r.due_at >= from && r.due_at <= until) out.push({ id: `${r.id}-0`, reminder_id: r.id, at: r.due_at, urgency: 'alarm', title: `⏰ ${r.title}`, body: `Reminder for ${nice(r.due_at, tz)}` });
      continue;
    }
    const day = localDate(r.due_at, tz);
    for (const s of STEPS) {
      const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - s.days);
      const at = atLocal(d.toISOString().slice(0, 10), s.hour, 0, tz);
      if (at < from || at > until || at > new Date(r.due_at.getTime() + 86400e3)) continue;
      out.push({
        id: `${r.id}-${s.days}`, reminder_id: r.id, at, urgency: s.urgency,
        title: `${s.days <= 1 ? '🚨' : s.days <= 2 ? '⚠️' : '📅'} ${r.title} — ${s.say}`,
        body: `Due ${new Date(r.due_at).toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })}${r.kind === 'delivery' ? ' · not marked delivered yet' : ''}`,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** What is due soon, as one short line for Tornado to mention after hello. */
export async function dueSoonLine(vendorId) {
  const tz = await zoneOf(vendorId);
  const open = await prisma.agent_reminders.findMany({ where: { vendor_id: Number(vendorId), done_at: null, due_at: { lte: new Date(Date.now() + 14 * 86400e3) } }, orderBy: { due_at: 'asc' }, take: 6 });
  const items = [];
  for (const r of open) {
    if (await delivered(r)) continue;
    const daysLeft = Math.round((new Date(localDate(r.due_at, tz)) - new Date(localDate(new Date(), tz))) / 86400e3);
    items.push(`${r.title} (${daysLeft < 0 ? `${-daysLeft} days OVERDUE` : daysLeft === 0 ? 'TODAY' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`})`);
  }
  return items.length ? items.join('; ') : 'nothing';
}

/* Every 15 minutes: an alert that has just fallen due also goes on the bell
   (and from there to any device with pop-ups) — the phone app rings by itself.
   last_alert_at remembers the latest one sent, so a restart never repeats it. */
export async function sweepReminders() {
  const vendors = await prisma.agent_reminders.findMany({ where: { done_at: null }, distinct: ['vendor_id'], select: { vendor_id: true } });
  for (const { vendor_id } of vendors) {
    const due = (await alertsFor(vendor_id, { from: new Date(Date.now() - 6 * 3600e3), days: 0.0001 })).filter(a => a.at <= new Date());
    for (const a of due) {
      const r = await prisma.agent_reminders.findUnique({ where: { id: a.reminder_id }, select: { last_alert_at: true } });
      if (r?.last_alert_at && r.last_alert_at >= a.at) continue;
      await prisma.agent_reminders.update({ where: { id: a.reminder_id }, data: { last_alert_at: a.at } });
      await notify(vendor_id, a.title, a.body, 'reminder');
    }
  }
}
