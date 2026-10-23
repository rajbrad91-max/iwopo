/**
 * ⏰ Smart reminders (Raj, 2026-10-23): people waiting on the owner for more than a day — an unanswered text, a missed
 * call nobody returned, an email with no reply (Instagram and WhatsApp join when connected).
 *  - every 15 minutes each vendor with calls/texts or email connected is scanned
 *  - only messages that actually expect an answer become reminders (AI judgement, with a word-rule fallback)
 *  - a reply (text, call back, email in the thread) clears it by itself; so does "done" or "don't remind me"
 *  - a NEW message from the same person after "don't remind me" opens it again — it's a new question
 * Tornado and Gale read them out when woken; the AI Agent page lists them.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { getSetting } from './settings.js';
import { quoConfigs } from './quo.js';
import { awaitingReply } from './inboxGmail.js';

const DAY = 86400e3;
const MISSED = ['missed', 'no-answer', 'canceled', 'busy', 'failed'];
const keyOf = (n) => String(n || '').replace(/\D/g, '').slice(-10);

/** texts and missed calls whose latest word is theirs, more than a day ago (last 14 days) */
async function textAndCallCandidates(v) {
  const evs = await privateDb.comms_events.findMany({
    where: { vendor_id: v, occurred_at: { gte: new Date(Date.now() - 14 * DAY) } },
    orderBy: { occurred_at: 'asc' },
    select: { kind: true, direction: true, status: true, from_number: true, to_number: true, body: true, contact_name: true, occurred_at: true },
  });
  const people = new Map();
  for (const e of evs) {
    const number = e.direction === 'incoming' ? e.from_number : e.to_number;
    const k = keyOf(number);
    if (!k) continue;
    const p = people.get(k) || { k, number, name: null, inbound: null, answeredAt: 0 };
    if (e.contact_name) p.name = e.contact_name;
    const missed = e.kind === 'call' && MISSED.includes(e.status);
    if ((e.kind === 'message' && e.direction === 'incoming') || (missed && e.direction !== 'outgoing')) p.inbound = e;
    else if (e.direction === 'outgoing' || (e.kind === 'call' && !missed)) p.answeredAt = e.occurred_at.getTime();   // a reply, a call back, or a call picked up
    people.set(k, p);
  }
  return [...people.values()]
    .filter(p => p.inbound && p.inbound.occurred_at.getTime() > p.answeredAt && Date.now() - p.inbound.occurred_at.getTime() > DAY)
    .map(p => ({ channel: p.inbound.kind === 'call' ? 'call' : 'text', key: p.k, who: p.name || p.number, contact: p.number,
      snippet: p.inbound.kind === 'call' ? 'Missed call' : String(p.inbound.body || '').slice(0, 300), at: p.inbound.occurred_at }));
}

const LOOKS_LIKE_A_QUESTION = /\?|price|pricing|quote|cost|how much|availab|book|inquir|enquir|interested|package|call me|call back|let me know|when can|can you|could you|please|schedule|meeting/i;
const JUST_THANKS = /^\s*(thanks?( you)?|thank u|ok(ay)?|great|perfect|sounds good|got it|cool|👍|🙏|❤️)[\s!.]*$/i;
/** does this message expect an answer? (a missed call always does) */
async function needsReply(c) {
  if (c.channel === 'call') return true;
  const text = String(c.snippet || '').slice(0, 600);
  if (JUST_THANKS.test(text)) return false;
  const key = await getSetting('agent_api_key', '');
  if (key) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: (await getSetting('agent_model', '')) || 'claude-haiku-5-5', max_tokens: 5,
          messages: [{ role: 'user', content: `A client sent this ${c.channel} to a wedding photography/videography business. Does it expect a reply from the business (a question, a request, an inquiry, a booking or call to arrange)? Answer only yes or no.\n\n${text}` }] }),
      });
      const d = await r.json();
      const a = (d.content || []).map(x => x.text || '').join('').trim().toLowerCase();
      if (a.startsWith('yes')) return true;
      if (a.startsWith('no')) return false;
    } catch { /* fall back to the word rule */ }
  }
  return LOOKS_LIKE_A_QUESTION.test(text);
}

/** one vendor: new and changed waits are judged; anything answered since is cleared */
export async function scanVendor(v) {
  const email = await awaitingReply(v).catch(() => []);
  const cands = [...await textAndCallCandidates(v).catch(() => []), ...email.map(e => ({ channel: 'email', ...e }))];
  const known = await prisma.followups.findMany({ where: { vendor_id: v } });   // 🔒 tenancy
  for (const c of cands) {
    const row = known.find(r => r.channel === c.channel && r.thread_key === c.key);
    if (row && row.last_inbound_at.getTime() === c.at.getTime()) continue;     // already judged this message
    const status = (await needsReply(c)) ? 'open' : 'not_needed';
    const data = { who: String(c.who).slice(0, 160), contact: String(c.contact || '').slice(0, 200), snippet: c.snippet, last_inbound_at: c.at, status, snooze_until: null };
    await prisma.followups.upsert({
      where: { vendor_id_channel_thread_key: { vendor_id: v, channel: c.channel, thread_key: c.key } },
      create: { vendor_id: v, channel: c.channel, thread_key: c.key, ...data },
      update: data,
    });
  }
  const waiting = new Set(cands.map(c => `${c.channel}:${c.key}`));
  for (const r of known) if (r.status === 'open' && !waiting.has(`${r.channel}:${r.thread_key}`)) {
    await prisma.followups.update({ where: { id: r.id }, data: { status: 'done' } });   // answered (or older than two weeks)
  }
}

/** every vendor with calls & texts or email connected */
export async function scanFollowups() {
  try {
    const ids = new Set((await quoConfigs()).filter(c => c.ready).map(c => c.vendorId));
    for (const s of await prisma.platform_settings.findMany({ where: { key: { startsWith: 'gmail_link_' } }, select: { key: true } })) ids.add(Number(s.key.slice(11)));
    for (const v of ids) await scanVendor(v).catch(e => console.error(`[followups] vendor ${v}:`, e.message));
  } catch (e) { console.error('[followups] scan failed:', e.message); }
}

/** the open ones (snoozed ones come back when their time is up) */
export async function openFollowups(v) {
  return prisma.followups.findMany({
    where: { vendor_id: Number(v), status: 'open', OR: [{ snooze_until: null }, { snooze_until: { lte: new Date() } }] },
    orderBy: { last_inbound_at: 'asc' },
  });
}

/** done · mute ("don't remind me") · snooze N hours — by id, or by a name/number/email Tornado heard */
export async function actOnFollowup(v, { id, who, action, hours }) {
  const rows = await openFollowups(v);
  const t = String(who || '').toLowerCase().trim();
  const hits = id ? rows.filter(r => r.id === Number(id)) : rows.filter(r => t && `${r.who} ${r.contact}`.toLowerCase().includes(t));
  if (!hits.length) return { changed: 0 };
  const data = action === 'snooze' ? { snooze_until: new Date(Date.now() + Math.min(Math.max(Number(hours) || 24, 1), 24 * 14) * 3600e3) }
    : { status: action === 'mute' ? 'muted' : 'done' };
  await prisma.followups.updateMany({ where: { vendor_id: Number(v), id: { in: hits.map(r => r.id) } }, data });   // 🔒 tenancy
  return { changed: hits.length, who: hits.map(r => r.who) };
}

/** "Alina (email, 2 days)" — how Tornado says it */
export const waitedLabel = (r) => {
  const days = Math.max(1, Math.floor((Date.now() - new Date(r.last_inbound_at).getTime()) / DAY));
  const how = r.channel === 'call' ? 'missed call' : r.channel;
  return `${r.who} (${how}, ${days} day${days === 1 ? '' : 's'})`;
};
