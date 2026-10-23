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
import { markSeen as markCommsSeen } from './commsSeen.js';
import { stagesSummary } from './projectStages.js';
import privateDb from '../config/privateDb.js';
import { getSetting } from './settings.js';
import { zoneOf, atLocal, nice } from './agentReminders.js';
import { PANEL_TOOLS, PANEL_TOOL_NAMES, runPanelTool } from './agentPanelTools.js';
import { lookupContacts } from './agentContacts.js';
import { emailWarning } from './emailCheck.js';
import { searchKb, leadPrices, SECTIONS } from './agentKb.js';
import { runOnPc, wakePc, PC_ACTIONS, pcAllowed, deliveriesFor } from './pcAgent.js';

/** 🐧 shell commands that delete, erase, overwrite or format — these wait for Raj's yes (everything else runs at once) */
const DESTRUCTIVE = /(^|[\s;&|(])(sudo\s+)?(rm|rmdir|shred|wipefs|mkfs(\.\w+)?|dd|fdisk|parted|sgdisk|truncate|unlink|find\b[^;|&]*-delete|git\s+(clean|reset\s+--hard)|apt(-get)?\s+(remove|purge|autoremove)|snap\s+remove|systemctl\s+(disable|mask))\b|>\s*[/~\w]|\bmv\b[^;|&]*\s\/dev\/null/;

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
  // 📧 Raj's lesson: flag a suspicious or throwaway email, and say why
  ...(emailWarning(l.email) ? { email_warning: emailWarning(l.email) } : {}),
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
    description: "Search the vendor's leads (inquiries and bookings). Filter by part of a name, email or phone; by status ('new', 'booked', or other statuses the panel uses); by event date range; and by the date the lead was RECEIVED (e.g. 'leads this month'). 'Bookings this month' = status booked with the EVENT this month (event_from / event_to), not received. 'total' is the true count of every match; 'leads' lists up to 'limit' of them, newest first.",
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
    name: 'pc_task',
    description: "Work on the owner's editing PC: wake (switch it on or out of sleep — Wake-on-LAN); setup_wake (once: lets the network card wake it from sleep); apps (what is open on it right now — names only); power (power: shutdown | restart | sleep | lock — done straight away, shutdown/restart wait 60 s; cancel stops a pending shutdown); open_app / close_app (query: the app's name — it closes normally so it can ask to save); upload_to_gallery (put a video from the PC or NAS into a client gallery's Videos folder: path + album_id — find the gallery first; the client sees it with their usual login); status (only whether it is on); details (drives, free space, what is open — only when asked); find_folder (folders by a few words, e.g. \"inaya event 26\" — use it before list_folder: never guess a path); find_files (search the NAS and drives by words in the name, e.g. the longest video of a client — kind video/photo, sort size/date); list_folder; make_folder; copy (src → dest); move (only after he said yes); upload_drive (copy to his Google Drive, dest = folder inside My Drive); make_proxies (H.264 proxies of every video in a folder, into its Proxy subfolder — Resolve links them automatically); shell (Ubuntu only: run any terminal command as Raj, full access — command, optional cwd; anything that deletes, erases, overwrites or formats needs his clear yes first: read him the command, then call again with approved:true). Long jobs keep running and report when done.",
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ["wake","setup_wake","apps","power","open_app","close_app","upload_to_gallery","status","details","find_files","find_folder","list_folder","make_folder","copy","move","upload_drive","make_proxies","shell"] },
      command: { type: 'string', description: 'shell: the terminal command (Ubuntu)' },
      cwd: { type: 'string', description: 'shell: folder to run it in' },
      approved: { type: 'boolean', description: 'shell: true only after the owner said yes to a delete/erase/format command' },
      query: { type: 'string', description: 'find_files: words in the file name' },
      kind: { type: 'string', enum: ['video', 'photo', 'any'] },
      sort: { type: 'string', enum: ['size', 'date', 'name'] },
      path: { type: 'string', description: 'a file or folder path, e.g. V:\\1-Weddings 2026-27\\Naya' },
      album_id: { type: 'integer', description: 'upload_to_gallery: the client gallery' },
      details: { type: 'boolean', description: 'sizes, dates, contents — only when the owner asks for them' },
      power: { type: 'string', enum: ['shutdown', 'restart', 'sleep', 'lock', 'cancel'] },
      dest: { type: 'string', description: 'copy / move / upload_drive destination' },
      limit: { type: 'integer' },
    }, required: ['action'] },
  },
  {
    name: 'delivery_log',
    description: "What was delivered to ONE client (videos uploaded to their gallery, re-deliveries, fees) — by their name, email or phone. Use it for \"did we deliver …\", \"when did … get their video\". Never reads the whole log.",
    input_schema: { type: 'object', properties: { client: { type: 'string', description: 'name, email or phone' } }, required: ['client'] },
  },
  {
    name: 'web_search',
    description: 'Search the web for anything outside the panel — gear, prices, places, distances and travel times, news, how-to. Returns a short answer to read aloud.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'what to look up' } }, required: ['query'] },
  },
  {
    name: 'project_stages',
    description: "A booking's production stages: data backed up (when, by whom), sent to the editor, editing done (photos and videos separately), plus the last message sent outside iwopo and the last email. By client name or lead_id.",
    input_schema: { type: 'object', properties: { client: { type: 'string' }, lead_id: { type: 'integer' } } },
  },
  {
    name: 'mark_seen',
    description: "Mark things seen in the panel, as he would by opening them: what = messages (texts and calls), notifications (the bell), leads, or all. What you read out on a wake-up or as an [Update] is already marked seen.",
    input_schema: { type: 'object', properties: { what: { type: 'string', enum: ['messages', 'notifications', 'leads', 'all'] } }, required: ['what'] },
  },
  {
    name: 'client_directory',
    description: "Any question about a client, in ONE call. Without fields: the basics — name, phone, email, what the shoot is, date, time, venue, booked or not. With fields: ONLY those facts (guests, contract, crew, notes, form_answers, delivered, source, inquired, packages_sent). Never money — that is client_payment. Search by name, phone or email.",
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'a name, phone number or email' },
      fields: { type: 'array', items: { type: 'string', enum: ['venue', 'date', 'time', 'phone', 'email', 'event', 'status', 'guests', 'contract', 'crew', 'notes', 'form_answers', 'delivered', 'source', 'inquired', 'packages_sent'] }, description: 'only these facts — leave out for the basics' },
    }, required: ['query'] },
  },
  {
    name: 'client_payment',
    description: "A client's money — price, paid, balance, last payment. ONLY when the owner asks about money or payment for that client; money is never mentioned otherwise (he may be with other people).",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'a name, phone number or email' } }, required: ['query'] },
  },
  {
    name: 'search_knowledge',
    description: "Search the knowledge base: EVERY page of the panel written as plain sentences, one per record — leads (with price, notes, form answers), bookings (paid, balance, contract, crew), contracts & invoices, calls & messages, galleries, photo selections, crew, packages, File Flyer, Raw Selector, occasions, reminders, website analytics. Give a few key words; optionally a section. The quickest first look for almost any business question.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'key words, a name, a number' }, section: { type: 'string', description: 'optional: ' + SECTIONS.map(s => s[0]).join(' | ') } }, required: ['query'] },
  },
  {
    name: 'leads_by_price',
    description: "Every lead with its price — from the package they chose, a custom price, the assigned package, or the quoted options — highest first, with what was paid. Use it for the highest / lowest priced lead or booking: it checks ALL leads, not only those with payments.",
    input_schema: { type: 'object', properties: { status: { type: 'string', description: 'optional: booked, new, quoted…' }, limit: { type: 'integer', description: 'how many, default 10' } } },
  },
  {
    name: 'lookup_contact',
    description: "The quick scan of the WHOLE history for a person: give a phone number (any part, any format), an email or a name, and get one line per match — every inquiry they sent (event, date, booked or not, done, delivered, paid), their calls and texts (first contact, last message), their galleries. Use it FIRST whenever a person, number or email comes up (\"who texted me from 604…\", \"has Sanjeev been with us before?\"). Then get_lead or calls_and_messages for details.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'phone number, email or name' } }, required: ['query'] },
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
    description: "Close a reminder so it stops warning — call it whenever the owner says the thing is done, delivered, sent, sorted or cancelled. Give its id (from list_reminders) or words from its title (e.g. \"Anmol\"). A memory note does NOT stop a reminder; only this does.",
    input_schema: { type: 'object', properties: { id: { type: 'integer', description: 'the reminder id' }, match: { type: 'string', description: 'words from the reminder title, if no id' } } },
  },
  {
    name: 'remember',
    description: "Save something to your long-term memory when the owner asks you to remember it, or tells you a lasting preference or fact about a client or the business (\"remember that Sanjeev prefers WhatsApp\"). Short, one fact per call.",
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'the fact, in a short sentence' } }, required: ['text'] },
  },
  {
    name: 'save_lesson',
    description: "Save a LESSON from the owner — whenever he corrects you, complains about how you answered, or says \"make a note\" / \"remember to\" / \"don't do that again\". Write it as a short rule you will follow from now on (\"Before texting a client, check whether they already replied\"). Lessons are kept separately and you follow them in every conversation.",
    input_schema: { type: 'object', properties: { rule: { type: 'string', description: 'the rule, one sentence' } }, required: ['rule'] },
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
        // a shoot TODAY or TOMORROW counts whatever its status — not yet booked is said plainly, not left out
        events_today_and_tomorrow_any_status: (await prisma.leads.findMany({ where: { ...live, event_date: { gte: new Date(now.toDateString()), lte: new Date(new Date(now.toDateString()).getTime() + 2 * 86400e3 - 1) } }, orderBy: { event_date: 'asc' }, take: 15 })).map(l => ({ ...leadLine(l), starts: l.timing_from, ends: l.timing_to, booked: l.status === 'booked' })),
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
        if (input.event_to) where.event_date.lte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(input.event_to)) ? `${input.event_to}T23:59:59` : input.event_to);   // the whole last day
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
      const missing = [['guests', l.guests], ['email', l.email], ['phone', l.phone], ['venue', l.location], ['start time', l.timing_from], ['event date', l.event_date]].filter(([, val]) => val === null || val === undefined || val === '').map(([k]) => k);
      return {
        ...leadLine(l), role: l.role, instagram: l.instagram, heard_about_us: l.heard,
        // a detail may be written in the notes or form answers instead of its own field ("starts at 6 AM") — read those first
        not_in_their_own_fields: missing.length ? `${missing.join(', ')} — but READ client_notes, private_notes and form_answers first: a time or guest count is often written there. Only if it is nowhere, say it is not recorded and offer to add it to its field.` : 'nothing important missing',
        delivered: !!l.delivered,
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
    case 'pc_task': {
      const action = PC_ACTIONS.includes(input.action) ? input.action : null;
      if (!action) return { error: 'Unknown PC action' };
      if (!(await pcAllowed(v))) return { error: 'Not available.' };
      if (action === 'wake') return wakePc(v);                     // ⏰ the router, like the WolOn app
      // 🐧 Ubuntu full access (Raj, 2026-10-16) — the only yes: deleting / erasing / overwriting / formatting
      if (action === 'shell') {
        const cmd = String(input.command || '').trim();
        if (!cmd) return { error: 'Which command?' };
        if (DESTRUCTIVE.test(cmd) && input.approved !== true) return { needs_yes: true, command: cmd, next: 'This deletes, erases or overwrites. Read him the command in plain words and ask "Go ahead?". Call again with approved:true only after his clear yes.' };
      }
      const { action: _a, ...params } = input;
      return runOnPc(v, action, params);
    }
    case 'delivery_log': {
      if (!(await pcAllowed(v))) return { error: 'Not available.' };
      return deliveriesFor(v, input.client);
    }
    case 'web_search': {
      // 🔎 the typed AI Agent's Claude key with Anthropic's web search — short, for speaking aloud
      const key = await getSetting('agent_api_key', '');
      if (!key) return { error: 'Web search needs the AI Agent key (Super Admin → Settings → AI Agent).' };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: (await getSetting('agent_model', '')) || 'claude-haiku-5-5', max_tokens: 400,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
          messages: [{ role: 'user', content: `Today is ${new Date().toDateString()}. Search the web and answer in 1–3 short sentences that can be read aloud (no links, no lists). The owner is in Vancouver, BC, Canada. Question: ${String(input.query || '').slice(0, 300)}` }],
        }),
      });
      const d = await r.json().catch(() => ({}));
      const text = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
      return text ? { answer: text.slice(0, 1200) } : { error: d.error?.message || 'No answer from the web search' };
    }
    case 'project_stages': return stagesSummary(v, input);
    case 'mark_seen': {
      const what = String(input.what || 'all'), now = new Date(), done = [];
      if (what === 'messages' || what === 'all') await markCommsSeen(v, 'all').catch(() => {});   // 👁️ the calls & texts list too
      if (what === 'messages' || what === 'all') { const r = await privateDb.comms_notices.updateMany({ where: { vendor_id: v, seen_at: null }, data: { seen_at: now } }).catch(() => ({ count: 0 })); done.push(`${r.count} message${r.count === 1 ? '' : 's'}`); }
      if (what === 'notifications' || what === 'all') { const r = await prisma.notifications.updateMany({ where: { vendor_id: v, seen_at: null }, data: { seen_at: now } }); done.push(`${r.count} notification${r.count === 1 ? '' : 's'}`); }
      if (what === 'leads' || what === 'all') { const r = await prisma.leads.updateMany({ where: { vendor_id: v, seen_at: null }, data: { seen_at: now } }); done.push(`${r.count} lead${r.count === 1 ? '' : 's'}`); }
      return { summary: `Marked seen: ${done.join(', ')}` };
    }
    case 'client_directory': {
      // 📇 level 1 (Raj, 2026-10-13): who, how to reach them, what, when, where — nothing more
      const q = String(input.query || '').trim();
      if (!q) return { error: 'Who?' };
      const digits = q.replace(/\D/g, '');
      const leads = await prisma.leads.findMany({
        where: { vendor_id: v, archived_at: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 7 ? [{ phone: { contains: digits.slice(-7) } }] : [])] },
        orderBy: [{ event_date: 'desc' }], take: 6,
        select: { id: true, name: true, phone: true, email: true, event_type: true, event_date: true, timing_from: true, timing_to: true, location: true, status: true },
      });
      const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'date not set');
      if (Array.isArray(input.fields) && input.fields.length) {
        if (!leads.length) return { error: 'No such client' };
        return clientFacts(v, leads[0].id, input.fields);           // 🔎 only the facts asked for
      }
      return { clients: leads.map(l => `#${l.id} ${l.name} · ${l.phone || 'no phone'} · ${l.email || 'no email'} · ${l.event_type || 'event'} · ${day(l.event_date)}${l.timing_from ? ` ${l.timing_from}${l.timing_to ? `–${l.timing_to}` : ''}` : ''} · ${l.location || 'venue not set'} · ${l.status === 'booked' ? 'BOOKED' : 'not booked'}`) };
    }
    case 'client_payment': {
      // 💵 the ONLY way a client's money reaches the voice — asked for, never volunteered (Raj, 2026-10-13)
      const q = String(input.query || '').trim(), digits = q.replace(/\D/g, '');
      if (!q) return { error: 'Which client?' };
      const lead = await prisma.leads.findFirst({ where: { vendor_id: v, archived_at: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 7 ? [{ phone: { contains: digits.slice(-7) } }] : [])] }, orderBy: { event_date: 'desc' }, select: { id: true, name: true } });
      if (!lead) return { error: 'No such client' };
      const p = (await leadPrices(v, { id: lead.id }))[0] || {};
      const last = await prisma.payments.findFirst({ where: { vendor_id: v, lead_id: lead.id }, orderBy: { paid_at: 'desc' }, select: { amount: true, method: true, paid_at: true } });
      return { client: lead.name, price: p.price_note || 'no price set', paid: p.paid ?? 0, balance: p.price != null ? Math.max(0, p.price - (p.paid || 0)) : 'no price set', last_payment: last ? `$${Number(last.amount)} by ${last.method || 'unknown'} on ${new Date(last.paid_at).toDateString()}` : 'none' };
    }
    case 'search_knowledge': {
      const sec = SECTIONS.some(s => s[0] === input.section) ? input.section : null;
      const rows = await searchKb(v, input.query, sec, 10);
      return rows.length ? { found: rows.map(r => r.text) } : { found: [], note: 'Nothing in the knowledge base matches — try other words or a specific tool.' };
    }
    case 'leads_by_price': {
      const where = { archived_at: null, ...(input.status ? { status: String(input.status) } : {}) };
      const list = (await leadPrices(v, where)).filter(x => x.price !== null).sort((a, b) => b.price - a.price);
      return { leads_with_a_price: list.length, top: list.slice(0, Math.min(Number(input.limit) || 10, 25)) };
    }
    case 'lookup_contact': {
      const lines = await lookupContacts(v, input.query, 5);
      return lines.length ? { matches: lines } : { matches: [], note: 'Nobody in the history matches — a new contact.' };
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
      let where = null;
      if (input.id) where = { id: Number(input.id), vendor_id: v, done_at: null };
      else if (String(input.match || '').trim()) {
        const words = String(input.match).trim().split(/\s+/).filter(w => w.length > 2).slice(0, 4);
        const found = await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null, AND: words.map(w => ({ title: { contains: w, mode: 'insensitive' } })) }, select: { id: true, title: true } });
        if (found.length > 1) return { error: 'More than one reminder matches — which one?', matches: found };
        if (found.length) where = { id: found[0].id, vendor_id: v, done_at: null };
      }
      if (!where) return { error: 'No open reminder matches that' };
      const r = await prisma.agent_reminders.findFirst({ where, select: { title: true } });
      const { count } = await prisma.agent_reminders.updateMany({ where, data: { done_at: new Date() } });
      return count ? { done: true, closed: r?.title } : { error: 'No open reminder matches that' };
    }
    case 'remember': {
      const text = String(input.text || '').trim().slice(0, 600);
      if (!text) return { error: 'Nothing to remember' };
      const m = await prisma.agent_memory.create({ data: { vendor_id: v, kind: 'memory', text } });
      return { remembered: true, id: m.id };
    }
    case 'save_lesson': {
      const text = String(input.rule || input.text || '').trim().slice(0, 400);
      if (!text) return { error: 'The note is empty' };
      const m = await prisma.agent_memory.create({ data: { vendor_id: v, kind: 'lesson', text } });
      // 📝 sorted in the background: behaviour → folded into the rules; a bug or missing feature → a note for the developer
      // loaded only here — a top-level import would make a cycle (agentTraining → agentRules → tornado → agentTools)
      import('./agentTraining.js').then(({ foldLesson }) => foldLesson(v, m.id)).catch(e => console.error('[agent] fold lesson', e.message));
      return { saved: true, note: 'Noted. Tell the owner "noted" — nothing more.' };
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

/** 🔎 Only the facts asked for about one client (client_directory with fields). */
async function clientFacts(v, leadId, fields) {
  const lead = await prisma.leads.findFirst({ where: { id: Number(leadId), vendor_id: v } });   // 🔒 this vendor's
  if (!lead) return { error: 'No such client' };
  const input = { fields };
  const want = new Set(Array.isArray(input.fields) ? input.fields : []);
  const out = { client: lead.name };
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'not set');
  if (want.has('venue')) out.venue = lead.location || 'not set';
  if (want.has('date')) out.date = day(lead.event_date);
  if (want.has('time')) out.time = lead.timing_from ? `${lead.timing_from}${lead.timing_to ? `–${lead.timing_to}` : ''}` : 'not set';
  if (want.has('phone')) out.phone = lead.phone || 'not set';
  if (want.has('email')) out.email = lead.email || 'not set';
  if (want.has('event')) out.event = lead.event_type || 'not set';
  if (want.has('status')) out.status = lead.status === 'booked' ? 'BOOKED' : (lead.status || 'inquiry');
  // anything asked that isn't a known fact gets the basics, never an empty answer
  const known = new Set(['venue', 'date', 'time', 'phone', 'email', 'event', 'status', 'guests', 'contract', 'crew', 'notes', 'form_answers', 'delivered', 'source', 'inquired', 'packages_sent']);
  if ([...want].some(x => !known.has(x))) Object.assign(out, { venue: lead.location || 'not set', date: day(lead.event_date), time: lead.timing_from || 'not set', event: lead.event_type || 'event' });
  if (want.has('guests')) out.guests = lead.guests ?? 'not recorded';
  if (want.has('contract')) {
    const c = await prisma.contracts.findFirst({ where: { vendor_id: v, lead_id: lead.id, voided_at: null }, orderBy: { id: 'desc' }, select: { signed_at: true, released_at: true } });
    out.contract = !c ? 'none' : c.signed_at ? `signed ${new Date(c.signed_at).toDateString()}` : c.released_at ? 'sent, not signed' : 'draft, not sent';
  }
  if (want.has('crew')) out.crew = (await prisma.lead_crew.findMany({ where: { lead_id: lead.id }, include: { crew_members: { select: { name: true } } } })).map(x => `${x.crew_members?.name}${x.duty ? ` (${x.duty})` : ''}`).join(', ') || 'none assigned';
  if (want.has('notes')) out.notes = [lead.notes && `client: ${lead.notes}`, lead.internal_notes && `private: ${lead.internal_notes}`, lead.booking_notes && `booking: ${lead.booking_notes}`].filter(Boolean).join(' / ') || 'no notes';
  if (want.has('form_answers')) out.form_answers = lead.custom_data || 'none';
  if (want.has('delivered')) out.delivered = lead.delivered ? 'yes' : 'no';
  if (want.has('source')) out.source = lead.heard || 'not recorded';
  if (want.has('inquired')) out.inquired = lead.created_at;
  if (want.has('packages_sent')) out.packages_sent = lead.packages_sent_at || 'not sent';
  return out;
}
