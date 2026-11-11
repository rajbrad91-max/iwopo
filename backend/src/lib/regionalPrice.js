import prisma from '../config/prisma.js';

/**
 * 🌍 What a plan or an add-on costs in a country (Raj, 2026-11-10/11): each country belongs to at most one territory
 * (price_regions) with a fixed price per plan (plan_region_prices) and per add-on (addon_region_prices) — CA$25, £15,
 * ₹699, or the regional US$12 for lower-income countries. The US and every country in no territory pay the own USD
 * prices (plans, services). This is the one place that answers it: the pricing table, the vendor's Plans & Upgrades and
 * My Services, and Stripe checkout all ask here, so what a vendor is shown is what they are charged. Super Admin reads
 * the same tables (lib/planEconomics.js).
 */
const TTL = 60_000;
let byCountry = null, byCurrency = null, loadedAt = 0;

/** country code → its territory, and currency → the territory charging in it (USD is not one: two territories use it) */
async function territories() {
  if (byCountry && Date.now() - loadedAt < TTL) return byCountry;
  const rows = await prisma.price_regions.findMany({ include: { plan_region_prices: true, addon_region_prices: true } });
  const map = new Map(), cur = new Map();
  for (const r of rows) {
    for (const c of r.countries || []) map.set(String(c).toUpperCase(), r);
    if (r.currency !== 'USD') cur.set(r.currency, r);
  }
  byCountry = map; byCurrency = cur; loadedAt = Date.now();
  return map;
}

const fixed = (r, row) => ({ currency: r.currency, monthly: Number(row.monthly), annual: Number(row.annual), region: r.code });

/** "CA", "ca", "CA-BC" (a vendor's country and province) → "CA"; anything else → null */
export function countryCode(value) {
  const m = /^([A-Za-z]{2})(?:[-_ ].*)?$/.exec(String(value || '').trim());
  return m ? m[1].toUpperCase() : null;
}

async function territoryOf(country) {
  const code = countryCode(country);
  return code ? (await territories()).get(code) || null : null;
}

/**
 * Every plan's fixed price in a country, as a Map of plan id → { currency, monthly, annual, region } — empty when the
 * country pays the plans' own USD prices.
 */
export async function fixedPricesFor(country) {
  const r = await territoryOf(country);
  return new Map((r?.plan_region_prices || []).map(p => [p.plan_id, fixed(r, p)]));
}

/** One plan's fixed price in a country, or null for the plan's own USD price. */
export async function fixedPrice(planId, country) {
  return (await fixedPricesFor(country)).get(Number(planId)) || null;
}

/**
 * Every add-on's fixed price in a country, as a Map of "serviceId|planCode" → { currency, monthly, annual, region };
 * an empty plan code is the price on every plan, a named one a different price on that plan (Instagram & WhatsApp AI
 * on Studio). Empty when the country pays the add-ons' own USD prices.
 */
export async function addonPricesFor(country) {
  const r = await territoryOf(country);
  return new Map((r?.addon_region_prices || []).map(a => [`${a.service_id}|${a.plan_code}`, fixed(r, a)]));
}

/** An add-on's price on a plan from such a Map, or null for its own USD price. */
export const addonPriceFrom = (map, serviceId, planCode) => map.get(`${serviceId}|${planCode || ''}`) || map.get(`${serviceId}|`) || null;

/**
 * An add-on's fixed price for a Stripe subscription, which can only hold prices in its own currency: the vendor's
 * territory's price when that is the subscription's currency, else the territory that charges in that currency, else
 * null — the add-on's own USD price, for a subscription in US dollars.
 */
export async function addonPriceForSubscription(serviceId, planCode, country, currency) {
  const cur = String(currency || 'USD').toUpperCase();
  await territories();
  const mine = await territoryOf(country);
  const r = mine?.currency === cur ? mine : byCurrency.get(cur) || null;
  if (!r) return null;
  const rows = new Map(r.addon_region_prices.map(a => [`${a.service_id}|${a.plan_code}`, a]));
  const row = rows.get(`${serviceId}|${planCode || ''}`) || rows.get(`${serviceId}|`);
  return row ? fixed(r, row) : null;
}

/** The country a vendor's account says they are in (Settings → Account), or null. */
export async function vendorCountry(vendorId) {
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { country: true } });
  return countryCode(v?.country);
}
