/**
 * 📇 Tornado's contact index — one short line per person (Raj, 2026-10-11).
 *
 * "If somebody texts or calls me, or sends a lead, it should be able to tell
 * me: this same number contacted you last year on April 13 about this — and
 * whether they booked, whether we did the event, whether we delivered."
 *
 * Every person the business has ever dealt with — from leads (each inquiry,
 * its status, event, date, delivered), calls and texts, galleries, payments
 * and contracts — becomes ONE compact line, keyed by phone (last 10 digits),
 * else email, else name. The lines are rebuilt every 5 minutes (a fraction of
 * a second: it is a few hundred rows read and short text written), and
 * lookup_contact searches them instantly; Tornado drills into get_lead or
 * calls_and_messages only when it needs more.
 *
 * Kept up to date without rebuilding (Raj, 2026-10-11):
 *   every 10 s  — new or changed leads, new calls and texts, new payments:
 *                 only those people's lines are redone (a few ms);
 *   every 5 min — new galleries and changed contracts, the same way;
 *   3 AM nightly — one full rebuild as a safety net.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';

const ten = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const fmtPhone = (t) => (t.length === 10 ? `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6)}` : t);
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '?');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
/** A stored call transcript ({"v":1,"lines":[{text,us}]}) or plain text → readable words. */
function spoken(raw) {
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j?.lines)) return j.lines.map(x => `${x.us ? 'You' : 'They'}: ${x.text}`).join(' ');
  } catch { /* plain text */ }
  return String(raw || '');
}
const STATUS = { new: 'inquiry, not booked', contacted: 'contacted, not booked', quoted: 'packages sent, not booked', lost: 'did NOT proceed', booked: 'BOOKED' };

/**
 * Rebuild the index for one vendor — all of it, or only the people a change
 * touched (`only`: { phones: [10 digits], emails: [], names: [] }).
 */
export async function buildContactIndex(vendorId, only = null) {
  const v = Number(vendorId);
  const ph = [...new Set((only?.phones || []).map(ten).filter(x => x.length >= 7))];
  const em = [...new Set((only?.emails || []).filter(Boolean).map(x => String(x).toLowerCase()))];
  const nm = [...new Set((only?.names || []).filter(Boolean).map(x => String(x).trim()))];
  if (only && !ph.length && !em.length && !nm.length) return 0;
  const leadWhere = !only ? { vendor_id: v } : { vendor_id: v, OR: [...ph.map(p => ({ phone: { contains: p.slice(-7) } })), ...em.map(e => ({ email: { equals: e, mode: 'insensitive' } })), ...nm.map(n => ({ name: { equals: n, mode: 'insensitive' } }))] };
  const commsWhere = !only ? { vendor_id: v } : { vendor_id: v, OR: ph.flatMap(p => [{ from_number: { endsWith: p } }, { to_number: { endsWith: p } }]) };
  const albumWhere = !only ? { vendor_id: v } : { vendor_id: v, OR: [...em.map(e => ({ client_email: { equals: e, mode: 'insensitive' } })), ...nm.map(n => ({ title: { contains: n.split(' ')[0], mode: 'insensitive' } }))] };
  const people = new Map();               // key → person
  const keyOf = (phone, email, name) => (ten(phone) ? `p:${ten(phone)}` : email ? `e:${String(email).toLowerCase()}` : name ? `n:${String(name).toLowerCase().trim()}` : null);
  const get = (k) => { if (!people.has(k)) people.set(k, { name: '', phone: '', email: '', leads: [], comms: null, galleries: [], first: null, last: null }); return people.get(k); };
  const seen = (p, d) => { if (!d) return; d = new Date(d); if (!p.first || d < p.first) p.first = d; if (!p.last || d > p.last) p.last = d; };

  // 📋 leads — every inquiry, with its money, contract and delivery
  const leads = await prisma.leads.findMany({
    where: leadWhere,
    select: { id: true, name: true, email: true, phone: true, status: true, event_type: true, event_date: true, location: true, delivered: true, created_at: true, archived_at: true, package_snapshot: true, heard: true },
  });
  const leadIds = leads.map(l => l.id);
  const paid = Object.fromEntries((await prisma.payments.groupBy({ by: ['lead_id'], where: { vendor_id: v, lead_id: { in: leadIds } }, _sum: { amount: true } })).map(r => [r.lead_id, Number(r._sum.amount || 0)]));
  const signed = new Set((await prisma.contracts.findMany({ where: { vendor_id: v, lead_id: { in: leadIds }, signed_at: { not: null } }, select: { lead_id: true } })).map(c => c.lead_id));
  // a person found by email or name may also have calls under the number on their lead
  if (only) for (const l of leads) { const t = ten(l.phone); if (t.length >= 7 && !ph.includes(t)) { ph.push(t); commsWhere.OR.push({ from_number: { endsWith: t } }, { to_number: { endsWith: t } }); } }
  const emailKey = new Map();               // email → key, so a call and a lead by the same person meet
  for (const l of leads) {
    const k = keyOf(l.phone, l.email, l.name);
    if (!k) continue;
    const p = get(k);
    p.name ||= l.name; p.phone ||= ten(l.phone); p.email ||= l.email || '';
    if (l.email) emailKey.set(l.email.toLowerCase(), k);
    seen(p, l.created_at);
    const past = l.event_date && new Date(l.event_date) < new Date();
    const who = p.name && l.name && l.name.toLowerCase() !== p.name.toLowerCase() ? ` ${l.name}` : '';
    p.leads.push(`Lead #${l.id}${who} (${[l.event_type, l.event_date ? day(l.event_date) : null, l.location].filter(Boolean).join(', ')}; ${STATUS[l.status] || l.status || 'inquiry'}${l.status === 'booked' ? (past ? (l.delivered ? ', event done, DELIVERED' : ', event done, NOT delivered yet') : ', upcoming') : ''}${paid[l.id] ? `, paid $${paid[l.id]}` : ''}${signed.has(l.id) ? ', contract signed' : ''}${l.package_snapshot?.name ? `, ${l.package_snapshot.name}` : ''}${l.archived_at ? ', archived' : ''}; inquired ${day(l.created_at)})`);
  }

  // 📞 calls and texts, by number
  const events = (only && !commsWhere.OR.length) ? [] : await privateDb.comms_events.findMany({
    where: commsWhere,
    orderBy: { occurred_at: 'asc' },
    select: { kind: true, direction: true, from_number: true, to_number: true, contact_name: true, occurred_at: true, body: true, transcript: true, status: true },
  }).catch(() => []);
  for (const e of events) {
    const num = ten(e.direction === 'incoming' ? e.from_number : e.to_number);
    if (!num) continue;
    const p = get(`p:${num}`);
    p.phone ||= num; if (e.contact_name && !p.name) p.name = e.contact_name;
    seen(p, e.occurred_at);
    const c = (p.comms ||= { calls: 0, missed: 0, texts: 0, first: null, lastText: null, lastCall: null });
    c.first ||= e.occurred_at;
    if (e.kind === 'call') { c.calls++; if (/miss|no-answer/i.test(e.status || '')) c.missed++; c.lastCall = { at: e.occurred_at, said: e.transcript || e.body }; }
    else { c.texts++; c.lastText = { at: e.occurred_at, dir: e.direction, text: e.body }; }
  }

  // 🖼️ galleries — by the client's email, else by title matching a name
  const albums = (only && !albumWhere.OR.length) ? [] : await prisma.albums.findMany({ where: albumWhere, select: { id: true, title: true, client_email: true, created_at: true } });
  for (const a of albums) {
    let k = a.client_email ? emailKey.get(a.client_email.toLowerCase()) : null;
    if (!k) for (const [kk, p] of people) if (p.name && a.title && a.title.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) { k = kk; break; }
    if (!k) k = `n:${String(a.title).toLowerCase()}`;
    const p = get(k);
    p.name ||= a.title;
    p.galleries.push(`gallery "${a.title}" (#${a.id}, made ${day(a.created_at)})`);
  }

  // ✍️ one line each
  const rows = [];
  for (const [key, p] of people) {
    const c = p.comms;
    const parts = [
      p.name || 'Unknown',
      p.phone && `📞 ${fmtPhone(p.phone)}`,
      p.email && `✉ ${p.email}`,
      ...p.leads,
      c && `${c.calls} call${c.calls === 1 ? '' : 's'}${c.missed ? ` (${c.missed} missed)` : ''}, ${c.texts} text${c.texts === 1 ? '' : 's'}, first contact ${day(c.first)}`,
      c?.lastText && `last text ${day(c.lastText.at)} (${c.lastText.dir === 'incoming' ? 'from them' : 'from you'}): "${clip(c.lastText.text, 90)}"`,
      c?.lastCall?.said && `last call ${day(c.lastCall.at)}: ${clip(spoken(c.lastCall.said), 130)}`,
      ...p.galleries,
      !p.leads.length && !p.galleries.length && 'never sent an inquiry',
    ].filter(Boolean);
    rows.push({ vendor_id: v, key, name: clip(p.name, 120) || null, phone: p.phone || null, email: p.email || null, line: parts.join(' · ').slice(0, 1500), last_seen: p.last });
  }
  if (!only) {
    await prisma.$transaction([
      prisma.agent_contacts.deleteMany({ where: { vendor_id: v } }),
      prisma.agent_contacts.createMany({ data: rows }),
    ]);
  } else {
    // only these people's lines: the keys just rebuilt, and any old line under their number / email / name
    const keys = [...new Set([...rows.map(r => r.key), ...ph.map(p => `p:${p}`), ...em.map(e => `e:${e}`), ...nm.map(n => `n:${n.toLowerCase()}`)])];
    await prisma.$transaction([
      prisma.agent_contacts.deleteMany({ where: { vendor_id: v, key: { in: keys } } }),
      prisma.agent_contacts.createMany({ data: rows, skipDuplicates: true }),
    ]);
  }
  return rows.length;
}

/* ── keeping it current ──────────────────────────────────────────────────── */
const mark = { leadsAt: null, commsId: null, payId: null, albumsAt: null, contractsAt: null, fullOn: '' };
const agentVendors = async () => new Set((await prisma.vendor_feature_overrides.findMany({ where: { feature_key: 'agent', enabled: true }, select: { vendor_id: true } })).map(r => r.vendor_id));

/** Group changes by vendor, then redo only those people. */
async function apply(changes) {
  const on = await agentVendors();
  const byVendor = new Map();
  for (const c of changes) {
    if (!on.has(c.vendor_id)) continue;
    const b = byVendor.get(c.vendor_id) || { phones: [], emails: [], names: [] };
    if (c.phone) b.phones.push(c.phone); if (c.email) b.emails.push(c.email); if (c.name) b.names.push(c.name);
    byVendor.set(c.vendor_id, b);
  }
  for (const [v, only] of byVendor) await buildContactIndex(v, only).catch(e => console.error('[agent] contact sync', v, e.message));
}

/** Every 10 s: new or changed leads, new calls and texts, new payments. */
export async function syncContactsQuick() {
  if (mark.leadsAt === null) {           // first run: start from now
    mark.leadsAt = new Date();
    mark.commsId = (await privateDb.comms_events.aggregate({ _max: { id: true } }).catch(() => null))?._max?.id ?? 0n;
    mark.payId = (await prisma.payments.aggregate({ _max: { id: true } }))._max.id ?? 0;
    return;
  }
  const since = mark.leadsAt; mark.leadsAt = new Date();
  const leads = await prisma.leads.findMany({ where: { OR: [{ updated_at: { gt: since } }, { created_at: { gt: since } }] }, select: { vendor_id: true, phone: true, email: true, name: true } });
  const comms = await privateDb.comms_events.findMany({ where: { id: { gt: mark.commsId } }, select: { id: true, vendor_id: true, direction: true, from_number: true, to_number: true } }).catch(() => []);
  if (comms.length) mark.commsId = comms.reduce((m, e) => (e.id > m ? e.id : m), mark.commsId);
  const pays = await prisma.payments.findMany({ where: { id: { gt: mark.payId } }, select: { id: true, vendor_id: true, leads: { select: { phone: true, email: true, name: true } } } });
  if (pays.length) mark.payId = Math.max(mark.payId, ...pays.map(p => p.id));
  const changes = [
    ...leads,
    ...comms.map(e => ({ vendor_id: e.vendor_id, phone: e.direction === 'incoming' ? e.from_number : e.to_number })),
    ...pays.map(p => ({ vendor_id: p.vendor_id, ...p.leads })),
  ];
  if (changes.length) await apply(changes);
}

/** Every 5 minutes: new galleries and changed contracts — and the 3 AM full rebuild. */
export async function syncContactsSlow() {
  const now = new Date();
  const since = mark.albumsAt || new Date(now.getTime() - 10 * 60e3); mark.albumsAt = now;
  const albums = await prisma.albums.findMany({ where: { created_at: { gt: since } }, select: { vendor_id: true, client_email: true, title: true } });
  const contracts = await prisma.contracts.findMany({ where: { updated_at: { gt: since } }, select: { vendor_id: true, leads: { select: { phone: true, email: true, name: true } } } });
  await apply([
    ...albums.map(a => ({ vendor_id: a.vendor_id, email: a.client_email, name: a.title })),
    ...contracts.filter(c => c.leads).map(c => ({ vendor_id: c.vendor_id, ...c.leads })),
  ]);
  const vancouver = now.toLocaleString('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [date, hour] = vancouver.split(', ');
  if (Number(hour) === 3 && mark.fullOn !== date) {        // 🌙 once a night, the whole thing
    mark.fullOn = date;
    for (const v of await agentVendors()) await buildContactIndex(v).catch(e => console.error('[agent] contact index', v, e.message));
  }
}

/** Find people by number, email or name — the "quick scan" behind lookup_contact. */
export async function lookupContacts(vendorId, query, take = 5) {
  const v = Number(vendorId), q = String(query || '').trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const OR = [];
  if (digits.length >= 4) OR.push({ phone: { contains: digits.slice(-10) } });
  if (q.includes('@')) OR.push({ email: { contains: q.toLowerCase(), mode: 'insensitive' } });
  if (/[a-z]/i.test(q)) {
    OR.push({ name: { contains: q, mode: 'insensitive' } }, { line: { contains: q, mode: 'insensitive' } });
    for (const w of q.split(/\s+/).filter(w => w.length > 2)) OR.push({ name: { contains: w, mode: 'insensitive' } });
  }
  if (!OR.length) return [];
  return prisma.agent_contacts.findMany({ where: { vendor_id: v, OR }, orderBy: { last_seen: 'desc' }, take, select: { line: true } }).then(r => r.map(x => x.line));
}
