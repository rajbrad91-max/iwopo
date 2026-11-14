/**
 * 🗓️ A lead's events, read one way for everyone (Raj, 2026-11-13).
 *
 * The contract's coverage schedule and the client's link both list the booking's events — the main event, any
 * dated part the inquiry form asked about ("Pre-Wedding Shoot — Date"), and the pre-events. They read them here,
 * so the client never sees a different set from the one they sign.
 *
 * The inquiry form decides what was asked, so answers are found by the question's wording (any vendor's form):
 * formAnswer, gettingReadyRows and the dated-group logic moved here unchanged from routes/contracts.js.
 */

/** the service the client asked for: "Type of Service", "What do you need", "Coverage type"… */
export const SERVICE_RE = /what do you need|coverage type|services? needed|type of service|service type/i;
/** which sides are covered: "Coverage — Sides" */
export const SIDE_RE = /side/i;

/** a lead's answer to an inquiry-form question, found by the question's wording */
export function formAnswer(lead, re) {
  const qs = lead.questions || [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  // the first question so worded that this lead ANSWERED — a form can word several that way
  for (const f of qs.filter(x => re.test(x.label || ''))) {
    const v = f.maps_to && lead[f.maps_to] != null ? lead[f.maps_to] : cd[f.id];
    if (v != null && v !== '' && typeof v !== 'object') return String(v);
  }
  return '';
}

/**
 * Getting-ready rows for what this inquiry asked.
 * A "Getting-ready coverage" tick is the answer — bride and groom rows
 * are not printed under it. A lead with no questions still prints both rows. A form
 * that never asked, with a Yes already stored, prints both rows too.
 */
export function gettingReadyRows(lead) {
  const qs = lead.questions || [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const yesNo = (on, venue) => (on ? (venue ? `Yes — ${venue}` : 'Yes') : 'No');   // B4: the venue the client gave
  const both = () => [
    ['Bride Getting Ready', yesNo(lead.gr_bride, lead.gr_bride_venue)],
    ['Groom Getting Ready', yesNo(lead.gr_groom, lead.gr_groom_venue)],
  ];
  if (!qs.length) return both();
  const rows = [];
  if (qs.some(f => f.maps_to === 'gr_bride')) rows.push(['Bride Getting Ready', yesNo(lead.gr_bride, lead.gr_bride_venue)]);
  if (qs.some(f => f.maps_to === 'gr_groom')) rows.push(['Groom Getting Ready', yesNo(lead.gr_groom, lead.gr_groom_venue)]);
  for (const f of qs) {
    if (f.type !== 'checkbox') continue;
    if (f.maps_to === 'gr_bride' || f.maps_to === 'gr_groom') continue;
    if (!/getting[- ]?ready/i.test(f.label || '')) continue;
    rows.push([f.label, yesNo(cd[f.id] === true)]);
  }
  if (rows.length) return rows;
  if (lead.gr_bride || lead.gr_groom) return both();
  return [];
}

const splitLabel = (label) => { const m = String(label || '').match(/^(.+?)\s+[—–-]\s+(.+)$/); return m ? [m[1].trim(), m[2].trim()] : [String(label || '').trim(), '']; };

/**
 * Other dated parts of the booking the inquiry asked about (B5, 2026-10-30) — e.g. "Pre-Wedding Shoot — Date" and
 * "Pre-Wedding Shoot — Service". Any form: a DATE question that is not the event date opens a group; questions
 * named with the same start before " — " (or " - ") are its rows. Only answered questions count.
 * → [{ head, date, rows: [{ label, type, value }] }]
 */
export function extraScheduleGroups(lead) {
  const qs = lead.questions || [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const out = [];
  for (const d of qs) {
    if (d.type !== 'date' || d.maps_to === 'event_date' || !cd[d.id]) continue;
    const [head] = splitLabel(d.label);
    const rows = qs.filter(f => splitLabel(f.label)[0] === head && cd[f.id] !== undefined && cd[f.id] !== '' && cd[f.id] !== null)
      .map(f => ({ label: splitLabel(f.label)[1] || f.label, type: f.type, value: cd[f.id] }));
    out.push({ head, date: String(cd[d.id]), rows });
  }
  return out;
}

/** a time column as "HH:MM" — Prisma hands TIME columns back as Dates on 1970-01-01 */
const hhmm = (v) => (v instanceof Date ? v.toISOString().slice(11, 16) : String(v || '').slice(0, 5));
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
/** hours between two "HH:MM" times, to the half hour (past midnight counts as the next day); 0 when either is missing */
function hoursBetween(from, to) {
  if (!/^\d{1,2}:\d{2}/.test(from || '') || !/^\d{1,2}:\d{2}/.test(to || '')) return 0;
  const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round(mins / 30) / 2;
}

/**
 * Every event of the booking as plain facts, in date order (undated last):
 * [{ main, date, name, from, to, hours, location, guests, service, side, notes[] }] — empty parts are ''.
 * Only what the client told us: no vendor notes, no prices.
 */
export function eventsForLead(lead) {
  const events = [];
  const from = hhmm(lead.timing_from), to = hhmm(lead.timing_to);
  const main = {
    main: true, date: ymd(lead.event_date), name: lead.event_type || 'Event', from, to,
    hours: Number(lead.hours) || hoursBetween(from, to),
    location: lead.location || '', guests: lead.guests != null ? String(lead.guests) : '',
    service: formAnswer(lead, SERVICE_RE), side: formAnswer(lead, SIDE_RE),
    // getting ready, where the client said yes: "Bride getting ready · 2084 meadows st"
    notes: gettingReadyRows(lead).filter(([, v]) => v.startsWith('Yes'))
      .map(([k, v]) => { const venue = v.replace(/^Yes( — )?/, ''); const label = k.charAt(0) + k.slice(1).toLowerCase(); return venue ? `${label} · ${venue}` : label; }),
  };
  if (main.date || main.from || main.location) events.push(main);
  for (const g of extraScheduleGroups(lead)) {
    const svc = g.rows.find(r => r.type !== 'date' && /service/i.test(r.label));
    const notes = g.rows.filter(r => r.type !== 'date' && r !== svc)
      .map(r => (r.value === true ? r.label : r.value === false ? '' : String(r.value))).filter(Boolean);
    events.push({ main: false, date: g.date, name: g.head, from: '', to: '', hours: 0, location: '', guests: '', service: svc ? String(svc.value) : '', side: '', notes });
  }
  for (const e of Array.isArray(lead.pre_events) ? lead.pre_events : []) {
    if (!e || !e.name) continue;
    events.push({
      main: false, date: String(e.date || ''), name: String(e.name), from: e.from || '', to: e.to || '',
      hours: hoursBetween(e.from, e.to), location: e.location || '', guests: e.guests ? String(e.guests) : '',
      service: e.service || '', side: '', notes: [],
    });
  }
  return events.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
