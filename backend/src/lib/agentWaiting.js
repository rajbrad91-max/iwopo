/**
 * 📬 What is waiting for the owner — Tornado says it right after hello (Raj's
 * lesson, 2026-10-11: "always notify me about any unread or unseen messages,
 * calls or new inquiries"):
 *   texts nobody has answered (their message is the last one in the thread),
 *   missed calls not returned since (no call or text back),
 *   inquiries not opened yet — each with its email warning, if any.
 * Email and Instagram are not connected yet; Tornado says so when asked.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { emailWarning } from './emailCheck.js';

const ten = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const when = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Vancouver', weekday: 'short', hour: 'numeric', minute: '2-digit' });

export async function waitingForYou(vendorId) {
  const v = Number(vendorId);
  const since = new Date(Date.now() - 7 * 86400e3);
  const events = await privateDb.comms_events.findMany({
    where: { vendor_id: v, occurred_at: { gte: since } },
    orderBy: { occurred_at: 'asc' },
    select: { kind: true, direction: true, status: true, from_number: true, to_number: true, contact_name: true, body: true, occurred_at: true },
  }).catch(() => []);
  // the last thing that happened with each number
  const byNum = new Map();
  for (const e of events) {
    const n = ten(e.direction === 'incoming' ? e.from_number : e.to_number);
    if (!n) continue;
    const t = byNum.get(n) || { name: '', lastIn: null, lastOut: null, missed: null };
    if (e.contact_name) t.name = e.contact_name;
    if (e.direction === 'incoming') {
      if (e.kind === 'call' && /miss|no-answer/i.test(e.status || '')) t.missed = e;
      else if (e.kind !== 'call') t.lastIn = e;
    } else t.lastOut = e;
    byNum.set(n, t);
  }
  // a name for each number — from the contact index (a lead's name), else "the number ending 7303"
  const known = Object.fromEntries((await prisma.agent_contacts.findMany({ where: { vendor_id: v, phone: { in: [...byNum.keys()] } }, select: { phone: true, name: true } })).map(c => [c.phone, c.name]));
  const lines = [];
  for (const [n, t] of byNum) {
    const who = t.name || known[n] || `the number ending ${n.slice(-4)}`;
    if (t.lastIn && (!t.lastOut || t.lastIn.occurred_at > t.lastOut.occurred_at)) lines.push(`unanswered text from ${who} (${when(t.lastIn.occurred_at)}): "${String(t.lastIn.body || '').slice(0, 120)}"`);
    if (t.missed && (!t.lastOut || t.missed.occurred_at > t.lastOut.occurred_at)) lines.push(`missed call from ${who} (${when(t.missed.occurred_at)}), not returned`);
  }
  const leads = await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null, seen_at: null, created_at: { gte: new Date(Date.now() - 14 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 8, select: { name: true, event_type: true, email: true, created_at: true } });
  for (const l of leads) lines.push(`new inquiry not opened: ${l.name}${l.event_type ? ` (${l.event_type})` : ''}, ${when(l.created_at)}${emailWarning(l.email) ? ` — ⚠️ email ${l.email} looks wrong: ${emailWarning(l.email)}` : ''}`);
  return lines.length ? lines.slice(0, 12).join('\n') : 'nothing — every text and call has been answered and every inquiry opened';
}
