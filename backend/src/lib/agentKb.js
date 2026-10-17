/**
 * 📚 Tornado's knowledge base — every page of the panel as plain sentences
 * (Raj's lessons, 2026-10-12: "convert every piece of data in iwopo — leads,
 * bookings, galleries, every text field — into sentences in the database so
 * I can find it easily"; "every page in the vendor panel a separate tab").
 *
 * One sentence per record, per section (= a page of the panel). kbSync reads
 * the live tables and writes ONLY what changed (new, edited, gone) — leads,
 * bookings, money and calls follow a change within ~10 s (lib/agentContacts
 * quick sync), everything else every 5 minutes. search_knowledge finds lines
 * by words; the Knowledge page shows each section as a tab.
 */
import prisma from '../config/prisma.js';
import { emailWarning } from './emailCheck.js';

export const SECTIONS = [
  ['leads', '📋 Leads'], ['bookings', '📅 Bookings'], ['money', '💰 Contracts & Invoices'], ['calls', '📞 Calls & Messages'],
  ['galleries', '🖼️ Galleries'], ['selections', '✅ Photo Selection'], ['crew', '👥 Crew'], ['packages', '📦 Packages'],
  ['fileflyer', '📁 File Flyer'], ['raws', '🎞️ Raw Selector'], ['occasions', '🎉 Occasions'], ['reminders', '⏰ Reminders'], ['analytics', '📊 Analytics'],
];
const TZ = 'America/Vancouver';
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const at = (d) => (d ? new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);
const money = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const clip = (s, n = 160) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const STATUS = { new: 'a new inquiry (not booked)', contacted: 'contacted, not booked', quoted: 'packages sent, not booked', lost: 'lost — did not proceed', booked: 'BOOKED' };

/** What a lead is worth: the package they chose, an override, the assigned package, or the quoted range. */
function priceOf(l, chosen, quoted, pkg) {
  if (chosen) return { value: Number(chosen.price), text: `${money(chosen.price)} (${chosen.name}, chosen)` };
  if (l.price_override !== null && l.price_override !== undefined) return { value: Number(l.price_override), text: `${money(l.price_override)} (custom price)` };
  if (pkg?.base_price) return { value: Number(pkg.base_price), text: `${money(pkg.base_price)} (${pkg.name})` };
  if (quoted?.length) {
    const p = quoted.map(q => Number(q.price)).filter(x => x > 0);
    if (p.length) { const lo = Math.min(...p), hi = Math.max(...p); return { value: hi, text: lo === hi ? `${money(hi)} quoted` : `${money(lo)}–${money(hi)} quoted (${quoted.length} options)` }; }
  }
  return { value: null, text: null };
}

/**
 * One record = one line in a FIXED layout Tornado can skim in an instant:
 *   "<who / what> | label: value | label: value | …"
 * — the name first, then the same labels in the same order for every record of
 * a section; empty fields are left out. The Knowledge page shows each line as a
 * card (title + labelled rows). Notes — the client's, the private ones and the
 * booking notes — are kept in full on leads and bookings (Raj, 2026-10-12).
 */
const line = (title, fields) => [title, ...fields.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false).map(([k, v]) => `${k}: ${v}`)].join(' | ');
const note = (x, n = 400) => (x ? clip(x, n) : null);

async function buildSections(v, only) {
  const want = (s) => !only || only.includes(s);
  const out = [];
  const add = (section, ref, title, fields) => out.push({ section, ref: `${section}:${ref}`, text: clip(line(title, fields), 1800) });

  if (want('leads') || want('bookings') || want('money')) {
    const leads = await prisma.leads.findMany({ where: { vendor_id: v } });
    // 💵 no prices or payments here any more — money lives only in the money section and client_payment
    const [inv, crew, contracts] = await Promise.all([
      prisma.invoices.findMany({ where: { vendor_id: v } }),
      prisma.lead_crew.findMany({ where: { leads: { vendor_id: v } }, include: { crew_members: { select: { name: true, role: true } } } }),
      prisma.contracts.findMany({ where: { vendor_id: v }, select: { lead_id: true, status: true, signed_at: true, released_at: true, voided_at: true, title: true } }),
    ]);
    for (const l of leads) {
      const answers = l.custom_data && typeof l.custom_data === 'object' ? Object.values(l.custom_data).filter(x => x !== '' && x !== null && x !== false && x !== true).map(x => clip(x, 60)).join(', ') : '';
      const ew = emailWarning(l.email);
      const c = contracts.find(x => x.lead_id === l.id && !x.voided_at);
      const team = crew.filter(x => x.lead_id === l.id).map(x => `${x.crew_members?.name}${x.duty ? ` (${x.duty})` : ''}${x.arrive_time ? ` from ${x.arrive_time}` : ''}`);
      const time = l.timing_from ? `${l.timing_from}${l.timing_to ? `–${l.timing_to}` : ''}` : null;
      const contract = c ? (c.signed_at ? `signed ${day(c.signed_at)}` : c.released_at ? 'sent, not signed' : 'draft, not sent') : null;
      if (want('leads')) add('leads', l.id, `${l.name} — Lead #${l.id}`, [
        ['status', `${STATUS[l.status] || l.status || 'new'}${l.archived_at ? ', archived' : ''}`],
        ['event', l.event_type], ['date', day(l.event_date)], ['time', time], ['venue', l.location], ['guests', l.guests],
        ['phone', l.phone], ['email', l.email ? `${l.email}${ew ? ` ⚠️ ${ew}` : ''}` : null], ['instagram', l.instagram],
        ['role', l.role], ['source', l.heard], ['birthday', day(l.client_birthday)],
        ['inquired', at(l.created_at)], ['opened', l.seen_at ? 'yes' : 'NOT YET'], ['packages sent', day(l.packages_sent_at)], ['contract', contract],
        ['form answers', answers || null],
        ['client notes', note(l.notes)], ['private notes', note(l.internal_notes)], ['booking notes', note(l.booking_notes)],
      ]);
      if (want('bookings') && l.status === 'booked') {
        const past = l.event_date && new Date(l.event_date) < new Date();
        add('bookings', l.id, `${l.name} — ${l.event_type || 'event'}, ${day(l.event_date) || 'date not set'}`, [
          ['state', past ? (l.delivered ? 'done, DELIVERED' : 'done, NOT delivered yet') : 'upcoming'],
          ['time', time], ['venue', l.location], ['guests', l.guests],
          ['contract', contract || 'none yet'], ['crew', team.length ? team.join(', ') : 'none assigned'],
          ['phone', l.phone], ['email', l.email],
          ['client notes', note(l.notes)], ['private notes', note(l.internal_notes)], ['booking notes', note(l.booking_notes)],
          ['lead', `#${l.id}`],
        ]);
      }
    }
    if (want('money')) for (const i of inv) {
      const l = leads.find(x => x.id === i.lead_id);
      add('money', `inv${i.id}`, `Invoice ${i.invoice_number || `#${i.id}`} — ${l?.name || 'a client'}`, [['total', money(i.total)], ['paid', money(i.paid)], ['balance', money(i.balance)], ['status', i.status], ['made', day(i.created_at)], ['notes', note(i.notes, 200)]]);
    }
    if (want('money')) for (const c of contracts) {
      const l = leads.find(x => x.id === c.lead_id);
      add('money', `con${c.lead_id}-${c.title || ''}`.slice(0, 70), `Contract "${c.title || 'contract'}" — ${l?.name || 'a client'}`, [['state', c.voided_at ? 'voided' : c.signed_at ? `signed ${day(c.signed_at)}` : c.released_at ? `sent ${day(c.released_at)}, not signed yet` : 'draft, not sent']]);
    }
  }

  if (want('calls')) {
    const rows = await prisma.agent_contacts.findMany({ where: { vendor_id: v }, select: { key: true, line: true } });
    // the contact index already reads "name · 📞 … · calls: … · texts: …" — same layout, "|" between fields
    for (const r of rows) if (/calls:|texts:/.test(r.line)) { const [title, ...rest] = r.line.split(' · '); add('calls', r.key, title, rest.map(x => {
      if (x.startsWith('📞 ')) return ['phone', x.slice(3)];
      if (x.startsWith('✉ ')) return ['email', x.slice(2)];
      if (x.startsWith('⚠️ ')) return ['warning', x.slice(3)];
      if (/^first contact /.test(x)) return ['first contact', x.slice(14)];
      if (/^Lead #\d+/.test(x)) return ['inquiry', x];
      if (/^gallery /.test(x)) return ['gallery', x.slice(8)];
      const m = x.match(/^([a-z][a-z ']{1,40}):\s(.*)$/i);
      return m ? [m[1], m[2]] : ['note', x];
    })); }
  }

  if (want('galleries') || want('selections') || want('raws')) {
    const albums = await prisma.albums.findMany({ where: { vendor_id: v }, select: { id: true, title: true, category: true, created_at: true, exp_enabled: true, exp_date: true, client_email: true } });
    const ids = albums.map(a => a.id);
    const videos = await prisma.photos.groupBy({ by: ['album_id'], where: { vendor_id: v, kind: 'video' }, _count: { _all: true } });   // 🔒
    const [photos, tabs, sel, favs, notes, raws] = await Promise.all([
      prisma.photos.groupBy({ by: ['album_id'], where: { vendor_id: v, NOT: { kind: 'video' } }, _count: { _all: true } }),   // 🎞️ photos only — videos counted apart
      prisma.album_events.findMany({ where: { vendor_id: v }, select: { album_id: true, name: true, delivery: true } }),
      prisma.selections.groupBy({ by: ['album_id'], where: { album_id: { in: ids } }, _count: { _all: true } }),
      prisma.favorites.groupBy({ by: ['album_id'], where: { album_id: { in: ids } }, _count: { _all: true } }),
      prisma.selection_notes.findMany({ where: { album_id: { in: ids } } }),
      prisma.raw_files.findMany({ where: { vendor_id: v }, select: { album_id: true, photo_id: true, delivered_at: true, delete_after: true } }),
    ]);
    const cnt = (list, id) => list.find(x => x.album_id === id)?._count._all || 0;
    for (const a of albums) {
      const t = tabs.filter(x => x.album_id === a.id), n = notes.find(x => x.album_id === a.id), r = raws.filter(x => x.album_id === a.id);
      if (want('galleries')) add('galleries', a.id, `${a.title} — Gallery #${a.id}`, [['type', a.category], ['kind', a.kind === 'liveshoot' ? 'live shoot' : null], ['photos', cnt(photos, a.id)], ['videos', cnt(videos, a.id) || null], ['tabs', t.filter(x => !x.delivery).map(x => x.name).join(', ')], ['delivered edits', t.filter(x => x.delivery).map(x => x.name).join(', ')], ['favourites', cnt(favs, a.id)], ['selection', n?.completed_at ? `sent ${day(n.completed_at)}` : cnt(sel, a.id) ? `${cnt(sel, a.id)} picked, still picking` : null], ['expires', a.exp_enabled ? day(a.exp_date) : 'never'], ['client email', a.client_email], ['made', day(a.created_at)]]);
      if (want('selections') && (n || cnt(sel, a.id))) add('selections', a.id, `${a.title} — photo selection`, [['state', n?.completed_at ? `SENT ${at(n.completed_at)}` : 'still picking'], ['picked', cnt(sel, a.id)], ['client note', note(n?.note, 300)], ['last activity', at(n?.updated_at)]]);
      if (want('raws') && r.length) add('raws', a.id, `${a.title} — Raw Selector`, [['RAW files', r.length], ['matched to photos', r.filter(x => x.photo_id).length], ['delivered', r.filter(x => x.delivered_at).length], ['RAWs deleted on', r.some(x => x.delete_after) ? day(r.filter(x => x.delete_after).sort((x, y) => x.delete_after - y.delete_after)[0].delete_after) : null]]);
    }
  }

  if (want('crew')) {
    const members = await prisma.crew_members.findMany({ where: { vendor_id: v } });
    const jobs = await prisma.lead_crew.findMany({ where: { crew_member_id: { in: members.map(m => m.id) } }, include: { leads: { select: { name: true, event_date: true, event_type: true } } } });
    for (const m of members) {
      const j = jobs.filter(x => x.crew_member_id === m.id).sort((a, b) => new Date(a.leads.event_date) - new Date(b.leads.event_date));
      add('crew', m.id, `${m.name} — crew`, [['role', m.role], ['phone', m.phone], ['email', m.email], ['works', j.length ? j.map(x => `${x.leads.name} ${x.leads.event_type || ''} ${day(x.leads.event_date) || ''}${x.duty ? ` as ${x.duty}` : ''}${x.arrive_time ? ` from ${x.arrive_time}` : ''}`.replace(/\s+/g, ' ').trim()).join('; ') : 'no events assigned']]);
    }
  }

  if (want('packages')) {
    const pk = await prisma.vendor_packages.findMany({ where: { vendor_id: v }, orderBy: { sort_order: 'asc' } });
    for (const p of pk) add('packages', p.id, `${p.name} — package`, [['price', money(p.base_price)], ['hours included', p.included_hours], ['extra hour', money(p.per_hour_price)], ['default', p.is_default ? 'yes' : null]]);
  }

  if (want('fileflyer')) {
    const shares = await prisma.file_shares.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 200 });
    for (const sh of shares) add('fileflyer', sh.id, `${sh.title} — File Flyer share`, [['made', day(sh.created_at)], ['expires', day(sh.expires_at) || 'never'], ['clients can upload', sh.allow_upload ? 'yes' : null], ['password', sh.password ? 'yes' : null], ['note', note(sh.note, 200)]]);
  }

  if (want('occasions')) {
    const list = await (await import('../routes/occasions.js')).upcomingFor(v, 60).catch(() => []);
    for (const o of (Array.isArray(list) ? list : [])) add('occasions', `${o.kind}-${o.lead_id}-${o.on || o.date || ''}`, `${o.name || 'A client'} — ${o.kind === 'birthday' ? 'birthday' : 'anniversary'}`, [['on', day(o.on || o.date)], ['in', o.days_away !== undefined ? `${o.days_away} days` : null], ['years', o.years]]);
  }

  if (want('reminders')) {
    const r = await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null } });
    for (const x of r) add('reminders', x.id, `${x.title} — reminder`, [['kind', x.kind], ['due', at(x.due_at)]]);
  }

  if (want('analytics')) {
    const since = new Date(Date.now() - 30 * 86400e3);
    const ev = await prisma.site_events.findMany({ where: { vendor_id: v, created_at: { gte: since } }, select: { kind: true, created_at: true } });
    const byDay = {};
    for (const e of ev) { const d = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: TZ }); (byDay[d] ||= {})[e.kind] = (byDay[d][e.kind] || 0) + 1; }
    for (const [d, k] of Object.entries(byDay)) add('analytics', d, `Website — ${day(d + 'T12:00:00Z')}`, Object.entries(k).map(([a2, b2]) => [a2.replace(/_/g, ' '), b2]));
  }
  return out;
}

/** Bring the sentences up to date — writes only what changed. */
export async function kbSync(vendorId, only = null) {
  const v = Number(vendorId);
  const fresh = await buildSections(v, only);
  const where = { vendor_id: v, ...(only ? { section: { in: only } } : {}) };
  const old = new Map((await prisma.agent_kb.findMany({ where, select: { ref: true, text: true } })).map(r => [r.ref, r.text]));
  const seen = new Set();
  let changed = 0;
  for (const r of fresh) {
    if (seen.has(r.ref)) continue;
    seen.add(r.ref);
    if (old.get(r.ref) === r.text) continue;
    await prisma.agent_kb.upsert({ where: { vendor_id_ref: { vendor_id: v, ref: r.ref } }, create: { vendor_id: v, section: r.section, ref: r.ref, text: r.text }, update: { text: r.text, section: r.section, updated_at: new Date() } });
    changed++;
  }
  const gone = [...old.keys()].filter(k => !seen.has(k));
  if (gone.length) await prisma.agent_kb.deleteMany({ where: { vendor_id: v, ref: { in: gone } } });
  return { changed, removed: gone.length, total: seen.size };
}

/** Find sentences by words (all words first, then any), optionally in one section. */
export async function searchKb(vendorId, query, section = null, take = 10) {
  const v = Number(vendorId);
  const words = String(query || '').toLowerCase().split(/[\s,]+/).map(w => w.replace(/[^\p{L}\p{N}@.+-]/gu, '')).filter(w => w.length > 1).slice(0, 8);
  // 💵 the money section is searched only when asked for by name — never mixed into other answers
  const base = { vendor_id: v, ...(section ? { section } : { section: { not: 'money' } }) };
  if (!words.length) return prisma.agent_kb.findMany({ where: base, orderBy: { updated_at: 'desc' }, take, select: { section: true, text: true } });
  let rows = await prisma.agent_kb.findMany({ where: { ...base, AND: words.map(w => ({ text: { contains: w, mode: 'insensitive' } })) }, take, select: { section: true, text: true } });
  if (!rows.length) {
    // 🎯 no line has every word → rank by best match instead of taking the first lines with any word
    // (2026-10-12: "Pinky wedding Saturday" — dozens of "wedding" lines crowded out Pinky's booking).
    // A word in the line's title (the name before the first "|") counts most; rare words beat common ones.
    const pool = await prisma.agent_kb.findMany({ where: { ...base, OR: words.map(w => ({ text: { contains: w, mode: 'insensitive' } })) }, take: 400, select: { section: true, text: true } });
    const df = Object.fromEntries(words.map(w => [w, pool.filter(r => r.text.toLowerCase().includes(w)).length || 1]));
    const score = (r) => {
      const t = r.text.toLowerCase(), title = t.split(' | ')[0];
      return words.reduce((n, w) => n + (title.includes(w) ? 6 : t.includes(w) ? 1 : 0) / df[w], 0);
    };
    rows = pool.map(r => [score(r), r]).sort((x, y) => y[0] - x[0]).slice(0, take).map(([, r]) => r);
  }
  return rows;
}

/** Every lead's price (lesson 8: "check ALL leads for a total price, not just those with payments"). */
export async function leadPrices(vendorId, where = {}) {
  const v = Number(vendorId);
  const leads = await prisma.leads.findMany({ where: { vendor_id: v, ...where }, select: { id: true, name: true, status: true, event_type: true, event_date: true, price_override: true, package_id: true } });
  const ids = leads.map(l => l.id);
  const [lp, vp, pays] = await Promise.all([
    prisma.lead_packages.findMany({ where: { vendor_id: v, lead_id: { in: ids } }, select: { lead_id: true, name: true, price: true, is_selected: true } }),
    prisma.vendor_packages.findMany({ where: { vendor_id: v }, select: { id: true, name: true, base_price: true } }),
    prisma.payments.groupBy({ by: ['lead_id'], where: { vendor_id: v, lead_id: { in: ids } }, _sum: { amount: true } }),
  ]);
  return leads.map(l => {
    const q = lp.filter(x => x.lead_id === l.id);
    const p = priceOf(l, q.find(x => x.is_selected), q, vp.find(x => x.id === l.package_id));
    return { id: l.id, name: l.name, status: l.status, event: [l.event_type, day(l.event_date)].filter(Boolean).join(', '), price: p.value, price_note: p.text, paid: Number(pays.find(x => x.lead_id === l.id)?._sum.amount || 0) };
  });
}
