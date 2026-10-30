import express from 'express';
import { WEDDING_AGREEMENT } from '../../../frontend/src/lib/contractStarters.js';   // one source for the starter, shared with Contract setup
import { htmlToPdf } from '../lib/pdf.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary, pickedOffer } from './payments.js';
import { currencyFor } from '../lib/currencies.js';
import { calendarYmd, formatWallTime } from '../lib/wallClock.js';
import { resolveTimezone } from '../lib/timezones.js';
import { notify } from './notifications.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}
function ipOf(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}
export async function audit(contractId, event, ip, meta) {
  await prisma.contract_audit.create({
    data: { contract_id: contractId, event, ip: ip || null, meta: meta ?? null },
  });
}

/**
 * 📄 Pick the contract template for a lead: prefer one whose event_type matches,
 * otherwise the vendor's first. Shared by preview, creation and the portal's
 * regeneration path so all three draw from the same template.
 */
/**
 * 📝 A vendor with no contract template gets the ready-made Event Coverage Agreement as their default — their own copy,
 * every word editable in Contract setup (2026-10-28). Before this a new vendor's first contract failed with
 * "No contract template yet". Runs only when the vendor has none at all.
 */
export async function ensureStarterTemplate(vendorId) {
  if (!vendorId) return null;
  if (await prisma.contract_templates.count({ where: { vendor_id: vendorId } })) return null;   // 🔒 tenancy
  const { name, event_type, header, accent, font_style, sections, legal_terms } = WEDDING_AGREEMENT;
  return prisma.contract_templates.create({
    data: { vendor_id: vendorId, name, event_type, header, accent, font_style, sections, legal_terms, is_default: true },
  });
}

export async function templateForLead(lead, templateId = null) {
  if (templateId) {
    return prisma.contract_templates.findFirst({
      where: { id: Number(templateId), vendor_id: lead.vendor_id },   // 🔒 tenancy
    });
  }
  await ensureStarterTemplate(lead.vendor_id);
  const tpls = await prisma.contract_templates.findMany({
    where: { vendor_id: lead.vendor_id },                             // 🔒 tenancy
    orderBy: { id: 'asc' },
  });
  if (!tpls.length) return null;

  /* 1 · a template written for this kind of event */
  const byType = tpls.find(x => x.event_type && lead.event_type
    && x.event_type.toLowerCase() === String(lead.event_type).toLowerCase());
  if (byType) return byType;

  /* 2 · ⚠️ the vendor's chosen default — the point of marking one. Before
         this it fell straight to tpls[0], whichever had the lowest id. */
  const marked = tpls.find(x => x.is_default);
  if (marked) return marked;

  /* 3 · the oldest, as a last resort */
  return tpls[0];
}

/** Only what a section may hold, each trimmed to what the page can show. */
function cleanSections(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map((x, i) => ({
    id: String(x.id || `s${i + 1}`).slice(0, 24),
    title: String(x.title || '').trim().slice(0, 120),
    text: String(x.text || '').slice(0, 8000),
    initial: !!x.initial,
    // a word the package must include for this section to appear at all
    show_if: String(x.show_if || '').trim().slice(0, 120),
  })).filter(x => x.title || x.text);
}

/**
 * The template joined into one body, ready for placeholder fill.
 *
 * A template is a list of titled sections — each policy in its own block — so a
 * vendor can see and edit one term at a time instead of scrolling one long
 * field. A section marked for initials gets an [INITIAL] box after its text,
 * which is what makes the client acknowledge that clause specifically.
 *
 * Templates written before sections existed still carry their whole contract in
 * `body`, so that is used when there are no sections. Nothing has to be migrated
 * for an old template to keep working.
 */
// 🔤 Fill placeholders from lead + package + money

/* ════════════════════════════════════════════════════════════════════════
   📐 Rendering a contract as a real document, not a wall of text.

   A signed agreement is judged on how it reads: a shaded table for what was
   booked, a ruled heading for each clause, a green/grey badge for what a
   package does and doesn't include. None of that survives in plain text no
   matter how carefully the wording is written, so the body built here is HTML
   — the same table-based shape a printed contract has always used, rendered
   on screen instead of on paper.

   Every value that came from someone typing — a client's name on an inquiry
   form, a vendor's own clause wording — is escaped before it reaches the page.
   A contract is exactly the kind of document a stray "<" should never be able
   to break.
   ═══════════════════════════════════════════════════════════════════════ */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtContractDate(d) {
  const ymd = calendarYmd(d);
  if (!ymd) return '';
  const [y, mo, da] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, da));
  return utc.toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** "6 hrs" from the inquiry when the client typed that; otherwise the column. */
function hoursLabel(lead) {
  const snap = Array.isArray(lead?.form_snapshot) ? lead.form_snapshot : [];
  const cd = lead?.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const f = snap.find(x => x.maps_to === 'hours' || x.type === 'hours');
  const raw = f ? cd[f.id] : null;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  const n = Number(lead?.hours);
  if (!n) return '';
  return `${n} hour${n === 1 ? '' : 's'}`;
}

/** Vendor-typed wording, already placeholder-filled → paragraphs. */
function proseHtml(text) {
  return escapeHtml(text)
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map((p) => {
      // "Payment:" alone on the first line of a paragraph is that paragraph's sub-heading (like the reference agreement)
      const [first, ...rest] = p.split('\n');
      if (rest.length && first.trim().length < 80 && /:$/.test(first.trim())) {
        return `<h3>${first.trim()}</h3><p>${rest.join('\n').trim().replace(/\n/g, '<br>')}</p>`;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

/** A labelled row. Empty values are simply not rows — a blank field says nothing. */
function kvRows(rows) {
  return rows.filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
}
function kvTable(cls, rows) {
  const body = kvRows(rows);
  return body ? `<table class="${cls}"><tbody>${body}</tbody></table>` : '';
}

/** What was booked, at a glance. */
/** a lead's answer to an inquiry-form question, found by the question's wording */
function formAnswer(lead, re) {
  const snap = Array.isArray(lead.form_snapshot) ? lead.form_snapshot : [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const f = snap.find(x => re.test(x.label || ''));
  if (!f) return '';
  const v = f.maps_to && lead[f.maps_to] != null ? lead[f.maps_to] : cd[f.id];
  return v == null || v === '' || typeof v === 'object' ? '' : String(v);
}
const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** "Two Photographers" from the crew on the booking (nothing when nobody of that kind is booked) */
function crewCount(crew, re, one, many) {
  const n = (crew || []).filter(c => re.test(`${c.duty || ''} ${c.crew_members?.role || ''}`)).length;
  return n ? `${COUNT_WORDS[n] || n} ${n === 1 ? one : many}` : '';
}

/** 🧾 Booking Details — the reference agreement's first table (Raj, 2026-10-24) */
function bookingDetailsHtml(lead, pkgName, crew) {
  return kvTable('ct-details', [
    ['Client Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Event Type', formAnswer(lead, /type of event|event type/i) || lead.event_type],
    ['Package', pkgName === '—' ? '' : pkgName],
    ['Coverage Type', formAnswer(lead, /what do you need|coverage type|services? needed/i)],
    ['Sides Covered', formAnswer(lead, /side/i)],
    ['Photographers', crewCount(crew, /photo/i, 'Photographer', 'Photographers')],
    ['Videographers', crewCount(crew, /video|cine/i, 'Videographer', 'Videographers')],
  ]);
}

/**
 * Getting-ready rows for what this inquiry asked.
 * A "Getting-ready coverage" tick is the answer — bride and groom rows
 * are not printed under it. No snapshot still prints both rows. A snapshot
 * that never asked, with a Yes already stored, prints both rows too.
 */
function gettingReadyRows(lead) {
  const snap = Array.isArray(lead.form_snapshot) ? lead.form_snapshot : [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const yesNo = (on, venue) => (on ? (venue ? `Yes — ${venue}` : 'Yes') : 'No');   // B4: the venue the client gave
  const both = () => [
    ['Bride Getting Ready', yesNo(lead.gr_bride, lead.gr_bride_venue)],
    ['Groom Getting Ready', yesNo(lead.gr_groom, lead.gr_groom_venue)],
  ];
  if (!snap.length) return both();
  const rows = [];
  if (snap.some(f => f.maps_to === 'gr_bride')) rows.push(['Bride Getting Ready', yesNo(lead.gr_bride, lead.gr_bride_venue)]);
  if (snap.some(f => f.maps_to === 'gr_groom')) rows.push(['Groom Getting Ready', yesNo(lead.gr_groom, lead.gr_groom_venue)]);
  for (const f of snap) {
    if (f.type !== 'checkbox') continue;
    if (f.maps_to === 'gr_bride' || f.maps_to === 'gr_groom') continue;
    if (!/getting[- ]?ready/i.test(f.label || '')) continue;
    rows.push([f.label, yesNo(cd[f.id] === true)]);
  }
  if (rows.length) return rows;
  if (lead.gr_bride || lead.gr_groom) return both();
  return [];
}

/** a time column as "HH:MM" — Prisma hands TIME columns back as Dates on 1970-01-01 */
const hhmm = (v) => (v instanceof Date ? v.toISOString().slice(11, 16) : String(v || '').slice(0, 5));
/** "5.5 hours" between two "HH:MM" times (past midnight counts as the next day) */
function hoursBetween(from, to) {
  if (!from || !to) return '';
  const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.round(mins / 30) / 2;
  return `${h} hour${h === 1 ? '' : 's'}`;
}
/** 🗓️ the lead's pre-events, in date order, under a gold heading — like the reference agreement */
function preEventsHtml(lead, fmtTime, fmtDate) {
  const list = (Array.isArray(lead.pre_events) ? lead.pre_events : []).filter(e => e && e.name)
    .sort((x, y) => String(x.date || '9999').localeCompare(String(y.date || '9999')));
  if (!list.length) return '';
  return '<h2 class="ct-gold">Pre-Events</h2>' + list.map(e => `<h3>${escapeHtml(e.name)}</h3>` + kvTable('ct-kv', [
    ['Date', e.date ? fmtDate(new Date(`${e.date}T12:00:00Z`)) : ''],
    ['Time', e.from ? `${fmtTime(e.from)} – ${e.to ? fmtTime(e.to) : 'TBC'}` : ''],
    ['Hours', hoursBetween(e.from, e.to)],
    ['Location', e.location],
    ['Est Guests', e.guests],
    ['Service', e.service],
  ])).join('');
}

/**
 * 🗓️ Other dated parts of the booking the inquiry asked about (B5, 2026-10-30) — e.g. "Pre-Wedding Shoot — Date" and
 * "Pre-Wedding Shoot — Service". Any form: a DATE question that is not the event date opens an item; questions
 * named with the same start before " — " (or " - ") are its other rows. Only answered questions print, so a part
 * the client did not ask for (or that was hidden for them) never appears.
 */
function extraScheduleHtml(lead, fmtDate) {
  const snap = Array.isArray(lead.form_snapshot) ? lead.form_snapshot : [];
  const cd = lead.custom_data && typeof lead.custom_data === 'object' ? lead.custom_data : {};
  const split = (label) => { const m = String(label || '').match(/^(.+?)\s+[—–-]\s+(.+)$/); return m ? [m[1].trim(), m[2].trim()] : [String(label || '').trim(), '']; };
  const out = [];
  for (const d of snap) {
    if (d.type !== 'date' || d.maps_to === 'event_date' || !cd[d.id]) continue;
    const [head] = split(d.label);
    const rows = snap.filter(f => split(f.label)[0] === head && cd[f.id] !== undefined && cd[f.id] !== '' && cd[f.id] !== null)
      .map(f => [split(f.label)[1] || f.label, f.type === 'date' ? fmtDate(new Date(`${cd[f.id]}T12:00:00Z`)) : (cd[f.id] === true ? 'Yes' : cd[f.id] === false ? 'No' : String(cd[f.id]))]);
    const table = kvTable('ct-kv', rows);
    if (table) out.push(`<h3>${escapeHtml(head)}</h3>${table}`);
  }
  return out.join('');
}

function coverageScheduleHtml(lead, fmtTime, fmtDate) {
  const main = kvTable('ct-kv', [
    ['Date', fmtDate(lead.event_date)],
    ['Time', lead.timing_from ? `${fmtTime(lead.timing_from)} – ${lead.timing_to ? fmtTime(lead.timing_to) : 'TBC'}` : ''],
    ['Hours', String(hoursLabel(lead) || '').replace(/\bhrs\b/g, 'hours').replace(/\bhr\b/g, 'hour') || hoursBetween(hhmm(lead.timing_from), hhmm(lead.timing_to))],
    ['Location', lead.location],
    ['Est Guests', lead.guests],
    ['Service', formAnswer(lead, /what do you need|coverage type|services? needed/i)],
  ]);
  if (!main) return '';
  const getting = kvTable('ct-kv', gettingReadyRows(lead));
  return `<h3>Main Event — ${escapeHtml(lead.event_type || 'Event')}</h3>${main}`
    + (getting ? `<h3>Getting Ready Coverage</h3>${getting}` : '')
    + extraScheduleHtml(lead, fmtDate)
    + preEventsHtml(lead, fmtTime, fmtDate);
}

/** 📦 Package inclusions as the reference shows them: a package line ending in ":" ("Team & Staffing:") heads a
    group, the lines after it are its bullets; a package without such lines is one plain bullet list. */
function deliverablesHtml(inclusions) {
  const groups = []; let cur = null;
  for (const raw of inclusions || []) {
    const text = String(raw ?? '').replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const head = text.match(/^(.{2,60}):$/);
    if (head) { cur = { head: head[1], items: [] }; groups.push(cur); continue; }
    if (!cur) { cur = { head: '', items: [] }; groups.push(cur); }
    cur.items.push(text);
  }
  return groups.filter(g => g.items.length)
    .map(g => `${g.head ? `<h3>${escapeHtml(g.head)}</h3>` : ''}<ul>${g.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`).join('');
}

function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Contracts saved before this table still store a bullet list.
 * Those lines become the same open table on the way out. The saved
 * bytes, and the signature over them, are left as they were.
 */
export function upgradeDeliverables(html) {
  return String(html || '').replace(/<ul class="ct-incl">([\s\S]*?)<\/ul>/g, (full, inner) => {
    const lines = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => unescapeHtml(m[1]));
    return deliverablesHtml(lines) || full;
  });
}

/**
 * Included / Not included, stated for BOTH.
 *
 * Saying only what is included leaves a client to assume the rest; naming what
 * is not is how a disagreement on the day is avoided. Every row always shows —
 * "Not Included" is as much a fact of the booking as "Included" is.
 */
const OPTIONAL_SERVICES = [
  ['Drone Coverage', ['drone', 'aerial']],
  ['Live Feed Service', ['live feed', 'live-feed']],
  ['Live Streaming', ['live stream', 'live-stream', 'streaming']],
  ['Next Day Edit (NDE)', ['next day edit', 'nde']],
];
function servicesSummaryHtml(inclusions) {
  const hay = inclusions.join(' ').toLowerCase();
  const rows = OPTIONAL_SERVICES.map(([label, keys]) => {
    const has = keys.some(k => hay.includes(k));
    const badge = has ? '<span class="ct-inc">Included</span>' : '<span class="ct-notinc">Not Included</span>';
    return `<tr><th>${escapeHtml(label)}</th><td>${badge}</td></tr>`;
  }).join('');
  return `<table class="ct-svc"><tbody>${rows}</tbody></table>`;
}

/** Who is coming, and what they are doing. */
function crewHtml(crew, fmtTime) {
  if (!crew.length) return '';
  return kvTable('ct-kv', crew.map(c => [
    c.crew_members?.name || 'Crew',
    [c.duty, c.arrive_time ? `from ${fmtTime(c.arrive_time)}` : ''].filter(Boolean).join(' · ') || 'On the day',
  ]));
}

/** Logo beside the vendor's details — the business name, then the template's own header lines (tagline, address,
    website… whatever the vendor typed), then phone | email unless a line already gives them. */
function headbandHtml(headerText, logoPath, v = {}) {
  const typed = String(headerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const contact = [v.phone, v.email].filter(Boolean);
  const said = (x) => typed.some(l => l.includes(x));
  const lines = [
    ...(v.name && !typed.some(l => l.toLowerCase() === String(v.name).toLowerCase()) ? [v.name] : []),
    ...typed,
    ...(contact.length && !contact.some(said) ? [contact.join(' | ')] : []),
  ].map(escapeHtml);
  const info = lines.length ? `<p>${lines.join('<br>')}</p>` : '';
  const logo = logoPath ? `<img class="ct-logo" src="/api/me/logo/${escapeHtml(logoPath)}" alt="" />` : '';
  if (!logo && !info) return '';
  return `<table class="ct-headband"><tbody><tr><td class="ct-hb-logo">${logo}</td><td class="ct-hb-info">${info}</td></tr></tbody></table>`;
}

/**
 * One template section → one ct-sec block, or nothing if it has nothing to say.
 *
 * Prose is escaped. A block token (alone or inside a sentence) is HTML this
 * server built, so it is not escaped. An empty block drops out.
 */
/** a heading typed in ALL CAPS reads as Title Case, "AND" as "&" — headings typed normally are left alone */
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'in', 'on', 'to', 'or', 'by', 'at', 'with']);
function headingText(t) {
  const s = String(t || '');
  if (!/[A-Z]/.test(s) || s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    if (w === 'and') return '&';
    if (i > 0 && SMALL_WORDS.has(w)) return w;
    return w.replace(/^([^a-z]*)([a-z])/, (m, p, ch) => p + ch.toUpperCase());
  }).join('');
}

const BLOCK_TOKEN = /\{\{(booking_details|coverage_schedule|deliverables|services_summary|crew)\}\}/;

function renderSectionBody(rawText, values, blocks) {
  if (!BLOCK_TOKEN.test(rawText)) return proseHtml(substitute(rawText, values));
  const re = new RegExp(BLOCK_TOKEN.source, 'g');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(rawText))) {
    out += proseHtml(substitute(rawText.slice(last, m.index), values));
    out += blocks[m[1]] || '';
    last = m.index + m[0].length;
  }
  out += proseHtml(substitute(rawText.slice(last), values));
  return out;
}

function sectionHtml(section, values, blocks, initCounter) {
  const rawText = (section.text || '').trim();
  const bodyHtml = renderSectionBody(rawText, values, blocks);
  if (!bodyHtml.trim()) return '';                 // nothing to show — the whole section goes

  let initHtml = '';
  if (section.initial) {
    const idx = initCounter.n++;
    initHtml = `<table class="ct-init"><tbody><tr><td class="ct-init-label">Client Initials</td>`
      + `<td class="ct-init-line"><span class="ct-init-tap" data-init-idx="${idx}">TAP TO INITIAL</span></td></tr></tbody></table>`;
  }
  const title = (section.title || '').trim();
  return `<div class="ct-sec">${title ? `<h2>${escapeHtml(headingText(title))}</h2>` : ''}${bodyHtml}${initHtml}</div>`;
}

function substitute(text, values) {
  let t = String(text ?? '');
  for (const [k, v] of Object.entries(values)) t = t.split(k).join(v == null ? '' : String(v));
  // a token the template still names, and this booking has no value for, must
  // not reach the client as {{like_this}}
  return t.replace(/\{\{[a-z0-9_]+\}\}/gi, '');
}

/**
 * Price one package version.
 * The stored contract still goes through moneySummary — a single offer, a
 * snapshot, or a manual total. A preview of package N prices that package.
 */
function moneyForPackage(lead, price, money) {
  const total = Number(price?.toString?.() ?? price) || 0;
  const discount = (Number(lead.discount_percent) || 0) / 100 * total;
  const finalTotal = Math.max(total - discount, 0);
  const hasOverride = lead.deposit_amount_override != null;
  const deposit = hasOverride
    ? Number(lead.deposit_amount_override)
    : (Number(lead.deposit_percent) || 0) / 100 * finalTotal;
  return {
    ...money,
    base_total: +total.toFixed(2),
    discount_amount: +discount.toFixed(2),
    final_total: +finalTotal.toFixed(2),
    deposit_amount: +deposit.toFixed(2),
  };
}

/**
 * 📄 Build a lead's contract body from a template — the only way it is done.
 *
 * Assembling used to be two calls a caller had to make in the right order, and
 * with conditional sections it became three: fetch what the package includes,
 * drop the sections that don't apply, then fill in the blanks. Four places did
 * the first two, and every one of them would have had to remember the third.
 * They all call this instead.
 */
export async function buildContractBody(template, lead, businessName, opts = {}) {
  const forceId = Number(opts?.packageId) || null;
  const [offeredPkgs, crew, moneyRaw, vset, vrow] = await Promise.all([
    prisma.lead_packages.findMany({
      where: { lead_id: lead.id },                         // 🔒 tenancy via the lead
      select: { id: true, name: true, price: true, inclusions: true, is_selected: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    }),
    prisma.lead_crew.findMany({
      where: { lead_id: lead.id },
      select: { duty: true, arrive_time: true, crew_members: { select: { name: true } } },
      orderBy: { id: 'asc' },
    }),
    moneySummary(lead),
    prisma.vendor_settings.findUnique({
      where: { vendor_id: lead.vendor_id }, select: { currency: true, time_format: true, timezone: true }, // 🔒 the lead's owner
    }),
    prisma.vendors.findUnique({
      where: { id: lead.vendor_id }, select: { country: true, logo_path: true, phone: true, email: true },
    }),
  ]);
  const chosen = forceId
    ? (offeredPkgs.find(p => p.id === forceId) || null)
    : pickedOffer(offeredPkgs);
  const money = (forceId && chosen) ? moneyForPackage(lead, chosen.price, moneyRaw) : moneyRaw;
  const inclusions = Array.isArray(chosen?.inclusions) ? chosen.inclusions.map(String).filter(Boolean) : [];
  const pkgName = chosen?.name || '—';

  const fmtDate = fmtContractDate;
  const pref = vset?.time_format === '24h' ? '24h' : '12h';
  const fmtTime = (t) => formatWallTime(t, pref);
  const zone = resolveTimezone(vset?.timezone, vrow?.country);
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: zone.tz || 'UTC',
  });
  const code = currencyFor(vset?.currency, vrow?.country);
  const cash = (v) => {
    const num = Number(v || 0);
    try {
      return num.toLocaleString('en', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } catch { return `${num} ${code}`; }
  };

  const values = {
    '{{client_name}}': lead.name || '—',
    '{{client_email}}': lead.email || '—',
    '{{client_phone}}': lead.phone || '—',
    '{{deposit_percent}}': `${Number(lead.deposit_percent ?? 0)}%`,
    '{{event_type}}': lead.event_type || '—',
    '{{event_date}}': fmtDate(lead.event_date) || '—',
    '{{location}}': lead.location || '—',
    '{{hours}}': lead.hours ?? 'agreed',
    '{{guests}}': lead.guests ?? 'the expected number of',
    '{{package_name}}': chosen?.name || 'custom',   // no package chosen: "under the custom package", never "under the — package"
    '{{total_cost}}': cash(money.final_total),
    '{{deposit}}': cash(money.deposit_amount),
    // on a contract this means what's left AFTER the deposit, not what's
    // outstanding today — see the note on the earlier fix for why
    '{{balance}}': cash(Math.max(money.final_total - money.deposit_amount, 0)),
    '{{today_date}}': today,
    '{{company_name}}': businessName || '—',
    '{{company_phone}}': vrow?.phone || '',
    '{{company_email}}': vrow?.email || '',
  };
  const blocks = {
    booking_details: bookingDetailsHtml(lead, pkgName, crew),
    coverage_schedule: coverageScheduleHtml(lead, fmtTime, fmtDate),
    deliverables: deliverablesHtml(inclusions),
    services_summary: servicesSummaryHtml(inclusions),
    crew: crewHtml(crew, fmtTime),
  };

  const sections = (Array.isArray(template.sections) ? template.sections : [])
    .filter(x => sectionApplies(x, inclusions));
  const initCounter = { n: 0 };
  const secHtml = sections.map(x => sectionHtml(x, values, blocks, initCounter)).filter(Boolean).join('');
  const legal = (template.legal_terms || '').replace(/^\s*terms\s*(&|and)\s*conditions\s*\n+/i, '');
  const legalHtml = legal.trim()
    ? `<div class="ct-sec"><h2>Terms &amp; Conditions</h2>${proseHtml(substitute(legal, values))}</div>` : '';

  const doc = [
    headbandHtml(substitute(template.header || '', values), vrow?.logo_path, { name: businessName, phone: vrow?.phone, email: vrow?.email }),
    `<h1 class="ct-doc-title">${escapeHtml(template.name || 'Service Agreement')}</h1>`,
    `<p class="ct-doc-for">FOR ${escapeHtml(lead.name || '')} — ${escapeHtml(lead.event_type || '')} on ${escapeHtml(fmtDate(lead.event_date))}</p>`,
    secHtml,
    legalHtml,
  ].filter(Boolean).join('');
  // 🎨 the template's look travels inside the document, so preview, signing and the delivered copy all show it
  const accent = CONTRACT_ACCENTS.includes(template.accent) ? template.accent : 'gold';
  const fonts = CONTRACT_FONTS.includes(template.font_style) ? template.font_style : 'classic';
  return `<div class="ct-theme ct-accent-${accent} ct-fonts-${fonts}">${doc}</div>`;
}

/**
 * The no-template path: a vendor's own pasted body, as one flowing prose
 * block. There is no section structure to hang tables on here, so this stays
 * plain paragraphs — the templated path above is what carries the real layout.
 */
export async function fillPlaceholders(text, lead, businessName) {
  const money = await moneySummary(lead);
  const vset = await prisma.vendor_settings.findUnique({
    where: { vendor_id: lead.vendor_id }, select: { currency: true, timezone: true },
  });
  const vrow = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { country: true } });
  const fmtDate = fmtContractDate;
  const zone = resolveTimezone(vset?.timezone, vrow?.country);
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: zone.tz || 'UTC',
  });
  const code = currencyFor(vset?.currency, vrow?.country);
  const cash = (v) => {
    try { return Number(v || 0).toLocaleString('en', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
    catch { return `${Number(v || 0)} ${code}`; }
  };
  const values = {
    '{{client_name}}': lead.name || '—', '{{client_email}}': lead.email || '—', '{{client_phone}}': lead.phone || '—', '{{deposit_percent}}': `${Number(lead.deposit_percent ?? 0)}%`,
    '{{event_type}}': lead.event_type || '—', '{{event_date}}': fmtDate(lead.event_date) || '—',
    '{{location}}': lead.location || '—', '{{hours}}': lead.hours ?? 'agreed', '{{guests}}': lead.guests ?? 'the expected number of',
    '{{total_cost}}': cash(money.final_total), '{{deposit}}': cash(money.deposit_amount),
    '{{balance}}': cash(Math.max(money.final_total - money.deposit_amount, 0)),
    '{{today_date}}': today, '{{company_name}}': businessName || '—',
  };
  return proseHtml(substitute(text, values));
}

/**
 * Should this section appear for this booking?
 *
 * `show_if` names something the package must include — "drone", "album" — and
 * the section is dropped when it doesn't. A section with no condition always
 * shows, so nothing existing changes.
 */
export function sectionApplies(section, inclusions) {
  const cond = String(section?.show_if || '').trim().toLowerCase();
  if (!cond) return true;
  const hay = (inclusions || []).join(' ').toLowerCase();
  return cond.split('|').map(x => x.trim()).filter(Boolean).some(k => hay.includes(k));
}


/* ───────── 📑 TEMPLATES ───────── */
// 🔢 an :id that isn't a number is simply not found — it never reaches the database as NaN (2026-10-28)
router.param('id', (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(404).json({ error: 'Not found' })));

router.get('/templates', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v) return res.status(400).json({ error: 'No vendor' });
    await ensureStarterTemplate(Number(v));   // 📝 a vendor with none starts from the ready-made agreement
    const templates = await prisma.contract_templates.findMany({
      where: { vendor_id: Number(v) },          // 🔒 tenancy
      orderBy: { id: 'asc' },
    });
    res.json({ templates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 🎨 a template's look — the vendor's choice, from a fixed list (each one is a class in contractdoc-doc.css) */
export const CONTRACT_ACCENTS = ['gold', 'navy', 'black', 'rose', 'emerald', 'plum'];
export const CONTRACT_FONTS = ['classic', 'modern', 'traditional'];
function lookOf({ accent, font_style }, onlyGiven = false) {
  const out = {};
  if (!onlyGiven || accent !== undefined) out.accent = CONTRACT_ACCENTS.includes(accent) ? accent : 'gold';
  if (!onlyGiven || font_style !== undefined) out.font_style = CONTRACT_FONTS.includes(font_style) ? font_style : 'classic';
  return out;
}

router.post('/templates', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v) return res.status(400).json({ error: 'No vendor' });
    const { name, event_type, header, body, legal_terms, sections, accent, font_style } = req.body;
    const template = await prisma.contract_templates.create({
      data: {
        vendor_id: Number(v),                   // 🔒 tenancy
        name: name || 'My Contract',
        event_type: event_type || null,
        header: header || '', body: body || '', legal_terms: legal_terms || '', ...lookOf({ accent, font_style }),
        sections: cleanSections(sections),
      },
    });
    res.status(201).json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/templates/:id', requireAuth, async (req, res) => {
  /* ⚠️ name is varchar(120). Without this the driver throws and its raw
     message — column names and types — reaches the vendor. Refused here,
     in words a person can act on. */
  if (String(req.body?.name || '').length > 120) {
    return res.status(400).json({ error: 'That name is too long — 120 characters at most.' });
  }
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.contract_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const { name, event_type, header, body, legal_terms, sections, accent, font_style } = req.body;
    // COALESCE($n, col): only overwrite what was supplied (event_type is always set)
    const data = { event_type: event_type ?? null, updated_at: new Date() };
    if (name !== undefined && name !== null) data.name = name;
    if (header !== undefined && header !== null) data.header = header;
    if (body !== undefined && body !== null) data.body = body;
    if (legal_terms !== undefined && legal_terms !== null) data.legal_terms = legal_terms;
    Object.assign(data, lookOf({ accent, font_style }, true));
    if (sections !== undefined) data.sections = cleanSections(sections);
    const template = await prisma.contract_templates.update({ where: { id }, data });
    res.json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.contract_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.contract_templates.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────── 📄 CONTRACTS (vendor side) ───────── */
// all my contracts (for sidebar tab)
/**
 * 📌 Mark one template as this vendor's default.
 * ⚠️ A vendor does one kind of work, so one agreement is the normal case.
 * Without a default, every screen needing "the contract" has to guess.
 */
router.put('/templates/:id/default', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;   // 🔒 from the token, never the body
  const id = Number(req.params.id);
  try {
    const own = await prisma.contract_templates.findUnique({
      where: { id }, select: { vendor_id: true },
    });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    /* ⚠️ Both writes or neither. A gap with two defaults is the bug. */
    await prisma.$transaction([
      prisma.contract_templates.updateMany({
        where: { vendor_id: vid, is_default: true }, data: { is_default: false },
      }),
      prisma.contract_templates.update({ where: { id }, data: { is_default: true } }),
    ]);
    res.json({ ok: true, default_id: id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v && req.user.role !== 'super_admin') return res.status(400).json({ error: 'No vendor' });
    const rows = await prisma.contracts.findMany({
      // Voided contracts are history, not work in progress. They pile up on any
      // lead that changed package, and the vendor's list should show what's
      // live, not every superseded draft. They remain in the database and the
      // audit trail records why each was voided.
      where: v
        ? { vendor_id: Number(v), status: { not: 'voided' } }   // 🔒 tenancy (super_admin may span vendors)
        : { status: { not: 'voided' } },
      orderBy: { created_at: 'desc' },
      include: { leads: { select: { name: true, event_type: true, status: true } } },
    });
    const contracts = rows.map(({ leads, ...c }) => ({
      ...c, client_name: leads?.name ?? null, lead_event: leads?.event_type ?? null,
      lead_status: leads?.status ?? null,
    }));
    res.json({ contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.leadId);
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const contracts = await prisma.contracts.findMany({
      // same rule as the overview: a superseded contract isn't something the
      // vendor acts on. The lead keeps only its live one.
      where: { lead_id: leadId, status: { not: 'voided' } },
      orderBy: { created_at: 'desc' },
    });
    res.json({ contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// create from raw text OR template (template_id) — placeholders auto-filled
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const { title, body, template_id } = req.body;
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    // the template is resolved here and the body built below, so both the
    // conditional sections and the placeholders go through one path
    let ctTitle = title || 'Service Agreement', tplId = null, tpl = null;
    if (template_id) {
      tpl = await templateForLead(lead, template_id);
      if (!tpl) return res.status(400).json({ error: 'Template not found' });
      ctTitle = title || tpl.name;
      tplId = tpl.id;
    }
    if (!tpl && !String(body || '').trim()) {
      return res.status(400).json({ error: 'Contract text required' });
    }

    const vendor = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { business_name: true } });
    // one path: conditional sections dropped, then placeholders filled
    const filled = tpl
      ? await buildContractBody(tpl, lead, vendor?.business_name)
      : await fillPlaceholders(body, lead, vendor?.business_name);

    // 🔓 A vendor who turned auto-release on has said they don't want the review
    // step; their contracts are approved the moment they're built.
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: lead.vendor_id },          // 🔒 the lead's owner, from the row
      select: { auto_release_contract: true },
    });
    const autoRelease = !!vset?.auto_release_contract;

    // Which package this contract was drawn for. The body carries the package
    // name and the prices, so if the client later picks a different one the
    // contract no longer describes what they're agreeing to — the portal uses
    // this to spot that and rebuild it. Kept FK-free because it can hold either
    // a lead_packages id or, for older leads, a vendor_packages one.
    const chosen = await prisma.lead_packages.findFirst({
      where: { lead_id: lead.id, is_selected: true },                  // 🔒 tenancy via the lead
      select: { id: true },
    });

    const contract = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead
        lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: ctTitle, body: filled, status: 'sent',
        // 🔒 built but not yet approved for sending. auto-release stamps it now
        // so a vendor who opted out of the review step is never held up by it.
        released_at: autoRelease ? new Date() : null,
        package_id: chosen?.id ?? lead.package_id ?? null,
        template_id: tplId,
      },
    });
    await audit(contract.id, 'created', ipOf(req));
    res.status(201).json({ contract });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 👁️ Preview a contract for a lead — auto-picks template, fills placeholders, no save
router.get('/preview/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    /* R1 (2026-10-30): the template THIS lead's contract was built from — not whichever one templateForLead would pick
       for the event type. Before, the vendor previewed the default while the client signed the chosen one. */
    const built = await prisma.contracts.findFirst({ where: { lead_id: lead.id }, orderBy: { id: 'desc' }, select: { template_id: true } });   // 🔒 the lead was checked above
    const t = await templateForLead(lead, built?.template_id ?? null);
    if (!t) return res.status(400).json({ error: 'No contract template yet. Create one in Contracts & Invoices → Contract setup.' });

    const vendor = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id },
      select: { business_name: true, logo_path: true, country: true },
    });
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: lead.vendor_id },
      select: { currency: true },
    });
    // versions are this lead's packages. vendor_id is never read from the query.
    const pkgs = await prisma.lead_packages.findMany({
      where: { lead_id: lead.id },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, price: true, is_selected: true },
    });
    const requested = req.query.package;
    let active = null;
    if (requested != null && String(requested) !== '') {
      const packageId = Number(requested);
      if (!Number.isInteger(packageId)) return res.status(400).json({ error: 'Unknown package' });
      active = pkgs.find(p => p.id === packageId) || null;
      if (!active) return res.status(404).json({ error: 'Package not found' });
    } else {
      active = pkgs.find(p => p.is_selected) || pkgs[0] || null;
    }
    const code = currencyFor(vset?.currency, vendor?.country);
    const priceLabel = (n) => {
      const num = Number(n?.toString?.() ?? n) || 0;
      try {
        return num.toLocaleString('en', {
          style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0,
        });
      } catch { return `${num} ${code}`; }
    };
    const filled = await buildContractBody(
      t, lead, vendor?.business_name,
      active ? { packageId: active.id } : undefined,
    );

    /**
     * The preview renders through the same component the client signs on, so it
     * has to be handed the same shape. Returning only the title and body left
     * the heading reading "· for" with the names missing — a preview that is
     * "exactly what your client sees" has to actually be that, or it teaches the
     * vendor to trust something that isn't true.
     *
     * The live contract's id and release state come too, so the Release button
     * has something to act on and can say when it was already approved.
     */
    const existing = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, voided_at: null },
      orderBy: { id: 'desc' },
      select: { id: true, released_at: true, status: true },
    });

    res.json({
      contract: {
        id: existing?.id || null,
        title: t.name,
        body: filled,
        template_name: t.name,
        business_name: vendor?.business_name || null,
        client_name: lead.name || null,
        logo_path: vendor?.logo_path || null,
        released_at: existing?.released_at || null,
        status: existing?.status || 'draft',
      },
      packages: pkgs.map(p => ({
        id: p.id,
        name: p.name,
        price_label: priceLabel(p.price),
        is_selected: p.is_selected,
      })),
      active_package_id: active?.id ?? null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.contracts.findUnique({ where: { id }, select: { vendor_id: true, status: true } });
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && c.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    if (c.status === 'signed') return res.status(400).json({ error: 'Signed contracts cannot be deleted (audit)' });
    await prisma.contracts.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// audit trail for a contract
router.get('/:id/audit', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.contracts.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && c.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const auditRows = await prisma.contract_audit.findMany({
      where: { contract_id: id },
      orderBy: { created_at: 'asc' },
    });
    res.json({ audit: auditRows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────── ✍️ PUBLIC SIGNING ───────── */
router.get('/sign/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      select: {
        id: true, title: true, body: true, status: true, signed_name: true,
        signed_at: true, initials: true, viewed_at: true,
        leads: { select: { name: true, vendor_id: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found' });

    // the vendor's own colour, so the page a client signs on looks like the
    // rest of what that vendor sends them rather than iwopo's default gold
    const brand = c.leads?.vendor_id
      ? await prisma.inquiry_settings.findUnique({
          where: { vendor_id: c.leads.vendor_id },   // 🔒 via the contract's own lead
          select: { brand_color: true },
        })
      : null;
    if (!c.viewed_at) {
      await prisma.contracts.update({ where: { id: c.id }, data: { viewed_at: new Date() } });
      await audit(c.id, 'viewed', ipOf(req));
    }
    const { leads, vendors, ...rest } = c;
    rest.body = upgradeDeliverables(rest.body);
    res.json({ contract: { ...rest, client_name: leads?.name ?? null, business_name: vendors?.business_name ?? null, logo_path: vendors?.logo_path ?? null, brand_color: brand?.brand_color ?? null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// sign: typed name + drawn signature (base64) + initials array
router.post('/sign/:token', async (req, res) => {
  const { signed_name, signature_data, initials } = req.body;
  if (!signed_name || signed_name.trim().length < 2) return res.status(400).json({ error: 'Type your full name to sign' });
  if (!signature_data) return res.status(400).json({ error: 'Please draw your signature' });
  try {
    const c = await prisma.contracts.findFirst({ where: { token: req.params.token } });   // full row: released_at is read below
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (c.status === 'signed') return res.status(400).json({ error: 'Already signed ✅' });
    /* 🚨 A VOIDED contract is not signable. It was replaced — by a package
       change, or a reopened portal — and only its replacement describes the
       booking. This route checked "signed" and nothing else, so the old token
       still took a signature and flipped a dead contract back to life. */
    if (c.status === 'voided' || c.voided_at) {
      return res.status(409).json({ error: 'voided', message: 'This contract has been replaced. Please use the latest link from your photographer.' });
    }

    /**
     * 🔒 An unreleased contract cannot be signed.
     *
     * The release step exists because a contract is auto-built from a template
     * and may say something the vendor has never read on this booking — a wrong
     * date, a clause from another trade. Until now that was enforced only on the
     * email that sends the link, which protected the vendor who had not sent it
     * yet and did nothing about a client who already held a link from an earlier
     * send, or a bookmark. They could open the portal and sign wording the
     * vendor never approved, and the signature would be as binding as any other.
     *
     * Checked here rather than only in the portal because both the portal and
     * the standalone sign page post to this endpoint — one check covers every
     * route in, including any added later.
     */
    if (!c.released_at) {
      return res.status(409).json({
        error: 'not_released',
        message: 'This contract is not ready to sign yet. Please check back shortly.',
      });
    }

    /* 🔒 Every initial box must be ticked — checked HERE, not just on the page.
       The count used to look for the literal "[INITIAL]" marker of the old
       plain-text bodies; contracts are HTML now and carry tap boxes instead,
       so the count was always 0 and the server accepted a signature with no
       initials at all. Both forms are counted, so an old contract still works. */
    const needed = (c.body.match(/data-init-idx="\d+"/g) || []).length
      + (c.body.match(/\[INITIAL\]/g) || []).length;
    const given = Array.isArray(initials) ? initials.filter(Boolean).length : 0;
    if (needed > 0 && given < needed)
      return res.status(400).json({ error: `Please tap all ${needed} initial boxes ✍️` });

    const ip = ipOf(req);
    // 🔐 document hash: body + signer + signature + timestamp
    const stamp = new Date().toISOString();
    const docHash = crypto.createHash('sha256')
      .update(c.body + '|' + signed_name.trim() + '|' + signature_data + '|' + stamp)
      .digest('hex');
    /* ⚠️ signed_at: null in the WHERE — the second request matches no row
       and is told so, rather than quietly replacing the first signature. */
    const claimed = await prisma.contracts.updateMany({
      where: { id: c.id, signed_at: null, voided_at: null },
      data: { signed_at: new Date() },
    });
    if (claimed.count === 0) {
      return res.status(409).json({ error: 'This contract has already been signed.' });
    }

    const updated = await prisma.contracts.update({
      where: { id: c.id },
      data: {
        status: 'signed', signed_name: signed_name.trim(), signed_ip: ip,
        signature_data, initials: initials || [], doc_sha256: docHash,
        signed_at: new Date(), updated_at: new Date(),
      },
    });
    await audit(c.id, 'signed', ip, { signed_name: signed_name.trim(), sha256: docHash });
    // ✍️ R2 (2026-10-30): the vendor is told straight away — signing used to leave no trace in the panel
    if (c.lead_id) notify(c.vendor_id, `✍️ ${signed_name.trim()} signed the contract`, `${c.title || 'Contract'} · payment is next`, 'contract', { type: 'lead', id: c.lead_id });
    res.json({ contract: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 📥 PUBLIC: download the signed contract, or its certificate, as a file.
 *
 * A vendor needs to keep, email or file these away from the panel — an insurer,
 * an accountant or a court is not going to be handed a link. The token is the
 * access key, exactly as on the view routes, so a client can keep their own copy
 * without an account.
 *
 * These are self-contained HTML documents: every style is inline and the
 * signature travels as its embedded data URL, so the file still renders years
 * later on a machine that has never heard of iwopo. Opening one and printing to
 * PDF produces the archival copy. Generating PDFs server-side would need a PDF
 * library added, which is a bigger decision than this route.
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* 📜 the contract document's look comes from ONE file, also used by the app (Raj, 2026-10-24):
   frontend/src/pages/contractdoc-doc.css — so the delivered contract can never drift from what was previewed and signed */
const SHARED_DOC_CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend/src/pages/contractdoc-doc.css'), 'utf8');
const FONT_IMPORT = (SHARED_DOC_CSS.match(/^@import url\([^)]*\)[^;]*;/m) || [''])[0];   // the whole url(…) — the address itself contains ";"   // must be first, or the browser ignores it
const DOC_CSS = `${FONT_IMPORT}
  body{font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#1f2937;background:#fff;
       max-width:816px;margin:40px auto;padding:0 32px 48px;line-height:1.8;font-size:14.5px}
  .hd{text-align:center;border-bottom:2px solid #222;padding-bottom:18px;margin-bottom:28px}
  .hd img{max-height:52px;max-width:72px;object-fit:contain;margin-bottom:10px}
  .biz{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#666;margin:0}
  h1{font-size:24px;margin:8px 0 0}
  .body{}
  ${SHARED_DOC_CSS.replace(FONT_IMPORT, '')}
  .ct-signed-init{display:inline-block;line-height:1.2;padding:0 4px}
  .sig{margin-top:36px;border-top:1px solid #ccc;padding-top:22px}
  .sig img{max-height:90px;display:block;margin-bottom:6px}
  .meta{font-size:12.5px;color:#555;line-height:1.9}
  .meta b{color:#1a1a1a}
  table:not([class]){width:100%;border-collapse:collapse;margin-top:18px;font-size:13.5px}
  table:not([class]) th,table:not([class]) td{text-align:left;padding:9px 10px;border-bottom:1px solid #e3e3e3;vertical-align:top}
  table:not([class]) th{width:34%;color:#555;font-weight:600}
  .fine{margin-top:34px;font-size:11.5px;color:#777;border-top:1px solid #e3e3e3;padding-top:12px;
        font-family:system-ui,sans-serif;line-height:1.7}
`;

/**
 * Serve one of these documents as a page rather than a forced download.
 *
 * Downloading straight from a list is a guess: you get a file on disk before
 * you have seen whether it is the right one. It opens in a tab instead, and
 * carries its own Save button — which prints, so the vendor gets a PDF through
 * the browser's own dialogue and can pick the folder and the name.
 *
 * The bar is hidden in print, so it never appears in the saved copy.
 */
const DOC_ACTIONS = `
  <div class="doc-actions">
    <button type="button" onclick="window.print()">🖨️ Save as PDF / Print</button>
  </div>
  <style>
    .doc-actions{position:sticky;top:0;background:#fff;padding:14px 0 16px;margin:-40px 0 18px;
      border-bottom:1px solid #e3e3e3;text-align:right;font-family:system-ui,sans-serif}
    .doc-actions button{padding:9px 18px;border:1px solid #222;border-radius:8px;background:#1a1a1a;
      color:#fff;font-size:13.5px;font-weight:600;cursor:pointer}
    .doc-actions button:hover{background:#000}
    @media print{.doc-actions{display:none}}
  </style>
`;

/* 📄 the same document as a real PDF — Letter, the reference's margins, fonts embedded. Headings stay with what follows,
   initials and the signature block are never split across pages. If the PDF can't be made, the web version is sent. */
const PDF_CSS = `
  body{max-width:none;margin:0;padding:0;font-size:11pt}
  .ct-doc h1,.ct-doc h2,.ct-doc h3{break-after:avoid;page-break-after:avoid}
  .ct-doc .ct-init,.ct-doc tr,.ct-doc .ct-accept-doc{break-inside:avoid;page-break-inside:avoid}   /* the whole Acceptance & Signature block stays on one page, like the reference */
`;
async function sendPdf(res, filename, title, inner) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${process.env.APP_URL || 'https://iwopo.com'}/">
<title>${esc(title)}</title><style>${DOC_CSS}${PDF_CSS}</style></head><body>${inner}</body></html>`;
  try {
    const pdf = await htmlToPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[contracts] PDF failed, sending the web version:', e.message);
    sendDoc(res, `${filename}.html`, title, inner);
  }
}

function sendDoc(res, filename, title, inner) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>${DOC_ACTIONS}${inner}</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // inline, not attachment: read it first, save it if you want it
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  res.send(html);
}

// PUBLIC: GET /api/contracts/download/:token → the signed agreement as a file
router.get('/download/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token, status: 'signed' },   // token is the access key
      include: {
        leads: { select: { name: true, email: true } },
      },
    });
    if (!c) return res.status(404).send('Signed contract not found');

    /**
     * The stored body is already HTML — it must NOT be escaped again here.
     *
     * This escaped the whole document and then split on a literal [INITIAL]
     * marker, both of which were correct when a contract was plain text. Left
     * as it was against the new format, a downloaded SIGNED CONTRACT would
     * render its own markup as visible text: a client opening the copy of the
     * agreement they just signed would see table tags instead of the document.
     *
     * The gold tap boxes are swapped for the initials the client actually
     * entered, so the download is a record of what was signed rather than an
     * invitation to sign it again.
     */
    const initials = (c.signed_name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase();
    const body = upgradeDeliverables(c.body).replace(
      /<span class="ct-init-tap"[^>]*>.*?<\/span>/g,
      `<span class="ct-signed-init ct-hand">${esc(initials)}</span>`
    );

    const deliver = req.query.format === 'html' ? (rs, f, t, i) => sendDoc(rs, `${f}.html`, t, i) : sendPdf;
    await deliver(res, `contract-${c.leads?.name || c.id}-${c.signed_at ? new Date(c.signed_at).toISOString().slice(0, 10) : 'signed'}`, c.title, `
      <div class="ct-doc">${body}${acceptanceHtml(c, await signedZone(c.vendor_id))}</div>
    `);
  } catch (e) { res.status(500).send(e.message); }
});

/** the vendor's time zone, for the "Signed:" line (local time, like the reference — the certificate keeps UTC) */
async function signedZone(vendorId) {
  const [vs, v] = await Promise.all([
    prisma.vendor_settings.findUnique({ where: { vendor_id: vendorId }, select: { timezone: true } }),
    prisma.vendors.findUnique({ where: { id: vendorId }, select: { country: true, business_name: true } }),
  ]);
  return { tz: resolveTimezone(vs?.timezone, v?.country)?.tz || 'UTC', company: v?.business_name || '' };
}
/** ✍️ Acceptance & Signature, as in the reference agreement (Raj, 2026-10-24). The signer's IP stays on the certificate. */
function acceptanceHtml(c, zone) {
  const at = c.signed_at ? new Date(c.signed_at) : null;
  const day = at ? at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: zone.tz }) : '—';
  const when = at ? at.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone.tz, timeZoneName: 'short' }) : '—';
  return `<div class="ct-accept-doc">
  <h2 class="ct-accept-title">Acceptance &amp; Signature</h2>
  <p>By signing below, the Client confirms they have read, understood, and agreed to every section initialed above and all Terms &amp; Conditions set out in this Agreement.</p>
  <table class="ct-details"><tbody>
    <tr><th>Client Full Name</th><td>${esc(c.signed_name || '—')}</td></tr>
    <tr><th>Authorized Company</th><td>${esc(zone.company || '—')}</td></tr>
    <tr><th>Agreement Date</th><td>${esc(day)}</td></tr>
  </tbody></table>
  <p class="ct-signed-by">Signed electronically by the client:</p>
  ${c.signature_data ? `<img class="ct-sig-img" src="${esc(c.signature_data)}" alt="Signature">` : ''}
  <p class="ct-sig-name"><b>${esc(c.signed_name || '—')}</b>${c.leads?.email ? ` · ${esc(c.leads.email)}` : ''}</p>
  <p class="ct-sig-when">Signed: ${esc(when)}</p>
  <p class="ct-fingerprint">Document fingerprint (SHA-256): ${esc(c.doc_sha256 || '—')}</p>
</div>`;
}

// PUBLIC: GET /api/contracts/certificate/:token/download → certificate as a file
router.get('/certificate/:token/download', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token, status: 'signed' },
      include: {
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).send('Certificate not found');

    const trail = await prisma.contract_audit.findMany({
      where: { contract_id: c.id },
      select: { event: true, ip: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    // every time here is UTC and says so: a record that reads differently
    // depending on who opens it is worth nothing in a dispute
    const utc = (d) => (d ? new Date(d).toUTCString() : '—');
    const rows = [
      ['Document', c.title], ['Client', c.leads?.name], ['Client email', c.leads?.email],
      ['Event', c.leads?.event_type], ['Signed by', c.signed_name],
      ['Signed at', utc(c.signed_at)], ['First viewed', utc(c.viewed_at)],
      ['Created', utc(c.created_at)], ['Signer IP', c.signed_ip],
      ['Fingerprint (SHA-256)', c.doc_sha256],
    ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`).join('');

    const audit = trail.map(t =>
      `<tr><th>${esc(t.event)}</th><td>${utc(t.created_at)}${t.ip ? ` · ${esc(t.ip)}` : ''}</td></tr>`).join('');

    const logo = c.vendors?.logo_path
      ? `<img src="${req.protocol}://${req.get('host')}/api/me/logo/${esc(c.vendors.logo_path)}" alt="">` : '';

    sendDoc(res, `certificate-${c.leads?.name || c.id}.html`, 'Certificate of Completion', `
      <div class="hd">${logo}<p class="biz">${esc(c.vendors?.business_name || '')}</p>
        <h1>Certificate of Completion</h1>
        <p class="meta">Reference ${esc(String(req.params.token).slice(0, 16).toUpperCase())}</p></div>
      <table>${rows}</table>
      ${c.signature_data ? `<div class="sig"><img src="${esc(c.signature_data)}" alt="Signature"><p class="meta"><b>${esc(c.signed_name || '')}</b></p></div>` : ''}
      <h2 style="font-size:16px;margin-top:30px">Audit trail</h2>
      <table>${audit || '<tr><td>No events recorded</td></tr>'}</table>
      <p class="fine">All times shown in UTC. Downloaded ${new Date().toUTCString()}.
      Keep this copy for your own records.</p>
    `);
  } catch (e) { res.status(500).send(e.message); }
});

// PUBLIC: GET /api/contracts/certificate/:token → signing certificate (signed only)
router.get('/certificate/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      select: {
        id: true, title: true, status: true, signed_name: true, signed_ip: true,
        signed_at: true, viewed_at: true, created_at: true, doc_sha256: true,
        signature_data: true, initials: true,
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (c.status !== 'signed') return res.status(400).json({ error: 'Certificate available after signing' });
    const trail = await prisma.contract_audit.findMany({
      where: { contract_id: c.id },
      select: { event: true, ip: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    const { leads, vendors, ...rest } = c;
    res.json({
      certificate: {
        ...rest,
        client_name: leads?.name ?? null, client_email: leads?.email ?? null,
        event_type: leads?.event_type ?? null, event_date: leads?.event_date ?? null,
        business_name: vendors?.business_name ?? null,
        logo_path: vendors?.logo_path ?? null,
      },
      audit: trail,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * PUT /api/contracts/:id/release → the vendor has read it and it may go out.
 *
 * Separate from previewing on purpose: opening a document is not the same as
 * approving it, and a step that completes by accident is not a review. Releasing
 * is recorded rather than toggled, so "when was this approved" has an answer.
 */
router.put('/:id/release', requireAuth, async (req, res) => {
  const v = req.user.vendor_id;
  const id = Number(req.params.id);
  try {
    const ct = await prisma.contracts.findUnique({
      where: { id }, select: { vendor_id: true, released_at: true, voided_at: true },
    });
    if (!ct) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && ct.vendor_id !== v) {
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy
    }
    if (ct.voided_at) return res.status(409).json({ error: 'This contract was voided' });
    // releasing twice is not an error — it just keeps the first approval time
    const updated = ct.released_at
      ? await prisma.contracts.findUnique({ where: { id } })
      : await prisma.contracts.update({ where: { id }, data: { released_at: new Date() } });
    res.json({ contract: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
