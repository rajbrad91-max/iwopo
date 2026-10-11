/**
 * 🌪️ AI Agent / Tornado — the whole panel, read-only.
 *
 * Raj, 2026-10-11: "it should have access to the entire panel… calls and
 * messages, galleries, crew, photo selection, File Flyer, Raw Selector,
 * analytics — I should be able to ask anything". One tool per area of the
 * panel, every one scoped to the signed-in vendor (the id comes from the
 * login, never from the conversation). Changing things still goes through the
 * propose_… tools and the owner's yes.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { getFeatures } from './entitlements.js';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '') : null);
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'America/Vancouver', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);
const since = (days) => new Date(Date.now() - (Number(days) || 30) * 86400e3);
const n = (x) => (x === null || x === undefined ? null : Number(x));
const obj = (props, req = []) => ({ type: 'object', properties: props, ...(req.length ? { required: req } : {}) });

export const PANEL_TOOLS = [
  { name: 'calls_and_messages', description: 'Phone calls (with what was said, when there is a transcript) and text messages on the business line — newest first. Filter by part of a name or number, by calls or texts, and how many days back.',
    input_schema: obj({ query: { type: 'string', description: 'part of a name or phone number' }, kind: { type: 'string', description: 'call or message' }, days: { type: 'integer', description: 'how far back, default 14' } }) },
  { name: 'galleries', description: 'Client galleries — title, photos, tabs, selections, favourites, expiry, delivered tabs, RAWs. Filter by part of the title.',
    input_schema: obj({ query: { type: 'string', description: 'part of the gallery title / client name' } }) },
  { name: 'gallery_detail', description: 'One gallery in full: every tab with its photo count, delivered tabs, how many photos the client selected and favourited, whether the selection was sent, RAW files, expiry and access.',
    input_schema: obj({ album_id: { type: 'integer', description: 'the gallery id from galleries' } }, ['album_id']) },
  { name: 'photo_selections', description: 'Which clients have picked their photos — finished (sent) or still picking — with counts and notes, newest first.',
    input_schema: obj({ days: { type: 'integer', description: 'how far back, default 60' } }) },
  { name: 'file_flyer', description: 'File Flyer: shared links (title, files, expiry, who it was sent to and whether they opened it) and the latest uploaded files.',
    input_schema: obj({ days: { type: 'integer', description: 'how far back, default 60' } }) },
  { name: 'raw_selector', description: 'Raw Selector: for each gallery with RAW files — how many RAWs, how many matched to photos, edited photos delivered or not, when the RAWs will be deleted; and the editors.',
    input_schema: obj({}) },
  { name: 'analytics', description: "Website analytics for the vendor's site and inquiry form: visits and events by type, top countries and where visitors came from.",
    input_schema: obj({ days: { type: 'integer', description: 'how far back, default 30' } }) },
  { name: 'money', description: 'Invoices and payments — per client: total, paid, balance and status; and the overall money still owed. Optionally for one lead.',
    input_schema: obj({ lead_id: { type: 'integer', description: 'optional — one client' } }) },
  { name: 'crew_schedule', description: 'Who on the crew works which event: duty, arrival and leaving times, checked in or not — between two dates (default the next 30 days).',
    input_schema: obj({ from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }) },
];
export const PANEL_TOOL_NAMES = new Set(PANEL_TOOLS.map(t => t.name));

export async function runPanelTool(name, input, vendorId) {
  const v = Number(vendorId);
  switch (name) {
    case 'calls_and_messages': {
      const feats = new Set(await getFeatures(v));
      if (!feats.has('*') && !feats.has('comms')) return { error: 'Calls & messages is not switched on for this account' };
      const where = { vendor_id: v, occurred_at: { gte: since(input.days || 14) } };
      if (/^call/i.test(input.kind || '')) where.kind = 'call';
      if (/^(message|text|sms)/i.test(input.kind || '')) where.kind = { not: 'call' };
      if (input.query) {
        const q = String(input.query).slice(0, 60), digits = q.replace(/\D/g, '');
        where.OR = [{ contact_name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ from_number: { contains: digits } }, { to_number: { contains: digits } }] : [])];
      }
      const rows = await privateDb.comms_events.findMany({ where, orderBy: { occurred_at: 'desc' }, take: 25 });
      return { count: rows.length, items: rows.map(e => ({ kind: e.kind, direction: e.direction, status: e.status, who: e.contact_name || (e.direction === 'incoming' ? e.from_number : e.to_number), when: when(e.occurred_at), minutes: e.duration_sec ? Math.round(e.duration_sec / 6) / 10 : null, text: e.body ? String(e.body).slice(0, 400) : null, what_was_said: e.transcript ? String(e.transcript).slice(0, 900) : null, lead_id: e.lead_id })) };
    }
    case 'galleries': {
      const where = { vendor_id: v };
      if (input.query) where.title = { contains: String(input.query).slice(0, 60), mode: 'insensitive' };
      const albums = await prisma.albums.findMany({ where, orderBy: { created_at: 'desc' }, take: 25, select: { id: true, title: true, category: true, created_at: true, exp_enabled: true, exp_date: true, client_email: true } });
      const out = [];
      for (const a of albums) {
        const [photos, tabs, picked, favs, raws, note] = await Promise.all([
          prisma.photos.count({ where: { album_id: a.id, vendor_id: v } }),
          prisma.album_events.findMany({ where: { album_id: a.id, vendor_id: v }, select: { name: true, delivery: true } }),
          prisma.selections.count({ where: { album_id: a.id } }),
          prisma.favorites.count({ where: { album_id: a.id } }),
          prisma.raw_files.count({ where: { album_id: a.id, vendor_id: v } }),
          prisma.selection_notes.findUnique({ where: { album_id: a.id }, select: { completed_at: true } }),
        ]);
        out.push({ id: a.id, title: a.title, type: a.category, made: day(a.created_at), photos, tabs: tabs.filter(t => !t.delivery).map(t => t.name), delivered_tabs: tabs.filter(t => t.delivery).map(t => t.name), selected: picked, selection_sent: !!note?.completed_at, favourites: favs, raws, expires: a.exp_enabled ? day(a.exp_date) : 'never', client_email: a.client_email });
      }
      return { count: out.length, galleries: out };
    }
    case 'gallery_detail': {
      const a = await prisma.albums.findFirst({ where: { id: Number(input.album_id), vendor_id: v } });          // 🔒
      if (!a) return { error: 'No gallery with that id' };
      const tabs = await prisma.album_events.findMany({ where: { album_id: a.id, vendor_id: v }, orderBy: { sort_order: 'asc' } });
      const perTab = [];
      for (const t of tabs) perTab.push({ tab: t.name, delivered_edits: !!t.delivery, photos: await prisma.photos.count({ where: { album_id: a.id, vendor_id: v, event_id: t.id } }) });
      const [photos, videos, picked, favs, note, raws, rawsPaired, rawsDelivered] = await Promise.all([
        prisma.photos.count({ where: { album_id: a.id, vendor_id: v, kind: { not: 'video' } } }),
        prisma.photos.count({ where: { album_id: a.id, vendor_id: v, kind: 'video' } }),
        prisma.selections.count({ where: { album_id: a.id } }),
        prisma.favorites.count({ where: { album_id: a.id } }),
        prisma.selection_notes.findUnique({ where: { album_id: a.id } }),
        prisma.raw_files.count({ where: { album_id: a.id, vendor_id: v } }),
        prisma.raw_files.count({ where: { album_id: a.id, vendor_id: v, photo_id: { not: null } } }),
        prisma.raw_files.count({ where: { album_id: a.id, vendor_id: v, delivered_at: { not: null } } }),
      ]);
      return { id: a.id, title: a.title, type: a.category, made: day(a.created_at), photos, videos, tabs: perTab, client_selected: picked, selection: note?.completed_at ? `sent ${day(note.completed_at)}` : picked ? 'still picking' : 'not started', client_note: note?.note || null, favourites: favs, raws: { total: raws, matched_to_photos: rawsPaired, delivered: rawsDelivered }, expires: a.exp_enabled ? day(a.exp_date) : 'never', face_circles: !!a.face_ai, client_email: a.client_email, guest_login: !!a.guest_username };
    }
    case 'photo_selections': {
      const notes = await prisma.selection_notes.findMany({ where: { albums: { vendor_id: v }, updated_at: { gte: since(input.days || 60) } }, orderBy: { updated_at: 'desc' }, take: 25, select: { album_id: true, note: true, updated_at: true, completed_at: true, albums: { select: { title: true } } } });
      const out = [];
      for (const s of notes) out.push({ gallery: s.albums.title, album_id: s.album_id, picked: await prisma.selections.count({ where: { album_id: s.album_id } }), status: s.completed_at ? `sent ${day(s.completed_at)}` : 'still picking', last_activity: day(s.updated_at), client_note: s.note || null });
      return { count: out.length, selections: out };
    }
    case 'file_flyer': {
      const from = since(input.days || 60);
      const shares = await prisma.file_shares.findMany({ where: { vendor_id: v, created_at: { gte: from } }, orderBy: { created_at: 'desc' }, take: 20 });
      const out = [];
      for (const s of shares) {
        const rec = await prisma.share_recipients.findMany({ where: { share_id: s.id, vendor_id: v }, select: { sent_at: true, opened_at: true, contact_id: true } });
        const names = rec.length ? await prisma.contacts.findMany({ where: { id: { in: rec.map(r => r.contact_id) }, vendor_id: v }, select: { id: true, name: true } }) : [];
        out.push({ title: s.title, made: day(s.created_at), expires: day(s.expires_at) || 'never', clients_can_upload: s.allow_upload, password: !!s.password, sent_to: rec.map(r => ({ who: names.find(c => c.id === r.contact_id)?.name || 'contact', sent: day(r.sent_at), opened: r.opened_at ? day(r.opened_at) : 'not yet' })) });
      }
      const files = await prisma.file_share_items.findMany({ where: { vendor_id: v, created_at: { gte: from } }, orderBy: { created_at: 'desc' }, take: 15, select: { filename: true, size_bytes: true, uploaded_by: true, uploader_name: true, created_at: true } });
      return { shares: out, latest_files: files.map(f => ({ file: f.filename, mb: f.size_bytes ? Math.round(Number(f.size_bytes) / 1e5) / 10 : null, uploaded_by: f.uploader_name || f.uploaded_by, on: day(f.created_at) })) };
    }
    case 'raw_selector': {
      const groups = await prisma.raw_files.groupBy({ by: ['album_id'], where: { vendor_id: v }, _count: { _all: true } });
      const out = [];
      for (const g of groups) {
        const a = await prisma.albums.findFirst({ where: { id: g.album_id, vendor_id: v }, select: { title: true } });
        const [paired, delivered, soonest, delTabs] = await Promise.all([
          prisma.raw_files.count({ where: { album_id: g.album_id, vendor_id: v, photo_id: { not: null } } }),
          prisma.raw_files.count({ where: { album_id: g.album_id, vendor_id: v, delivered_at: { not: null } } }),
          prisma.raw_files.findFirst({ where: { album_id: g.album_id, vendor_id: v, delete_after: { not: null } }, orderBy: { delete_after: 'asc' }, select: { delete_after: true } }),
          prisma.album_events.count({ where: { album_id: g.album_id, vendor_id: v, delivery: true } }),
        ]);
        out.push({ gallery: a?.title, album_id: g.album_id, raws: g._count._all, matched_to_photos: paired, edited_delivered: delTabs > 0 || delivered > 0, raws_deleted_on: day(soonest?.delete_after) });
      }
      const editors = await prisma.raw_editors.findMany({ where: { vendor_id: v } }).catch(() => []);
      return { galleries_with_raws: out, editors: editors.map(e => ({ name: e.name || null, email: e.email })) };
    }
    case 'analytics': {
      const from = since(input.days || 30);
      const [byKind, byCountry, byRef] = await Promise.all([
        prisma.site_events.groupBy({ by: ['kind'], where: { vendor_id: v, created_at: { gte: from } }, _count: { _all: true } }),
        prisma.site_events.groupBy({ by: ['country'], where: { vendor_id: v, created_at: { gte: from } }, _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 6 }),
        prisma.site_events.groupBy({ by: ['referrer'], where: { vendor_id: v, created_at: { gte: from } }, _count: { _all: true }, orderBy: { _count: { referrer: 'desc' } }, take: 6 }),
      ]);
      const leads = await prisma.leads.count({ where: { vendor_id: v, created_at: { gte: from } } });
      return { period_days: Number(input.days) || 30, events: byKind.map(k => ({ kind: k.kind, count: k._count._all })), inquiries_received: leads, top_countries: byCountry.map(c => ({ country: c.country || 'unknown', visits: c._count._all })), top_sources: byRef.map(r => ({ from: r.referrer || 'direct', visits: r._count._all })) };
    }
    case 'money': {
      const where = { vendor_id: v, ...(input.lead_id ? { lead_id: Number(input.lead_id) } : {}) };
      const inv = await prisma.invoices.findMany({ where, orderBy: { created_at: 'desc' }, take: 40 });
      const leadNames = Object.fromEntries((await prisma.leads.findMany({ where: { id: { in: [...new Set(inv.map(i => i.lead_id))] }, vendor_id: v }, select: { id: true, name: true } })).map(l => [l.id, l.name]));
      const paidTotal = await prisma.payments.aggregate({ where, _sum: { amount: true } });
      return {
        invoices: inv.map(i => ({ client: leadNames[i.lead_id], number: i.invoice_number, total: n(i.total), paid: n(i.paid), balance: n(i.balance), status: i.status, made: day(i.created_at) })),
        owed_overall: inv.reduce((s, i) => s + (Number(i.balance) || 0), 0),
        payments_received_total: Number(paidTotal._sum.amount || 0),
      };
    }
    case 'crew_schedule': {
      const from = input.from ? new Date(input.from) : new Date(new Date().toDateString());
      const to = input.to ? new Date(input.to) : new Date(from.getTime() + 30 * 86400e3);
      const rows = await prisma.lead_crew.findMany({ where: { leads: { vendor_id: v, event_date: { gte: from, lte: to } } }, include: { leads: { select: { name: true, event_type: true, event_date: true, location: true } }, crew_members: { select: { name: true, role: true } } }, take: 80 });
      return { assignments: rows.sort((a, b) => new Date(a.leads.event_date) - new Date(b.leads.event_date)).map(r => ({ event: `${r.leads.name} (${r.leads.event_type || 'event'})`, date: day(r.leads.event_date), venue: r.leads.location, crew: r.crew_members?.name, role: r.crew_members?.role, duty: r.duty, arrive: r.arrive_time, leave: r.leave_time, checked_in: r.checked_in_at ? when(r.checked_in_at) : 'no', checked_out: r.checked_out_at ? when(r.checked_out_at) : 'no' })) };
    }
    default: return { error: `Unknown tool ${name}` };
  }
}
