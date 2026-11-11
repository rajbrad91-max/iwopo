import prisma from '../config/prisma.js';
import { usdRate } from './localPrice.js';

/**
 * 💰 What iwopo keeps from one subscriber, by territory and plan (Raj, 2026-11-10/11). Every cost is taken at 95%
 * usage — storage 95% full and 95% of the included Wopo chats — at normal Cloudflare R2 prices, so the margins shown
 * are the floor, not the average. Prices: the plans table (USD, the main pricing table) and plan_region_prices (the
 * fixed price in each other territory). Exchange rates: lib/localPrice.js, refreshed daily. Shown in Super Admin →
 * Services & Packages (components/RegionPricesTable.jsx). Fixed costs (servers, Workspace) are shared by everyone and
 * not in these per-subscriber figures.
 */
export const COSTS = {
  usage: 0.95,                       // Raj's rule: price as if every vendor uses 95% of their plan
  r2PerGbMonth: 0.015,               // Cloudflare R2 Standard storage
  opsBase: 0.10, opsPerGb: 0.0007,   // R2 operations — uploads, thumbnails, gallery views (estimate)
  aiPerReply: 0.0005,                // Wopo Assistant on Claude Haiku 5.5, ~3,800 tokens in + 80 out a reply (measured)
  repliesPerChat: 5,
  stripe: { pct: 0.029, fixed: 0.30, international: 0.015, conversion: 0.01, billing: 0.007, tax: 0.005 },
};

/** a plan's running cost a month, in USD: its storage and its Wopo chats, at COSTS.usage */
function runningCost(plan) {
  const gb = Number(plan.storage_gb || 0) * COSTS.usage;
  const storage = gb * COSTS.r2PerGbMonth + COSTS.opsBase + COSTS.opsPerGb * Number(plan.storage_gb || 0);
  const ai = Number(plan.chat_limit || 0) * COSTS.usage * COSTS.repliesPerChat * COSTS.aiPerReply;
  return { storage, ai };
}

/** Stripe's fees on one charge of `usd`: a US card (domestic) or a card from abroad charged in another currency */
function stripeFee(usd, domestic) {
  const s = COSTS.stripe;
  const pct = s.pct + s.billing + s.tax + (domestic ? 0 : s.international + s.conversion);
  return usd * pct + s.fixed;
}

/** profit and margin a month, on monthly billing and on yearly billing (one charge a year, spread over 12 months) */
function economics(monthlyUsd, annualUsd, plan, domestic) {
  const { storage, ai } = runningCost(plan);
  const month = monthlyUsd - stripeFee(monthlyUsd, domestic) - storage - ai;
  const yearRev = annualUsd / 12;
  const year = yearRev - stripeFee(annualUsd, domestic) / 12 - storage - ai;
  return {
    monthly: { profit: month, margin: monthlyUsd ? month / monthlyUsd : 0 },
    annual: { profit: year, margin: yearRev ? year / yearRev : 0 },
  };
}

/** 🧩 Each add-on's price in a territory: its fixed price there (addon_region_prices), or — the US-dollar territory — its
 *  own price; and Studio's own where it has one (Instagram & WhatsApp AI). */
function addonRows(r, addons, rate) {
  const own = new Map((r.addon_region_prices || []).map(a => [`${a.service_id}|${a.plan_code}`, a]));
  return addons.map(a => {
    const base = r.code === 'USD' ? { monthly: a.price, annual: a.price_annual ?? Number(a.price) * 10 } : own.get(`${a.id}|`);
    const studio = r.code === 'USD' ? (a.plan_prices?.studio != null ? { monthly: a.plan_prices.studio } : null) : own.get(`${a.id}|studio`);
    if (!base) return { id: a.id, monthly: null };
    const monthly = Number(base.monthly);
    return { id: a.id, monthly, annual: Number(base.annual), usd_monthly: rate ? monthly / rate : null, studio_monthly: studio ? Number(studio.monthly) : null };
  });
}

/** Every territory with its countries, each paid plan's fixed price there, its USD value today and what iwopo keeps. */
export async function regionEconomics() {
  const [plans, regions, addons] = await Promise.all([
    prisma.plans.findMany({
      where: { price_monthly: { gt: 0 } }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, price_monthly: true, price_annual: true, storage_gb: true, chat_limit: true },
    }),
    prisma.price_regions.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }], include: { plan_region_prices: true, addon_region_prices: true } }),
    prisma.services.findMany({
      where: { is_addon: true, price: { gt: 0 }, is_private: false }, orderBy: [{ storage_gb: 'asc' }, { price: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, price: true, price_annual: true, plan_prices: true },
    }),
  ]);
  const out = [];
  for (const r of regions) {
    const rate = r.currency === 'USD' ? 1 : await usdRate(r.currency);   // units of the currency per US dollar, today
    const own = new Map(r.plan_region_prices.map(x => [x.plan_id, x]));
    const domestic = r.code === 'USD';   // the US row: a US card; every other territory pays the international fees
    out.push({
      code: r.code, name: r.name, currency: r.currency, symbol: r.symbol, countries: r.countries, rate,
      addons: addonRows(r, addons, rate),   // 🧩 each add-on's price there
      plans: plans.map(p => {
        // the USD territory IS the main pricing table; the others have their own fixed prices
        const price = r.code === 'USD' ? { monthly: p.price_monthly, annual: p.price_annual } : own.get(p.id);
        if (!price) return { code: p.code, name: p.name, monthly: null, annual: null, usd_monthly: null, keep: null };
        const monthly = Number(price.monthly), annual = Number(price.annual);
        return {
          code: p.code, name: p.name, monthly, annual,
          usd_monthly: rate ? monthly / rate : null,
          keep: rate ? economics(monthly / rate, annual / rate, p, domestic) : null,   // null when today's rate is unknown
        };
      }),
    });
  }
  return { costs: COSTS, regions: out, addons: addons.map(a => ({ id: a.id, name: a.name })) };
}
