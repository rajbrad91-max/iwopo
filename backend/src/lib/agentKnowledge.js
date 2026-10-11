/**
 * 🧠 AI Agent / Tornado — knowledge, memory and the business briefing.
 *
 * Raj, 2026-10-11: "it should have some memory… a solid connection to my
 * leads, bookings, calendar, crew… its knowledge updated every 15 minutes".
 *
 *   facts     — what the owner writes down for it (prices, policies, turnaround
 *               times, how the studio works) on the AI Agent page;
 *   memories  — what Tornado was asked to remember in conversation
 *               ("remember that Sanjeev prefers WhatsApp");
 *   briefing  — a short picture of the business, rebuilt every 15 minutes from
 *               the live tables: leads, bookings (the calendar), crew,
 *               packages, reminders. Tornado gets all three at the start of
 *               every conversation, and the tools for anything deeper.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { zoneOf, nice } from './agentReminders.js';
import { getSetting } from './settings.js';

const MAX_KNOWLEDGE = 5000;      // characters handed to the agent at the start — enough, and fast
const day = (d, tz) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/,/g, '') : '');

/** Facts first (the owner's own words), then memories, newest first — trimmed to fit. */
export async function knowledgeText(vendorId) {
  const rows = await prisma.agent_memory.findMany({ where: { vendor_id: Number(vendorId) }, orderBy: [{ kind: 'asc' }, { created_at: 'desc' }], take: 200 });
  const facts = rows.filter(r => r.kind === 'fact').map(r => `- ${r.text}`);
  const mem = rows.filter(r => r.kind === 'memory').map(r => `- ${r.text} (remembered ${day(r.created_at)})`);
  let out = [facts.length ? `Facts from the owner:\n${facts.join('\n')}` : '', mem.length ? `Things you were asked to remember:\n${mem.join('\n')}` : ''].filter(Boolean).join('\n\n');
  if (out.length > MAX_KNOWLEDGE) out = `${out.slice(0, MAX_KNOWLEDGE)}\n…(more — use recall)`;
  return out || 'nothing yet';
}

/** The business at a glance, from the live tables. */
export async function buildBriefing(vendorId) {
  const v = Number(vendorId);
  const tz = await zoneOf(v);
  const now = new Date();
  const today = new Date(now.toLocaleDateString('en-CA', { timeZone: tz }));
  const in30 = new Date(today.getTime() + 30 * 86400e3);
  const live = { vendor_id: v, archived_at: null };
  const [leadsTotal, unseen, newWeek, booked, upcoming, crew, packages, reminders, vendor] = await Promise.all([
    prisma.leads.count({ where: live }),
    prisma.leads.count({ where: { ...live, seen_at: null } }),
    prisma.leads.count({ where: { ...live, created_at: { gte: new Date(now.getTime() - 7 * 86400e3) } } }),
    prisma.leads.count({ where: { ...live, status: 'booked' } }),
    prisma.leads.findMany({ where: { ...live, status: 'booked', event_date: { gte: today, lte: in30 } }, orderBy: { event_date: 'asc' }, take: 12, select: { name: true, event_type: true, event_date: true, location: true, timing_from: true, delivered: true } }),
    prisma.crew_members.findMany({ where: { vendor_id: v }, select: { name: true, role: true }, take: 30 }),
    prisma.vendor_packages.findMany({ where: { vendor_id: v }, select: { name: true, base_price: true, included_hours: true }, orderBy: { sort_order: 'asc' }, take: 12 }),
    prisma.agent_reminders.count({ where: { vendor_id: v, done_at: null } }),
    prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true } }),
  ]);
  const undelivered = await prisma.leads.count({ where: { ...live, status: 'booked', delivered: false, event_date: { lt: today } } });
  const d14 = new Date(now.getTime() - 14 * 86400e3), d1 = new Date(now.getTime() - 86400e3);
  const [galleries, newGalleries, picking, sentSel, owed, crewJobs, shares, rawGalleries, visits, calls, texts] = await Promise.all([
    prisma.albums.count({ where: { vendor_id: v } }),
    prisma.albums.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 5, select: { title: true } }),
    prisma.selection_notes.count({ where: { albums: { vendor_id: v }, completed_at: null, updated_at: { gte: d14 } } }),
    prisma.selection_notes.findMany({ where: { albums: { vendor_id: v }, completed_at: { gte: d14 } }, select: { albums: { select: { title: true } } }, take: 8 }),
    prisma.invoices.aggregate({ where: { vendor_id: v }, _sum: { balance: true } }),
    prisma.lead_crew.count({ where: { leads: { vendor_id: v, event_date: { gte: today, lte: new Date(today.getTime() + 14 * 86400e3) } } } }),
    prisma.file_shares.count({ where: { vendor_id: v, OR: [{ expires_at: null }, { expires_at: { gte: now } }] } }),
    prisma.raw_files.groupBy({ by: ['album_id'], where: { vendor_id: v, delivered_at: null } }),
    prisma.site_events.count({ where: { vendor_id: v, created_at: { gte: new Date(now.getTime() - 7 * 86400e3) } } }),
    privateDb.comms_events.count({ where: { vendor_id: v, kind: 'call', occurred_at: { gte: d1 } } }).catch(() => null),
    privateDb.comms_events.count({ where: { vendor_id: v, kind: { not: 'call' }, occurred_at: { gte: d1 } } }).catch(() => null),
  ]);
  const lines = [
    `Business: ${vendor?.business_name || ''} · time zone ${tz}`,
    `Leads: ${leadsTotal} active, ${unseen} not opened yet, ${newWeek} new this week · ${booked} booked in all`,
    `Bookings in the next 30 days (the calendar): ${upcoming.length ? upcoming.map(l => `${day(l.event_date)} ${l.name} (${l.event_type || 'event'}${l.location ? `, ${l.location}` : ''}${l.timing_from ? `, from ${l.timing_from}` : ''})`).join('; ') : 'none'}`,
    `Past events booked but not marked delivered: ${undelivered}`,
    `Crew: ${crew.length ? crew.map(c => `${c.name}${c.role ? ` (${c.role})` : ''}`).join(', ') : 'none listed'}`,
    `Packages: ${packages.length ? packages.map(p => `${p.name}${p.base_price ? ` $${Number(p.base_price)}` : ''}${p.included_hours ? ` ${p.included_hours}h` : ''}`).join(', ') : 'none'}`,
    `Open reminders: ${reminders}`,
    `Galleries: ${galleries} (newest: ${newGalleries.map(g => g.title).join(', ') || 'none'}) · RAWs waiting for edits in ${rawGalleries.length} galleries`,
    `Photo selections: ${sentSel.length} sent in the last 2 weeks (${sentSel.map(s => s.albums.title).join(', ') || 'none'}) · ${picking} clients still picking`,
    `Money owed on invoices: $${Number(owed._sum.balance || 0).toFixed(2)}`,
    `Crew assignments in the next 2 weeks: ${crewJobs}`,
    `File Flyer: ${shares} active shared links`,
    `Website: ${visits} visits/events in the last 7 days`,
    ...(calls === null ? [] : [`Calls & texts in the last 24 h: ${calls} calls, ${texts} texts`]),
    `Briefing made ${nice(now, tz)}`,
  ];
  const text = lines.join('\n');
  await prisma.agent_briefing.upsert({ where: { vendor_id: v }, create: { vendor_id: v, text }, update: { text, updated_at: now } });
  return text;
}

/** The latest briefing — rebuilt if older than 5 minutes. */
export async function briefingText(vendorId) {
  const b = await prisma.agent_briefing.findUnique({ where: { vendor_id: Number(vendorId) } });
  if (b && Date.now() - new Date(b.updated_at).getTime() < 5 * 60e3) return b.text;
  return buildBriefing(vendorId);
}

/**
 * A finished conversation → two to four lines of what was said, decided and
 * promised (the typed AI Agent's Claude key writes it — a fraction of a cent).
 * Falls back to the last lines of the transcript if there is no key.
 */
export async function saveConversation(vendorId, turns, startedAt) {
  const lines = (Array.isArray(turns) ? turns : []).filter(t => t && t.text).slice(-80)
    .map(t => `${t.role === 'user' ? 'Owner' : 'Tornado'}: ${String(t.text).slice(0, 600)}`);
  if (lines.length < 2) return null;
  const transcript = lines.join('\n').slice(0, 20000);
  let summary = '';
  const key = await getSetting('agent_api_key', '');
  if (key) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: (await getSetting('agent_model', '')) || 'claude-haiku-5-5', max_tokens: 400,
          messages: [{ role: 'user', content: `Summarise this voice conversation between a wedding-business owner and his assistant Tornado in 2-4 short lines for Tornado's memory: who/what was discussed (client names), what was decided or done, anything promised or still open. No preamble.\n\n${transcript}` }],
        }),
      });
      const d = await r.json();
      summary = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
    } catch { /* fall back below */ }
  }
  if (!summary) summary = lines.slice(-6).join(' / ').slice(0, 600);
  return prisma.agent_conversations.create({ data: { vendor_id: Number(vendorId), summary: summary.slice(0, 1500), transcript, started_at: startedAt ? new Date(startedAt) : null } });
}

/** The last few conversations, newest first — what Tornado starts each new one with. */
export async function recentConversations(vendorId, take = 6) {
  const tz = await zoneOf(vendorId);
  const rows = await prisma.agent_conversations.findMany({ where: { vendor_id: Number(vendorId) }, orderBy: { created_at: 'desc' }, take, select: { summary: true, created_at: true } });
  return rows.length ? rows.map(r => `- ${nice(r.created_at, tz)}: ${r.summary}`).join('\n') : 'none yet';
}

/** Every 5 minutes: fresh briefings for every vendor with the AI Agent switched on. */
export async function refreshBriefings() {
  const on = await prisma.vendor_feature_overrides.findMany({ where: { feature_key: 'agent', enabled: true }, select: { vendor_id: true } });
  for (const { vendor_id } of on) await buildBriefing(vendor_id).catch(e => console.error('[agent] briefing', vendor_id, e.message));
}
