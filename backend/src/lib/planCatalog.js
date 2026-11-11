import prisma from '../config/prisma.js';
import { usdRate, convert } from './localPrice.js';
import { fixedPricesFor } from './regionalPrice.js';
import { connectReady } from './stripeConnect.js';
import { priceFor } from './addons.js';

/**
 * 📋 Every plan card, in ONE place (Raj, 2026-11-06). The home page, the panel's Plans page, Super Admin and the
 * vendor's own plan list all read planCards(), and each card's lines are generated from what the plan really
 * UNLOCKS (plan_features) plus its storage, its Wopo Assistant chats and its highlights — so a card can no longer
 * promise something the plan does not give (Muse F-08, F-03). A feature whose service is not live yet, and a
 * highlight marked "coming", are shown as coming soon rather than sold.
 */
/** 🏷️ What each feature is called — ONE wording for the pricing table, the plan cards and the vendor's Plans page (Raj, 2026-11-07) */
export const FEATURE_LABEL = {
  leads: 'Smart inquiry form, leads & packages',
  contracts: 'Contracts, e-signatures & invoices',
  card_payments: 'Card payments, straight to your Stripe',
  calendar: 'Booking Calendar',
  website: 'Portfolio website builder',
  chatbot: 'Wopo AI Assistant',
  galleries: 'Client galleries with AI face recognition',
  fileflyer: 'File Flyer — effortless large-file delivery',
  crew: 'Crew scheduling & day-of team',
  custom_domain: 'Your own custom domain',
};
const LINES = [
  ['leads', '📋', () => FEATURE_LABEL.leads],
  ['contracts', '📄', () => FEATURE_LABEL.contracts],
  ['calendar', '📅', () => FEATURE_LABEL.calendar],
  ['website', '🌐', () => FEATURE_LABEL.website],
  ['chatbot', '🤖', (p) => `${FEATURE_LABEL.chatbot} · ${p.chat_limit.toLocaleString('en-US')} chats a month`],
  ['galleries', '📸', () => FEATURE_LABEL.galleries],
  ['fileflyer', '📦', () => FEATURE_LABEL.fileflyer],
  ['crew', '👷', () => FEATURE_LABEL.crew],
  ['custom_domain', '🔗', () => FEATURE_LABEL.custom_domain],
];
// 💳 client card payments go straight to the vendor's own Stripe (Stripe Connect) — every paid plan; shown as coming
//    only while Connect is not set up for this site (lib/stripeConnect.js connectReady)
const CARD_PAYMENTS = { key: 'card_payments', icon: '💳', name: FEATURE_LABEL.card_payments };

const storageLabel = (gb) => (gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : `${gb} GB`);

/** A plan's lines: storage, then what it unlocks in a fixed order, then its highlights. */
function planLines(p, liveKeys, connect) {
  const has = new Set((p.plan_features || []).map(f => f.feature_key));
  const lines = [{ key: 'storage', icon: '💾', name: `${storageLabel(p.storage_gb || 0)} storage` }];
  for (const [key, icon, label] of LINES) {
    if (!has.has(key)) continue;
    lines.push({ key, icon, name: label(p), coming: !liveKeys.has(key) });
    if (key === 'contracts' && Number(p.price_monthly) > 0) lines.push({ ...CARD_PAYMENTS, coming: !connect });
  }
  for (const [i, h] of (Array.isArray(p.highlights) ? p.highlights : []).entries()) {
    if (h?.label) lines.push({ key: `highlight-${i}`, icon: '✨', name: String(h.label), coming: !!h.coming });
  }
  return lines;
}

/** A plan's price where the visitor or vendor is — fixed in their currency, or the regional US-dollar price — or null
 *  for the plan's own USD price (lib/regionalPrice.js) */
const localPrice = (f, monthly) => (f && monthly > 0
  ? { currency: f.currency, monthly: f.monthly, annual: f.annual, region: f.region, regional: f.region === 'USD-R' } : null);

/** All plans, in their order, as cards: prices, storage, chats, trial days, unlock keys and lines. `country` picks the
 *  fixed local prices (none: the plans' own USD prices, as Super Admin sees them). */
export async function planCards({ country } = {}) {
  const [plans, live] = await Promise.all([
    prisma.plans.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, tagline: true, icon: true, price_monthly: true, price_annual: true,
        storage_gb: true, chat_limit: true, trial_days: true, highlights: true, sort_order: true, plan_features: { select: { feature_key: true } } },
    }),
    prisma.services.findMany({ where: { feature_key: { not: null }, is_private: false, is_live: true }, select: { feature_key: true } }),
  ]);
  const liveKeys = new Set(live.map(s => s.feature_key));
  const fixed = await fixedPricesFor(country);   // 🌍 the fixed prices where they are (lib/regionalPrice.js)
  const connect = await connectReady();   // 💳 card payments are sold once Stripe Connect is set up
  return plans.map(p => {
    const monthly = Number(p.price_monthly);
    const lines = planLines(p, liveKeys, connect);
    return {
      id: p.id, key: p.code, code: p.code, name: p.name, tagline: p.tagline, icon: p.icon, sort_order: p.sort_order,
      price_monthly: monthly, price_annual: Number(p.price_annual ?? 0), storage_gb: p.storage_gb, chat_limit: p.chat_limit,
      trial_days: p.trial_days,                 // 🧪 Essential and Pro 30, Studio none
      local: localPrice(fixed.get(p.id), monthly),
      features: p.plan_features.map(f => f.feature_key).filter(k => liveKeys.has(k) || k === 'custom_domain'),
      lines,
      // the shape the home page and Super Admin already render: a line is an "included" item; coming ones say so
      included: lines.map(l => ({ id: l.key, icon: l.icon, name: l.name, detail: l.coming ? 'coming soon' : '' })),
      addons: [], standalone: [],
    };
  });
}

/**
 * 📊 The pricing table (Raj, 2026-11-07): every plan side by side, row by row, built from the same plans as the cards
 * so the two can never disagree. A cell is true (included), false (not included), or text (a value, or the price of
 * the add-on that brings it to that plan); `coming` marks what is not sold yet.
 */
// in the order a vendor shops: the tools they need daily, then delivering work, then capacity; perks last (Raj, 2026-11-07)
const GROUPS = [
  ['Run your bookings', [['leads', FEATURE_LABEL.leads], ['contracts', FEATURE_LABEL.contracts], ['card_payments', FEATURE_LABEL.card_payments], ['calendar', FEATURE_LABEL.calendar], ['website', FEATURE_LABEL.website]]],
  ['Deliver your work', [['galleries', FEATURE_LABEL.galleries], ['fileflyer', FEATURE_LABEL.fileflyer], ['crew', FEATURE_LABEL.crew]]],
  ['Storage & AI', [['storage', 'Pooled storage — photos, videos & large files'], ['capacity', 'Roughly what fits', 1], ['extra_storage', 'Add extra storage anytime'], ['chatbot', `${FEATURE_LABEL.chatbot} chats a month`]]],
];
export async function planCompare({ country } = {}) {
  const cards = await planCards({ country });
  // add-ons are shown in the currency the plans are shown in; their fixed prices are not decided yet, so today's rate
  const currency = cards.find(c => c.local)?.local.currency || 'USD';
  const rate = await usdRate(currency);
  const money = (usd) => {   // whole amounts without cents ($5), others with both digits ($7.50)
    const v = rate ? convert(usd, rate) : Number(usd);
    const cents = Number.isInteger(v) ? 0 : 2;
    return new Intl.NumberFormat('en', { style: 'currency', currency: rate ? String(currency).toUpperCase() : 'USD', minimumFractionDigits: cents, maximumFractionDigits: cents }).format(v);
  };
  const addons = await prisma.services.findMany({ where: { is_addon: true, price: { gt: 0 }, is_private: false }, select: { name: true, feature_key: true, storage_gb: true, price: true, plan_prices: true, plan_codes: true, is_live: true } });
  const storageFrom = Math.min(...addons.filter(a => a.storage_gb > 0).map(a => Number(a.price)));
  const addonFor = (key, code) => addons.find(a => a.feature_key === key && (!(a.plan_codes || []).length || a.plan_codes.includes(code)));
  const has = (c, key) => c.lines.some(l => l.key === key);
  // 📸 what a plan's storage roughly holds: a ~9 MB high-resolution photo plus its full-screen and thumbnail copies
  //    (~1 MB, WebP) is ~10 MB counted; 4K video at ~15 GB an hour (Raj, 2026-11-07: storage counts everything)
  const roughly = (n) => (n >= 1000 ? (Math.round(n / 500) * 500).toLocaleString('en-US') : String(Math.round(n / 10) * 10));
  const fits = (gb) => {
    const photos = `≈ ${roughly(gb * 1000 / 10)} photos`;
    const hours = Math.round(gb / 15);
    return hours >= 1 ? `${photos} · ${hours} hrs of 4K video` : photos;
  };
  const cell = (c, key) => {
    if (key === 'storage') return c.lines.find(l => l.key === 'storage').name.replace(/ storage$/, '');
    if (key === 'capacity') return fits(Number(c.storage_gb) || 0);
    if (key === 'chatbot') return has(c, 'chatbot') ? c.chat_limit.toLocaleString('en-US') : false;
    if (key === 'extra_storage') return c.price_monthly > 0 && Number.isFinite(storageFrom) ? `Add-on · from ${money(storageFrom)}/mo` : false;
    if (has(c, key)) return true;
    const a = c.price_monthly > 0 && addonFor(key, c.code);
    return a ? `Add-on · ${money(priceFor(a, c.code, 'monthly'))}/mo` : false;
  };
  const coming = (key) => cards.some(c => c.lines.some(l => l.key === key && l.coming));
  const groups = GROUPS.map(([title, rows]) => ({ title, rows: rows.map(([key, label, star]) => ({ key, label, star, coming: coming(key), cells: Object.fromEntries(cards.map(c => [c.code, cell(c, key)])) })) }));
  // the extras: your own domain (an add-on below Studio), then each plan's highlights by their wording
  const addonRow = (key, label) => ({ key, label, coming: coming(key) || addons.some(a => a.feature_key === key && !a.is_live), cells: Object.fromEntries(cards.map(c => [c.code, cell(c, key)])) });
  const extras = [addonRow('custom_domain', FEATURE_LABEL.custom_domain), addonRow('social_ai', 'Instagram & WhatsApp AI')];
  // a highlight that names an add-on (Studio's "Instagram & WhatsApp AI at half price") is that add-on's row, priced per plan
  const rowAddons = addons.filter(a => ['custom_domain', 'social_ai'].includes(a.feature_key)).map(a => a.name.toLowerCase());
  const seen = new Map();
  for (const c of cards) for (const l of c.lines) if (l.key.startsWith('highlight-') && !/powered by iwopo/i.test(l.name) && !rowAddons.some(n => l.name.toLowerCase().includes(n)) && !seen.has(l.name)) seen.set(l.name, l.coming);
  for (const [label, soon] of seen) extras.push({ key: `extra-${extras.length}`, label, coming: soon, cells: Object.fromEntries(cards.map(c => [c.code, c.lines.some(l => l.name === label)])) });
  groups.push({ title: 'Extras', rows: extras });
  // the small print a starred row points to — estimates, never promises, so the table stays honest
  const notes = ['* Rough estimates, not a promise — what fits depends on your own file sizes. Based on high-resolution photos of about 9 MB, plus about 1 MB for the full-screen and thumbnail copies iwopo makes so clients can view them, and 4K video at about 15 GB an hour. Storage is one pool shared by photos, videos and files.'];
  return { plans: cards, groups, notes };
}
