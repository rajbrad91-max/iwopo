/**
 * 📦 One price for a package — the same function as backend/src/lib/packageQuote.js.
 *
 * Used for the live total while a client ticks extras, and for the price shown
 * while a vendor edits. The server re-prices from the lead's own copy whenever
 * a choice is saved, so this can only ever preview. ⚠️ Change both together.
 */

export const EXTRA_UNITS = [
  ['once', 'One price'],
  ['per_item', 'Per item'],
  ['per_hour', 'Per hour'],
  ['per_guest', 'Per guest'],
];
export const EXTRA_MODES = [
  ['optional', 'Client can add'],
  ['added', 'Added to the price'],
  ['included', 'Included'],
  ['off', 'Not offered'],
];
export const EXTRA_STATES = [
  ['offered', 'Offered'],
  ['included', 'Included'],
  ['hidden', 'Hidden'],
];
const MAX_QTY = 99;

const num = (v) => { const n = Number(v?.toString?.() ?? v); return Number.isFinite(n) ? n : 0; };
const whole = (v) => Math.max(0, Math.round(num(v)));
const money2 = (n) => Math.round(n * 100) / 100;

export function extraQty(x, lead) {
  if (x?.unit === 'per_guest') return whole(lead?.guests);
  if (x?.unit === 'per_item' || x?.unit === 'per_hour') {
    const max = Math.min(whole(x.max_qty) || MAX_QTY, MAX_QTY);
    return Math.min(Math.max(whole(x.qty) || 1, 1), max);
  }
  return 1;
}

export function quotePackage(pkg, lead) {
  const price = num(pkg?.price);
  const perGuest = pkg?.price_mode === 'per_guest';
  const guests = perGuest ? Math.max(whole(lead?.guests), whole(pkg?.min_guests)) : 0;
  const base = perGuest ? price * guests : price;
  const lines = (Array.isArray(pkg?.extras) ? pkg.extras : [])
    .filter(x => x && (x.mode === 'added' || (x.mode === 'optional' && x.chosen)))
    .map(x => {
      const qty = extraQty(x, lead);
      return { id: x.id, name: x.name, unit: x.unit, mode: x.mode, price: num(x.price), qty, amount: money2(num(x.price) * qty) };
    });
  const extrasTotal = lines.reduce((s, l) => s + l.amount, 0);
  return {
    price, price_mode: perGuest ? 'per_guest' : 'fixed', guests, base: money2(base),
    extras: lines, extras_total: money2(extrasTotal),
    total: money2(base + extrasTotal),
  };
}

/** "CA$125 per hour" / "CA$12 per guest" / "CA$300" — how an extra's price reads. */
export function unitText(unit, priceText) {
  if (unit === 'per_hour') return `${priceText} per hour`;
  if (unit === 'per_item') return `${priceText} each`;
  if (unit === 'per_guest') return `${priceText} per guest`;
  return priceText;
}

/** 🧾 How a total speaks about tax — the same as backend/src/lib/packageQuote.js taxOf. */
export const TAX_MODES = [
  ['none', 'Don’t mention tax'],
  ['included', 'Tax included'],
  ['excluded', 'Plus tax'],
];
export function taxOf(mode, rate, total, cash = (n) => String(n)) {
  const r = num(rate);
  if (mode === 'included' && r > 0) {
    const amount = money2(num(total) * r / (100 + r));
    return { mode, rate: r, amount, text: `Includes ${r}% tax (${cash(amount)})` };
  }
  if (mode === 'excluded') return { mode, rate: null, amount: 0, text: 'Plus tax' };
  return { mode: 'none', rate: null, amount: 0, text: '' };
}

/** A fresh id for an extra typed in the browser (the server keeps any id that is well formed). */
export const newExtraId = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Hours between two wall-clock times ("17:00" → "22:00" = 5), past midnight included. */
export function hoursBetween(from, to) {
  const m = (t) => { const x = String(t || '').match(/^(\d{1,2}):(\d{2})/); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
  const a = m(from), b = m(to);
  if (a == null || b == null) return 0;
  const d = b > a ? b - a : b + 1440 - a;
  return Math.round(d / 30) / 2;   // to the nearest half hour
}
