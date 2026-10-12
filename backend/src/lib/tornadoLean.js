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
  web_search: 'Search the web for anything outside the panel: gear, prices, places, distances, travel times, news, how-to.',
  search_knowledge: 'Search ALL panel data written as sentences (leads, bookings, money, calls, galleries, selections, crew, packages, File Flyer, RAWs, occasions, reminders, analytics) by words; optional section.',
  leads_by_price: 'Every lead with its price (chosen package, override, assigned or quoted) — highest first.',
  lookup_contact: 'FIRST STOP for any person, number or email: their whole history in one line (inquiries, booked/done/delivered/paid, calls, texts, galleries).',
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
    if (k === 'description' && typeof v === 'string') out[k] = v.split(/ — |; |\. | \(/)[0].slice(0, 60);
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
