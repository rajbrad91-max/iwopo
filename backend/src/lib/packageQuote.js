/**
 * 📦 One price for a package (Raj, 2026-11-13).
 *
 * The lead page, the client's link, payments, invoices, the contract and the
 * assistant all ask this one function, so a client is never shown one figure
 * and charged another.
 *
 *   base         the price, or price × guests when the package is priced per guest
 *   extra hours  (hours asked for − hours included) × the extra-hour price, when
 *                the package says to add them automatically
 *   extras       every extra the vendor added to the price, and every optional
 *                one the client chose
 *
 * ⚠️ frontend/src/lib/packageQuote.js is this same function, used for the live
 * total while a client ticks extras. Change both together. The server always
 * re-prices from the lead's own copy when the choice is saved.
 */

export const EXTRA_UNITS = ['once', 'per_item', 'per_hour', 'per_guest'];
export const EXTRA_MODES = ['optional', 'added', 'included', 'off'];
export const EXTRA_STATES = ['offered', 'included', 'hidden'];
export const PRICE_MODES = ['fixed', 'per_guest'];
export const MAX_EXTRAS = 20;
const MAX_QTY = 99;

const num = (v) => { const n = Number(v?.toString?.() ?? v); return Number.isFinite(n) ? n : 0; };
const whole = (v) => Math.max(0, Math.round(num(v)));
const money2 = (n) => Math.round(n * 100) / 100;

/** How many of an extra are charged: a guest count, the client's quantity, or one. */
export function extraQty(x, lead) {
  if (x?.unit === 'per_guest') return whole(lead?.guests);
  if (x?.unit === 'per_item' || x?.unit === 'per_hour') {
    const max = Math.min(whole(x.max_qty) || MAX_QTY, MAX_QTY);
    return Math.min(Math.max(whole(x.qty) || 1, 1), max);
  }
  return 1;
}

/** The price of one package for one lead, line by line. */
export function quotePackage(pkg, lead) {
  const price = num(pkg?.price);
  const perGuest = pkg?.price_mode === 'per_guest';
  const guests = perGuest ? Math.max(whole(lead?.guests), whole(pkg?.min_guests)) : 0;
  const base = perGuest ? price * guests : price;
  const included = whole(pkg?.included_hours);
  const rate = num(pkg?.per_hour_price);
  const asked = whole(lead?.hours);
  const extraHours = pkg?.auto_extra_hours !== false && included > 0 && rate > 0 && asked > included ? asked - included : 0;
  const lines = (Array.isArray(pkg?.extras) ? pkg.extras : [])
    .filter(x => x && (x.mode === 'added' || (x.mode === 'optional' && x.chosen)))
    .map(x => {
      const qty = extraQty(x, lead);
      return { id: x.id, name: x.name, unit: x.unit, mode: x.mode, price: num(x.price), qty, amount: money2(num(x.price) * qty) };
    });
  const extrasTotal = lines.reduce((s, l) => s + l.amount, 0);
  return {
    price, price_mode: perGuest ? 'per_guest' : 'fixed', guests, base: money2(base),
    included_hours: included, hours_asked: asked, extra_hour_price: rate,
    extra_hours: extraHours, extra_hours_amount: money2(extraHours * rate),
    extras: lines, extras_total: money2(extrasTotal),
    total: money2(base + extraHours * rate + extrasTotal),
  };
}

/** Names of the extras that are part of this booking — added, chosen or already included — for the contract's checks. */
export function extraNamesInBooking(pkg) {
  return (Array.isArray(pkg?.extras) ? pkg.extras : [])
    .filter(x => x && (x.mode === 'added' || x.mode === 'included' || (x.mode === 'optional' && x.chosen)))
    .map(x => String(x.name || '').trim()).filter(Boolean);
}

/* ───────── cleaning what a vendor or a client sends ───────── */

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const newExtraId = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One extra as a vendor defines it — name, line, price, how it's charged, the most a client can take. */
function cleanDef(x) {
  const name = text(x?.name, 80);
  if (!name) return null;
  const unit = EXTRA_UNITS.includes(x?.unit) ? x.unit : 'once';
  const price = Math.min(Math.max(num(x?.price), 0), 10_000_000);
  const max = (unit === 'per_item' || unit === 'per_hour') ? Math.min(Math.max(whole(x?.max_qty) || 10, 1), MAX_QTY) : null;
  return { id: ID_RE.test(String(x?.id || '')) ? String(x.id) : newExtraId(), name, description: text(x?.description, 160), price: money2(price), unit, max_qty: max };
}

/** A folder's list of extras. */
export function cleanFolderExtras(list) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const d = cleanDef(x);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id); out.push(d);
    if (out.length >= MAX_EXTRAS) break;
  }
  return out;
}

/** Which folder extras a package offers: only known ids, only known states. */
export function cleanExtrasState(obj, knownIds) {
  const out = {};
  const ids = knownIds ? new Set(knownIds) : null;
  for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
    if (!ID_RE.test(k) || (ids && !ids.has(k)) || !EXTRA_STATES.includes(v)) continue;
    out[k] = v;
  }
  return out;
}

/** The extras on a lead's copy of a package, as the vendor edits them for that client. */
export function cleanLeadExtras(list) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const d = cleanDef(x);
    if (!d || seen.has(d.id)) continue;
    const mode = EXTRA_MODES.includes(x?.mode) ? x.mode : 'optional';
    seen.add(d.id);
    out.push({
      ...d, mode,
      chosen: mode === 'optional' ? !!x?.chosen : false,
      qty: d.max_qty ? Math.min(Math.max(whole(x?.qty) || 1, 1), d.max_qty) : 1,
      source: ['folder', 'custom', 'pre_event'].includes(x?.source) ? x.source : 'custom',
    });
    if (out.length >= MAX_EXTRAS) break;
  }
  return out;
}

/** A folder's extras as one package should carry them onto a lead. */
export function extrasForLead(folderExtras, state) {
  const st = state && typeof state === 'object' ? state : {};
  return cleanFolderExtras(folderExtras)
    .filter(x => (st[x.id] || 'offered') !== 'hidden')
    .map(x => ({ ...x, mode: st[x.id] === 'included' ? 'included' : 'optional', chosen: false, qty: 1, source: 'folder' }));
}

/** Package fields a vendor may set, cleaned. Only the keys that were sent come back. */
export function cleanPricing(body) {
  const out = {};
  if (body?.price_mode !== undefined) out.price_mode = PRICE_MODES.includes(body.price_mode) ? body.price_mode : 'fixed';
  if (body?.min_guests !== undefined) out.min_guests = body.min_guests === null || body.min_guests === '' ? null : Math.min(whole(body.min_guests), 100000);
  if (body?.auto_extra_hours !== undefined) out.auto_extra_hours = !!body.auto_extra_hours;
  if (body?.description !== undefined) out.description = text(body.description, 300) || null;
  if (body?.badge !== undefined) out.badge = body.badge === null || body.badge === '' ? null : text(body.badge, 40) || null;
  return out;
}

/* ───────── tax wording (Raj, 2026-11-13) ─────────
   The price is always what the client pays. A folder says how that price speaks about tax:
     included  "Includes 5% tax (CA$171)" — the part of the price that is tax, worked out from the %
     excluded  "Plus tax" — the vendor adds their tax themselves; no % needed
     none      nothing said */
export const TAX_MODES = ['none', 'included', 'excluded'];

/** The tax fields a vendor sent for a folder, cleaned. Only the keys that were sent come back. */
export function cleanTax(body) {
  const out = {};
  if (body?.tax_mode !== undefined) out.tax_mode = TAX_MODES.includes(body.tax_mode) ? body.tax_mode : 'none';
  if (body?.tax_rate !== undefined) {
    const r = Number(body.tax_rate);
    out.tax_rate = body.tax_rate === null || body.tax_rate === '' || !Number.isFinite(r) ? null : Math.min(Math.max(money2(r), 0), 100);
  }
  if (out.tax_mode && out.tax_mode !== 'included') out.tax_rate = null;   // a % only means something when tax is included
  return out;
}

/** How a total speaks about tax: { mode, rate, amount, text } — text is '' when nothing is said. */
export function taxOf(mode, rate, total, cash = (n) => String(n)) {
  const r = num(rate);
  if (mode === 'included' && r > 0) {
    const amount = money2(num(total) * r / (100 + r));
    return { mode, rate: r, amount, text: `Includes ${r}% tax (${cash(amount)})` };
  }
  if (mode === 'excluded') return { mode, rate: null, amount: 0, text: 'Plus tax' };
  return { mode: 'none', rate: null, amount: 0, text: '' };
}

/** What a client's link shows of one extra (never the vendor-only switches). */
export function publicExtra(x, lead) {
  return {
    id: x.id, name: x.name, description: x.description || '', price: num(x.price), unit: x.unit,
    max_qty: x.max_qty || null, mode: x.mode, chosen: !!x.chosen, qty: extraQty(x, lead),
  };
}
