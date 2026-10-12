/**
 * 📬 What Tornado tells the owner when he wakes it (Raj's rules, 2026-10-12):
 *
 *  • only what he hasn't SEEN — tied to the bell 🔔 and to opening a lead:
 *      a new lead not opened yet → every wake-up until he opens it;
 *      unseen bell items (payments, packages picked, …) → every wake-up until seen;
 *      unseen texts / calls (the bell's comms notices) → every wake-up until seen;
 *      (new emails about inquiries and Instagram messages join here once connected)
 *  • upcoming events (and reminders):
 *      within the next 2 days → at most 3 times a day;
 *      within a week          → once a day, the first conversation of the day;
 *  • nothing new → nothing: "five wake-ups in an hour must not repeat old news".
 *
 * agent_notices counts how often each event / reminder was mentioned per
 * Vancouver day, so the limits hold however often he wakes it.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { emailWarning } from './emailCheck.js';

const TZ = 'America/Vancouver';
const vDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const when = (d) => new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const dateOnly = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Days from today (Vancouver) to an event date (stored as a UTC date). */
function daysAway(eventDate) {
  const today = new Date(vDay() + 'T00:00:00Z');
  return Math.round((new Date(new Date(eventDate).toISOString().slice(0, 10) + 'T00:00:00Z') - today) / 86400e3);
}

export async function waitingForYou(vendorId, { record = true } = {}) {
  const v = Number(vendorId);
  const lines = [];

  // 📋 leads not opened yet — every wake-up until opened
  const leads = await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null, seen_at: null, created_at: { gte: new Date(Date.now() - 30 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 8, select: { id: true, name: true, event_type: true, email: true, created_at: true } });
  for (const l of leads) lines.push(`NEW LEAD not opened yet: ${l.name}${l.event_type ? ` (${l.event_type})` : ''}, came in ${when(l.created_at)}${emailWarning(l.email) ? ` — ⚠️ email ${l.email} looks wrong: ${emailWarning(l.email)}` : ''}`);

  // 🔔 unseen bell items (a lead's own "new inquiry" is covered above)
  const bell = await prisma.notifications.findMany({ where: { vendor_id: v, seen_at: null, type: { not: 'lead' }, created_at: { gte: new Date(Date.now() - 14 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 8, select: { title: true, body: true, created_at: true } });
  for (const n of bell) lines.push(`UNSEEN on the bell: ${n.title}${n.body ? ` — ${String(n.body).slice(0, 100)}` : ''} (${when(n.created_at)})`);

  // 💬📞 unseen texts and calls
  const comms = await privateDb.comms_notices.findMany({ where: { vendor_id: v, seen_at: null, created_at: { gte: new Date(Date.now() - 7 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 8, select: { title: true, body: true, created_at: true } }).catch(() => []);
  for (const c of comms) lines.push(`UNSEEN message/call: ${c.title}${c.body ? ` — "${String(c.body).slice(0, 120)}"` : ''} (${when(c.created_at)})`);

  // 📅 upcoming events and ⏰ reminders, within their daily limits
  const day = vDay();
  const allowed = async (key, limit) => {
    const row = await prisma.agent_notices.findUnique({ where: { vendor_id_day_key: { vendor_id: v, day, key } } });
    if ((row?.count || 0) >= limit) return false;
    if (record) await prisma.agent_notices.upsert({ where: { vendor_id_day_key: { vendor_id: v, day, key } }, create: { vendor_id: v, day, key, count: 1 }, update: { count: { increment: 1 } } });
    return true;
  };
  const soon = await prisma.leads.findMany({
    where: { vendor_id: v, archived_at: null, event_date: { gte: new Date(Date.now() - 86400e3), lte: new Date(Date.now() + 8 * 86400e3) }, status: { not: 'lost' } },
    orderBy: { event_date: 'asc' }, take: 12, select: { id: true, name: true, event_type: true, event_date: true, timing_from: true, location: true, status: true },
  });
  for (const e of soon) {
    const d = daysAway(e.event_date);
    if (d < 0 || d > 7) continue;
    if (!(await allowed(`event:${e.id}`, d <= 2 ? 3 : 1))) continue;
    lines.push(`EVENT ${d === 0 ? 'TODAY' : d === 1 ? 'TOMORROW' : `in ${d} days (${dateOnly(e.event_date)})`}: ${e.name}'s ${e.event_type || 'event'}${e.timing_from ? ` at ${e.timing_from}` : ''}${e.location ? `, ${e.location}` : ''}${e.status === 'booked' ? '' : ' — NOT booked yet'}`);
  }
  const rem = await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null, due_at: { lte: new Date(Date.now() + 7 * 86400e3) } }, orderBy: { due_at: 'asc' }, take: 8, select: { id: true, title: true, kind: true, due_at: true } });
  for (const r of rem) {
    const d = daysAway(r.due_at);
    if (r.kind === 'alarm' && new Date(r.due_at) < new Date()) continue;          // a rung alarm is over
    if (!(await allowed(`reminder:${r.id}`, d <= 2 ? 3 : 1))) continue;
    lines.push(`REMINDER ${d < 0 ? 'OVERDUE' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}: ${r.title} (${when(r.due_at)})`);
  }

  return lines.length ? lines.slice(0, 14).join('\n') : 'nothing new';
}
