import prisma from '../config/prisma.js';
import { usdRate, convert } from './localPrice.js';

/**
 * 📋 Every plan card, in ONE place (Raj, 2026-11-06). The home page, the panel's Plans page, Super Admin and the
 * vendor's own plan list all read planCards(), and each card's lines are generated from what the plan really
 * UNLOCKS (plan_features) plus its storage, its Wopo Assistant chats and its highlights — so a card can no longer
 * promise something the plan does not give (Muse F-08, F-03). A feature whose service is not live yet, and a
 * highlight marked "coming", are shown as coming soon rather than sold.
 */
const LINES = [
  ['leads', '📋', () => 'Inquiry form, leads & packages'],
  ['contracts', '📄', () => 'Contracts, e-signing, invoices & payment tracking'],
  ['calendar', '📅', () => 'Calendar'],
  ['website', '🌐', () => 'Website builder'],
  ['chatbot', '🤖', (p) => `Wopo Assistant · ${p.chat_limit.toLocaleString('en-US')} chats a month`],
  ['galleries', '📸', () => 'Client Galleries with face recognition'],
  ['fileflyer', '📦', () => 'File Flyer — branded large-file sending'],
  ['crew', '👷', () => 'Crew & team on the day'],
  ['custom_domain', '🔗', () => 'Your own domain'],
];
// 💳 client card payments go straight to the vendor's own Stripe (Stripe Connect) — every paid plan, coming until built
const CARD_PAYMENTS = { key: 'card_payments', icon: '💳', name: 'Stripe card payments, straight to your account', coming: true };

const storageLabel = (gb) => (gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : `${gb} GB`);

/** A plan's lines: storage, then what it unlocks in a fixed order, then its highlights. */
function planLines(p, liveKeys) {
  const has = new Set((p.plan_features || []).map(f => f.feature_key));
  const lines = [{ key: 'storage', icon: '💾', name: `${storageLabel(p.storage_gb || 0)} storage` }];
  for (const [key, icon, label] of LINES) {
    if (!has.has(key)) continue;
    lines.push({ key, icon, name: label(p), coming: !liveKeys.has(key) });
    if (key === 'contracts' && Number(p.price_monthly) > 0) lines.push(CARD_PAYMENTS);
  }
  for (const [i, h] of (Array.isArray(p.highlights) ? p.highlights : []).entries()) {
    if (h?.label) lines.push({ key: `highlight-${i}`, icon: '✨', name: String(h.label), coming: !!h.coming });
  }
  return lines;
}

/** All plans, in their order, as cards: prices, storage, chats, trial days, unlock keys and lines. */
export async function planCards({ currency } = {}) {
  const [plans, live] = await Promise.all([
    prisma.plans.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, tagline: true, icon: true, price_monthly: true, price_annual: true,
        storage_gb: true, chat_limit: true, trial_days: true, highlights: true, sort_order: true, plan_features: { select: { feature_key: true } } },
    }),
    prisma.services.findMany({ where: { feature_key: { not: null }, is_private: false, is_live: true }, select: { feature_key: true } }),
  ]);
  const liveKeys = new Set(live.map(s => s.feature_key));
  const rate = await usdRate(currency);   // 🌍 the visitor's currency, as an estimate (lib/localPrice.js)
  return plans.map(p => {
    const monthly = Number(p.price_monthly);
    const lines = planLines(p, liveKeys);
    return {
      id: p.id, key: p.code, code: p.code, name: p.name, tagline: p.tagline, icon: p.icon, sort_order: p.sort_order,
      price_monthly: monthly, price_annual: Number(p.price_annual ?? 0), storage_gb: p.storage_gb, chat_limit: p.chat_limit,
      trial_days: p.trial_days,                 // 🧪 Essential and Pro 30, Studio none
      local: rate && monthly > 0 ? { currency: String(currency).toUpperCase(), monthly: convert(monthly, rate), annual: convert(Number(p.price_annual ?? 0), rate) } : null,
      features: p.plan_features.map(f => f.feature_key).filter(k => liveKeys.has(k) || k === 'custom_domain'),
      lines,
      // the shape the home page and Super Admin already render: a line is an "included" item; coming ones say so
      included: lines.map(l => ({ id: l.key, icon: l.icon, name: l.name, detail: l.coming ? 'coming soon' : '' })),
      addons: [], standalone: [],
    };
  });
}
