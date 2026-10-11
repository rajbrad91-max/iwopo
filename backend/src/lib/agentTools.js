/**
 * 🤖 AI Agent — what the assistant can LOOK UP in the vendor's panel.
 *
 * Stage 1 (2026-10-10): reading only. Every tool takes the vendor id from the
 * signed-in login (never from the conversation), so it sees exactly what the
 * vendor's own panel shows — nothing of any other vendor, nothing of the
 * platform. Sending things (contracts, packages, messages) comes in stage 2,
 * each behind a yes/no confirmation.
 */
import prisma from '../config/prisma.js';
import { zoneOf, atLocal, nice } from './agentReminders.js';
import { PANEL_TOOLS, PANEL_TOOL_NAMES, runPanelTool } from './agentPanelTools.js';

/** A date as people say it, weekday included — "Mon 15 Mar 2027". Worked out
 *  here, in UTC (dates are stored as calendar days), so the model never has
 *  to compute a weekday itself; it got one wrong when it did. */
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '') : null);
/** How alike two names are, 0..1 — so "Yufi" still finds "Yuffie" (speech gets spelling wrong). */
function alike(a, b) {
  a = String(a || '').toLowerCase().replace(/[^a-z0-9 ]/g, ''); b = String(b || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (!a || !b) return 0;
  if (b.includes(a) || a.includes(b)) return 1;
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  // compare with the best-matching word too ("yuffie" vs "yuffie sharma")
  const words = b.split(' ').filter(Boolean);
  const best = Math.min(d[m][n], ...words.map(w => alike.lev(a, w)));
  return 1 - best / Math.max(a.length, 3);
}
alike.lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };

const leadLine = (l) => ({
  id: l.id, name: l.name, status: l.status || 'new', event_type: l.event_type, event_date: day(l.event_date),
  location: l.location, email: l.email, phone: l.phone, received: day(l.created_at),
});

/** The tools as Claude sees them. */
export const TOOLS = [
  {
    name: 'today_summary',
    description: "What is new and coming up for the vendor: new leads not looked at yet, events in the next 14 days, client photo selections sent recently, and the latest panel notifications. Use it for 'what's new', 'any updates', 'what's happening today'.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'find_leads',
    description: "Search the vendor's leads (inquiries and bookings). Filter by part of a name, email or phone; by status ('new', 'booked', or other statuses the panel uses); by event date range; and by the date the lead was RECEIVED (e.g. 'leads this month'). 'total' is the true count of every match; 'leads' lists up to 'limit' of them, newest first.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a name, email or phone' },
        status: { type: 'string' },
        event_from: { type: 'string', description: 'YYYY-MM-DD' },
        event_to: { type: 'string', description: 'YYYY-MM-DD' },
        received_from: { type: 'string', description: 'YYYY-MM-DD — leads that arrived on or after this day' },
        received_to: { type: 'string', description: 'YYYY-MM-DD — leads that arrived on or before this day' },
        event_type: { type: 'string', description: "e.g. 'Wedding'" },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_lead',
    description: 'Everything about one lead: contact details, event details, every answer the client gave on the inquiry form, notes, the package chosen and whether packages were sent.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'upcoming_events',
    description: 'Booked events in the next N days (default 30), soonest first.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365 } }, additionalProperties: false },
  },
  {
    name: 'list_reminders',
    description: "The vendor's open reminders — promised deliveries, tasks and alarms — soonest first, with how many days are left. Deliveries for leads already marked delivered are left out.",
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'how far ahead to look (default 60)' } } },
  },
  {
    name: 'set_reminder',
    description: "Save a reminder straight away (no yes needed — it is the vendor's own). kind 'delivery' = something promised to a client by a date (e.g. 'Sanjeev's photos'); 'task' = something to do by a date; 'alarm' = ring at an exact time ('remind me at 3pm', 'call me tomorrow at 9'). Deliveries and tasks warn two weeks, a week, two days and a day before, and on the day. Give the date as YYYY-MM-DD and, for an alarm, the time as HH:MM (24-hour) in the vendor's own time zone.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: "what it is, short: \"Deliver Sanjeev's wedding photos\"" },
        kind: { type: 'string', description: 'delivery, task or alarm' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24-hour — alarms only' },
        lead_id: { type: 'integer', description: 'the client it is about, if any' },
      },
      required: ['title', 'kind', 'date'],
    },
  },
  {
    name: 'complete_reminder',
    description: 'Mark a reminder done (or cancel it) so it stops warning.',
    input_schema: { type: 'object', properties: { id: { type: 'integer', description: 'the reminder id' } }, required: ['id'] },
  },
  {
    name: 'remember',
    description: "Save something to your long-term memory when the owner asks you to remember it, or tells you a lasting preference or fact about a client or the business (\"remember that Sanjeev prefers WhatsApp\"). Short, one fact per call.",
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'the fact, in a short sentence' } }, required: ['text'] },
  },
  {
    name: 'recall',
    description: 'Everything in your memory and the owner\'s written facts, with ids — to look something up or find what to forget.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'forget',
    description: 'Remove something from your memory (the owner said it is wrong or no longer true). Pass its id from recall.',
    input_schema: { type: 'object', properties: { id: { type: 'integer', description: 'the memory id' } }, required: ['id'] },
  },
  {
    name: 'list_crew',
    description: "The vendor's crew members — name, role, phone, email.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'calendar',
    description: "Booked events (the calendar) between two dates — who, what, where, start time, and whether delivered. Default: the next 30 days.",
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } } },
  },
  {
    name: 'world_time',
    description: "The exact time now in any place, and how far ahead or behind the vendor's own time it is (daylight saving included). Pass an IANA time zone such as 'Asia/Kolkata', 'Europe/London', 'America/Toronto'.",
    input_schema: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA time zone, e.g. Asia/Kolkata' } }, required: ['timezone'] },
  },
  {
    name: 'list_packages',
    description: "The vendor's own packages (the ones they send to clients), with prices and hours.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ...PANEL_TOOLS,
];

/** Run one tool for one vendor. Returns plain data for Claude to read. */
export async function runTool(name, input, vendorId) {
  const v = Number(vendorId);
  if (PANEL_TOOL_NAMES.has(name)) return runPanelTool(name, input, v);      // galleries, calls, crew, money… (lib/agentPanelTools.js)
  const live = { vendor_id: v, archived_at: null };
  switch (name) {
    case 'today_summary': {
      const now = new Date();
      const in14 = new Date(now.getTime() + 14 * 86400e3);
      const [newLeads, upcoming, selections, notices] = await Promise.all([
        prisma.leads.findMany({ where: { ...live, seen_at: null }, orderBy: { created_at: 'desc' }, take: 15 }),
        prisma.leads.findMany({ where: { ...live, status: 'booked', event_date: { gte: new Date(now.toDateString()), lte: in14 } }, orderBy: { event_date: 'asc' }, take: 15 }),
        prisma.selection_notes.findMany({ where: { albums: { vendor_id: v }, updated_at: { gte: new Date(now.getTime() - 7 * 86400e3) } }, select: { updated_at: true, albums: { select: { title: true, _count: { select: { selections: true } } } } }, orderBy: { updated_at: 'desc' }, take: 10 }),
        prisma.notifications.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 10, select: { title: true, body: true, created_at: true, seen_at: true } }),
      ]);
      return {
        today: day(now),
        new_leads_not_opened: newLeads.map(leadLine),
        booked_events_next_14_days: upcoming.map(leadLine),
        photo_selections_sent_last_7_days: selections.map(s => ({ client: s.albums.title, photos_picked: s.albums._count.selections, sent: day(s.updated_at) })),
        latest_notifications: notices.map(n => ({ title: n.title, detail: n.body, when: n.created_at, read: !!n.seen_at })),
      };
    }
    case 'find_leads': {
      const where = { ...live };
      if (input.status) where.status = String(input.status);
      if (input.query) {
        const q = String(input.query).slice(0, 80);
        where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }];
      }
      if (input.event_from || input.event_to) {
        where.event_date = {};
        if (input.event_from) where.event_date.gte = new Date(input.event_from);
        if (input.event_to) where.event_date.lte = new Date(input.event_to);
      }
      if (input.received_from || input.received_to) {
        where.created_at = {};
        if (input.received_from) where.created_at.gte = new Date(input.received_from);
        if (input.received_to) where.created_at.lte = new Date(`${input.received_to}T23:59:59`);
      }
      if (input.event_type) where.event_type = { equals: String(input.event_type), mode: 'insensitive' };
      // the true total, however many are listed — counting must never stop at the page size
      const [total, rows] = await Promise.all([
        prisma.leads.count({ where }),
        prisma.leads.findMany({ where, orderBy: { created_at: 'desc' }, take: Math.min(30, Number(input.limit) || 15) }),
      ]);
      // nothing by spelling? the name may have been heard slightly wrong — find the closest ones
      if (!total && input.query && !/[@\d]/.test(String(input.query))) {
        const all = await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null }, select: { id: true, name: true, status: true, event_type: true, event_date: true, location: true, email: true, phone: true, created_at: true } });
        const near = all.map(l => ({ l, s: alike(input.query, l.name) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 5);
        if (near.length) return { total: 0, did_you_mean: near.map(x => leadLine(x.l)), note: 'No exact match — these names sound closest. Confirm with the owner which one.' };
      }
      return { total, listed: rows.length, leads: rows.map(leadLine) };
    }
    case 'get_lead': {
      const l = await prisma.leads.findFirst({ where: { id: Number(input.id), vendor_id: v } });   // 🔒 only this vendor's
      if (!l) return { error: 'No lead with that id' };
      const answers = [];
      for (const f of Array.isArray(l.form_snapshot) ? l.form_snapshot : []) {
        const a = l.custom_data?.[f.id];
        if (a !== undefined && a !== null && a !== '' && a !== false) answers.push({ question: f.label, answer: a === true ? 'Yes' : a });
      }
      const pays = await prisma.payments.findMany({ where: { lead_id: l.id, vendor_id: v }, orderBy: { paid_at: 'desc' }, select: { amount: true, method: true, note: true, paid_at: true } });
      const missing = [['guests', l.guests], ['email', l.email], ['phone', l.phone], ['venue', l.location], ['start time', l.timing_from], ['event date', l.event_date]].filter(([, val]) => val === null || val === undefined || val === '').map(([k]) => k);
      return {
        ...leadLine(l), role: l.role, instagram: l.instagram, heard_about_us: l.heard,
        not_recorded: missing.length ? `${missing.join(', ')} — say plainly these are not recorded and offer to add them` : 'nothing important missing',
        payments: { paid_total: pays.reduce((sum, p) => sum + Number(p.amount || 0), 0), list: pays.map(p => ({ amount: Number(p.amount), method: p.method, note: p.note, on: day(p.paid_at) })) },
        delivered: !!l.delivered, booked_package_price: l.package_snapshot?.price ?? null,
        times: [l.timing_from, l.timing_to].filter(Boolean).join(' to ') || null, hours: l.hours, guests: l.guests,
        client_notes: l.notes, private_notes: l.internal_notes, booking_notes: l.booking_notes,
        package: l.package_snapshot?.name || null, packages_sent: day(l.packages_sent_at),
        form_answers: answers,
      };
    }
    case 'upcoming_events': {
      const now = new Date();
      const until = new Date(now.getTime() + (Number(input.days) || 30) * 86400e3);
      const rows = await prisma.leads.findMany({ where: { ...live, status: 'booked', event_date: { gte: new Date(now.toDateString()), lte: until } }, orderBy: { event_date: 'asc' }, take: 40 });
      return { count: rows.length, events: rows.map(leadLine) };
    }
    case 'list_reminders': {
      const tz = await zoneOf(v);
      const until = new Date(Date.now() + (Number(input.days) || 60) * 86400e3);
      const rows = await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null, due_at: { lte: until } }, orderBy: { due_at: 'asc' }, take: 30 });
      const out = [];
      for (const r of rows) {
        const lead = r.lead_id ? await prisma.leads.findFirst({ where: { id: r.lead_id, vendor_id: v }, select: { name: true, delivered: true } }) : null;
        if (lead?.delivered) continue;
        const left = Math.round((new Date(r.due_at.toLocaleDateString('en-CA', { timeZone: tz })) - new Date(new Date().toLocaleDateString('en-CA', { timeZone: tz }))) / 86400e3);
        out.push({ id: r.id, title: r.title, kind: r.kind, due: nice(r.due_at, tz), days_left: left, client: lead?.name || null });
      }
      return { reminders: out };
    }
    case 'set_reminder': {
      const tz = await zoneOf(v);
      const kind = ['delivery', 'task', 'alarm'].includes(input.kind) ? input.kind : 'task';
      const title = String(input.title || '').trim().slice(0, 200);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) return { error: 'A reminder needs a title and a date (YYYY-MM-DD)' };
      const [hh, mm] = kind === 'alarm' ? String(input.time || '09:00').split(':').map(Number) : [17, 0];
      const due = atLocal(input.date, hh || 0, mm || 0, tz);
      if (kind === 'alarm' && due < new Date()) return { error: 'That time has already passed' };
      let leadId = null;
      if (input.lead_id) leadId = (await prisma.leads.findFirst({ where: { id: Number(input.lead_id), vendor_id: v }, select: { id: true } }))?.id ?? null;   // 🔒
      const r = await prisma.agent_reminders.create({ data: { vendor_id: v, lead_id: leadId, title, kind, due_at: due } });
      return { saved: true, id: r.id, when: nice(due, tz), warns: kind === 'alarm' ? 'once, at that time' : 'two weeks, a week, two days and a day before, and on the day' };
    }
    case 'complete_reminder': {
      const { count } = await prisma.agent_reminders.updateMany({ where: { id: Number(input.id), vendor_id: v, done_at: null }, data: { done_at: new Date() } });
      return count ? { done: true } : { error: 'No open reminder with that id' };
    }
    case 'remember': {
      const text = String(input.text || '').trim().slice(0, 600);
      if (!text) return { error: 'Nothing to remember' };
      const m = await prisma.agent_memory.create({ data: { vendor_id: v, kind: 'memory', text } });
      return { remembered: true, id: m.id };
    }
    case 'recall': {
      const rows = await prisma.agent_memory.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 200 });
      return { facts: rows.filter(r => r.kind === 'fact').map(r => ({ id: r.id, text: r.text })), memories: rows.filter(r => r.kind === 'memory').map(r => ({ id: r.id, text: r.text })) };
    }
    case 'forget': {
      // only memories — the owner's written facts are changed on the AI Agent page
      const { count } = await prisma.agent_memory.deleteMany({ where: { id: Number(input.id), vendor_id: v, kind: 'memory' } });
      return count ? { forgotten: true } : { error: 'No memory with that id (facts the owner wrote are changed on the AI Agent page)' };
    }
    case 'list_crew': {
      const rows = await prisma.crew_members.findMany({ where: { vendor_id: v }, select: { id: true, name: true, role: true, phone: true, email: true }, orderBy: { name: 'asc' } });
      return { crew: rows };
    }
    case 'calendar': {
      const from = input.from ? new Date(input.from) : new Date(new Date().toDateString());
      const to = input.to ? new Date(input.to) : new Date(from.getTime() + 30 * 86400e3);
      const rows = await prisma.leads.findMany({ where: { ...live, status: 'booked', event_date: { gte: from, lte: to } }, orderBy: { event_date: 'asc' }, take: 60 });
      return { events: rows.map(l => ({ ...leadLine(l), starts: l.timing_from, ends: l.timing_to, guests: l.guests, delivered: !!l.delivered })) };
    }
    case 'world_time': {
      const tz = String(input.timezone || '');
      const mine = await zoneOf(v);
      try {
        const now = new Date();
        const there = now.toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        const off = (zone) => { const p = new Date(now.toLocaleString('en-US', { timeZone: zone })); return p.getTime(); };
        const diff = Math.round((off(tz) - off(mine)) / 60000);
        return { place: tz, time_there: there, your_time: now.toLocaleString('en-GB', { timeZone: mine, weekday: 'short', hour: 'numeric', minute: '2-digit' }), difference: `${diff >= 0 ? 'ahead' : 'behind'} by ${Math.floor(Math.abs(diff) / 60)} h${Math.abs(diff) % 60 ? ` ${Math.abs(diff) % 60} min` : ''}` };
      } catch { return { error: 'Unknown time zone — use an IANA name like Asia/Kolkata' }; }
    }
    case 'list_packages': {
      const rows = await prisma.vendor_packages.findMany({ where: { vendor_id: v }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }], take: 60 });
      return { packages: rows.map(p => ({ id: p.id, name: p.name, price: p.base_price ? Number(p.base_price) : null, hours: p.included_hours, extra_hour: p.per_hour_price ? Number(p.per_hour_price) : null })) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
