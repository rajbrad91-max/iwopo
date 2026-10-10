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

/** A date as people say it, weekday included — "Mon 15 Mar 2027". Worked out
 *  here, in UTC (dates are stored as calendar days), so the model never has
 *  to compute a weekday itself; it got one wrong when it did. */
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '') : null);
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
    name: 'list_packages',
    description: "The vendor's own packages (the ones they send to clients), with prices and hours.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/** Run one tool for one vendor. Returns plain data for Claude to read. */
export async function runTool(name, input, vendorId) {
  const v = Number(vendorId);
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
      return {
        ...leadLine(l), role: l.role, instagram: l.instagram, heard_about_us: l.heard,
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
    case 'list_packages': {
      const rows = await prisma.vendor_packages.findMany({ where: { vendor_id: v }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }], take: 60 });
      return { packages: rows.map(p => ({ id: p.id, name: p.name, price: p.base_price ? Number(p.base_price) : null, hours: p.included_hours, extra_hour: p.per_hour_price ? Number(p.per_hour_price) : null })) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
