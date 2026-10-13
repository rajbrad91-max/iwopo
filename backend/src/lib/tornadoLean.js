/**
 * ✂️ Short tool descriptions for the voice model (Gemini Live).
 *
 * Every reply re-sends all tool descriptions (~4,000 tokens with the long
 * ones), and the voice model is billed for them each time (Raj, 2026-10-12:
 * about CA$6 a day). The rules behind each tool already live in Tornado's
 * instructions, so the voice model gets these one-liners; the typed AI Agent
 * keeps the full descriptions. A tool missing here falls back to its own.
 */
export const SHORT = {
  today_summary: "What's new and coming up: unseen leads, events today/tomorrow (booked or not), next 14 days, selections, unpaid.",
  find_leads: 'Search leads by name/email/phone, status, event date range. Returns true totals.',
  get_lead: 'Everything about one lead: contact, event, form answers, notes, payments, what is missing.',
  upcoming_events: 'Booked events in the next N days.',
  pc_task: 'Work on the owner\'s PC (answer only what he asks — sizes, contents, drives only with details): wake it up, what is open (apps), power (shutdown / restart / sleep only after his yes; lock; cancel), open or close an app (close after his yes), upload a video to a client gallery (path + album_id), status, find folders (never guess a path) and files on the NAS / drives, list / make folders, copy, move (after his yes), upload to Google Drive, make Resolve proxies for a folder. Long jobs report when done.',
  delivery_log: 'What was delivered to one client (by name, email or phone).',
  web_search: 'Search the web for anything outside the panel: gear, prices, places, distances, travel times, news, how-to.',
  client_directory: 'Any question about a client in ONE call: the basics (name, phone, email, shoot, date, time, venue, booked) — or, with fields, ONLY those facts (venue, date, time, guests, contract, crew, notes…). Never money.',
  client_payment: 'A client\'s money (price, paid, balance, last payment) — ONLY when the owner asks about money.',
  search_knowledge: 'Search the panel data written as sentences by a few words. Set section when the question is about one page (leads, bookings, money, calls, galleries, selections, crew, packages, fileflyer, raws, occasions, reminders, analytics).',
  leads_by_price: 'Every lead with its price (chosen package, override, assigned or quoted) — highest first.',
  lookup_contact: 'A person\'s whole history in one line (inquiries, booked/done/delivered, calls, texts, galleries).',
  list_reminders: 'Open reminders, soonest first.',
  set_reminder: "Save a reminder now (no yes needed). kind: delivery | task | alarm (exact time). Link lead_id if it's about a client.",
  complete_reminder: 'Close a reminder (done/delivered/cancelled) by id or title words. The ONLY way to stop a reminder.',
  remember: 'Save something to long-term memory.',
  save_lesson: 'Save a rule the owner taught you (a correction, "make a note").',
  recall: 'Your memory and the owner facts, with ids.',
  forget: 'Remove a memory by id.',
  list_crew: 'Crew members: name, role, phone, email.',
  calendar: 'Booked events between two dates.',
  world_time: 'Time now in any place and the difference from here.',
  list_packages: "The vendor's packages and prices.",
  calls_and_messages: 'Calls (with what was said) and texts on the business line; filter by name/number, calls or texts, days back.',
  galleries: 'Client galleries: photos, tabs, selections, favourites, expiry, RAWs.',
  gallery_detail: 'One gallery in full.',
  photo_selections: 'Which clients picked photos — sent or still picking.',
  file_flyer: 'File Flyer shares, who opened them, latest files.',
  raw_selector: 'Raw Selector status per gallery, and the editors.',
  analytics: 'Website visits, sources, countries, inquiries.',
  money: 'Invoices, paid, balances, money owed (optionally one lead).',
  crew_schedule: 'Who on the crew works which event, times, check-ins.',
  preview_contract: "Check the contract a lead would get (read only — never saves or sends).",
  propose_email: 'Propose an email to a lead (owner confirms).',
  propose_create_lead: 'Propose a new lead; status "booked" when the owner says book (owner confirms).',
  propose_update_lead: 'Propose changing a lead: status, date, venue, times, guests, delivered (owner confirms).',
  propose_add_note: 'Propose a private note on a lead (owner confirms).',
  propose_mark_selection: 'Propose marking a gallery\'s photo selection done / not done (owner confirms).',
  propose_create_gallery: 'Create a client gallery (title or lead_id, folders, passwords made if not given) — done at once.',
  propose_add_gallery_folder: 'Add a photo folder to a gallery — done at once.',
  propose_delete_gallery: 'Delete a whole gallery — permanent, always asks first.',
  propose_archive_lead: 'Propose archiving a lead (owner confirms).',
  propose_send_text: 'Propose a text from the business number — reply or new conversation; shows the thread first (owner confirms).',
  propose_record_payment: 'Propose recording a payment received outside the system (owner confirms).',
  propose_send_packages: "Propose sending packages to a lead (only if its contract is released; owner confirms).",
  confirm_action: 'Do a proposed action after the owner said yes. Pass proposal_id.',
  cancel_action: 'Drop a proposed action (owner said no). Pass proposal_id.',
};

/** Parameter descriptions, cut to their first clause — the names say most of it. */
export function shortParams(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = Array.isArray(schema) ? [] : {};
  for (const [k, v] of Object.entries(schema)) {
    // a parameter's note is kept only when it carries meaning (a format, true/false, only/never, an example);
    // notes that just repeat the parameter's name are dropped — every word is re-read on every reply
    if (k === 'description' && typeof v === 'string') {
      if (/YYYY|HH:MM|\d|true|false|\bonly\b|\bnever\b|e\.g\.|leave out|instead/i.test(v)) out[k] = v.split(/ — |; |\. | \(/)[0].slice(0, 60);
      continue;
    }
    if (k === 'additionalProperties') continue;
    else out[k] = typeof v === 'object' ? shortParams(v) : v;
  }
  return out;
}

/** A tool answer without empty fields, and not huge — it stays in the conversation and is re-read every reply. */
export function compactResult(value, limit = 3500) {
  const prune = (v) => {
    if (Array.isArray(v)) return v.map(prune).filter(x => x !== undefined);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) {
        const p = prune(x);
        if (p === undefined || p === null || p === '' || (Array.isArray(p) && !p.length) || (typeof p === 'object' && !Array.isArray(p) && !Object.keys(p).length)) continue;
        o[k] = p;
      }
      return o;
    }
    return v;
  };
  let out = prune(value);
  // still big: keep the first items of each long list and say how many were left out
  for (let keep = 12; JSON.stringify(out).length > limit && keep >= 3; keep = Math.floor(keep / 2)) {
    const cut = (v) => {
      if (Array.isArray(v)) return v.length > keep ? [...v.slice(0, keep).map(cut), `…and ${v.length - keep} more — ask to narrow it down`] : v.map(cut);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cut(x)]));
      return v;
    };
    out = cut(prune(value));
  }
  return out;
}

/* 🗂️ One "panel" tool for the voice model instead of fourteen look-at-a-page tools — the
   same pages, the same answers (the server unpacks it: unpanel), about 1,800 characters
   fewer re-read on every reply (2026-10-12). The typed AI Agent keeps the separate tools. */
export const PANEL_PAGES = ['upcoming_events', 'list_reminders', 'list_crew', 'calendar', 'world_time', 'list_packages', 'galleries', 'gallery_detail', 'photo_selections', 'file_flyer', 'raw_selector', 'analytics', 'money', 'crew_schedule'];
export const PANEL_TOOL = {
  name: 'panel',
  description: 'Look at a page of the panel. page: upcoming_events (days ahead), list_reminders, list_crew, calendar (from–to), world_time (timezone), list_packages, galleries (query), gallery_detail (id = gallery), photo_selections, file_flyer, raw_selector, analytics (days back), money (id = lead, optional), crew_schedule (from–to).',
  input_schema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: PANEL_PAGES },
      query: { type: 'string', description: 'a name or words to look for' },
      id: { type: 'integer', description: 'gallery id or lead id' },
      days: { type: 'integer', description: 'how many days back or ahead' },
      from: { type: 'string', description: 'YYYY-MM-DD' },
      to: { type: 'string', description: 'YYYY-MM-DD' },
      timezone: { type: 'string', description: 'e.g. Asia/Kolkata' },
    },
    required: ['page'],
  },
};
/** "panel" → the page's own tool and its parameters. */
export function unpanel(input = {}) {
  const { page, id, ...rest } = input;
  if (!PANEL_PAGES.includes(page)) return { name: null, input: {} };
  const args = { ...rest };
  if (id !== undefined && id !== null) args[page === 'gallery_detail' ? 'album_id' : 'lead_id'] = id;
  return { name: page, input: args };
}

/* 🧰 Six merged tools instead of eighteen for the voice model (Raj, 2026-10-13): every tool's
   description is re-read on every reply, so related ones share one description. The server
   unpacks a merged call into the very same tool as before (unmerge) — no ability is lost.
   The typed AI Agent keeps the separate tools. */
const s = (type, description, extra = {}) => ({ type, description, ...extra });
export const MERGED = {
  memory: {
    description: 'Memory: remember a lasting fact, recall what you know (with ids), forget one by id, or note the owner\'s correction ("make a note").',
    params: { do: s('string', '', { enum: ['remember', 'recall', 'forget', 'note'] }), text: s('string', 'the fact or the note'), id: s('integer', 'forget: its id') },
    map: { remember: ['remember', i => ({ text: i.text })], recall: ['recall', () => ({})], forget: ['forget', i => ({ id: i.id })], note: ['save_lesson', i => ({ rule: i.text })] },
  },
  reminder: {
    description: 'Reminders: set one now (no yes needed; kind delivery | task | alarm; lead_id for a client), or mark one done/cancelled (by id or words from its title) — the only way to stop it.',
    params: { do: s('string', '', { enum: ['set', 'done'] }), title: s('string', ''), kind: s('string', '', { enum: ['delivery', 'task', 'alarm'] }), date: s('string', 'YYYY-MM-DD'), time: s('string', 'HH:MM'), lead_id: s('integer', ''), id: s('integer', ''), match: s('string', 'words from its title') },
    map: { set: ['set_reminder', i => ({ title: i.title, kind: i.kind, date: i.date, time: i.time, lead_id: i.lead_id })], done: ['complete_reminder', i => ({ id: i.id, match: i.match })] },
  },
  message: {
    description: 'Propose a text (from the business number — a lead or any number; shows the thread first) or an email to a lead. The owner confirms.',
    params: { channel: s('string', '', { enum: ['text', 'email'] }), client: s('string', 'a client name — no need to look them up first'), lead_id: s('integer', ''), number: s('string', 'text: any number'), name: s('string', ''), subject: s('string', 'email only'), text: s('string', 'the message') },
    map: { text: ['propose_send_text', i => ({ lead_id: i.lead_id, number: i.number, name: i.name, text: i.text })], email: ['propose_email', i => ({ lead_id: i.lead_id, subject: i.subject, body: i.text })] },
    byClient: true,
    key: 'channel',
  },
  decide: {
    description: 'The owner\'s answer to a proposed action: yes → do it, no → drop it. Pass proposal_id.',
    params: { proposal_id: s('string', ''), yes: s('boolean', '') },
    map: { true: ['confirm_action', i => ({ proposal_id: i.proposal_id })], false: ['cancel_action', i => ({ proposal_id: i.proposal_id })] },
    key: 'yes',
  },
  gallery: {
    description: 'Galleries like the owner does in the panel: create (title or lead_id, folders, passwords made if not given), add_folder, mark_selection (done true/false), delete (permanent — always asks).',
    params: { do: s('string', '', { enum: ['create', 'add_folder', 'mark_selection', 'delete'] }), album_id: s('integer', ''), title: s('string', ''), lead_id: s('integer', ''), client_email: s('string', ''), category: s('string', ''), folders: s('array', 'photo folder names', { items: { type: 'string' } }), name: s('string', 'add_folder: the folder'), done: s('boolean', ''), guest_password: s('string', ''), admin_password: s('string', '') },
    map: {
      create: ['propose_create_gallery', i => ({ title: i.title, lead_id: i.lead_id, client_email: i.client_email, category: i.category, folders: i.folders, guest_password: i.guest_password, admin_password: i.admin_password })],
      add_folder: ['propose_add_gallery_folder', i => ({ album_id: i.album_id, name: i.name })],
      mark_selection: ['propose_mark_selection', i => ({ album_id: i.album_id, done: i.done })],
      delete: ['propose_delete_gallery', i => ({ album_id: i.album_id })],
    },
  },
  lead_quick: {
    description: 'A quick action on a lead: note (private), archive, record_payment (received outside the system: amount, method), send_packages.',
    params: { do: s('string', '', { enum: ['note', 'archive', 'record_payment', 'send_packages'] }), client: s('string', 'a client name — no need to look them up first'), lead_id: s('integer', ''), note: s('string', ''), amount: s('number', ''), method: s('string', '') },
    map: {
      note: ['propose_add_note', i => ({ lead_id: i.lead_id, note: i.note })],
      archive: ['propose_archive_lead', i => ({ lead_id: i.lead_id })],
      record_payment: ['propose_record_payment', i => ({ lead_id: i.lead_id, amount: i.amount, method: i.method, note: i.note })],
      send_packages: ['propose_send_packages', i => ({ lead_id: i.lead_id })],
    },
    byClient: true,
  },
};
/** The tools the merged ones replace (left out of the voice model's list). */
export const MERGED_AWAY = new Set(Object.values(MERGED).flatMap(m => Object.values(m.map).map(x => x[0])));
/** The merged tools as declarations for the voice model. */
export const MERGED_TOOLS = Object.entries(MERGED).map(([name, m]) => ({ name, description: m.description, input_schema: { type: 'object', properties: Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, v.description ? v : (({ description, ...rest }) => rest)(v)])), required: [m.key || 'do'].filter(k => k in m.params) } }));
/** May this merged tool be called with a client's name instead of a lead_id? */
export const takesClient = (name) => Boolean(MERGED[name]?.byClient);

/** A merged call → the original tool and its own parameters (undefined values dropped). */
export function unmerge(name, input = {}) {
  const m = MERGED[name];
  if (!m) return { name, input };
  const which = String(input[m.key || 'do']);
  const hit = m.map[which];
  if (!hit) return { name: null, input: {} };
  const args = Object.fromEntries(Object.entries(hit[1](input)).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return { name: hit[0], input: args };
}
