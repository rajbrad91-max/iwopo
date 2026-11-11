import prisma from '../config/prisma.js';

/**
 * 🌍 What a plan costs in a country (Raj, 2026-11-10/11): each country belongs to at most one territory (price_regions)
 * with a fixed price per plan (plan_region_prices) — CA$25, £15, ₹699, or the regional US$12 for lower-income
 * countries. The US and every country in no territory pay the plan's own USD price (plans). This is the one place that
 * answers it: the pricing table, the vendor's Plans & Upgrades page and Stripe checkout all ask here, so what a vendor
 * is shown is what they are charged. Super Admin edits nothing here; it reads the same tables (lib/planEconomics.js).
 */
const TTL = 60_000;
let byCountry = null, loadedAt = 0;

/** country code → its territory, with that territory's prices (read once a minute) */
async function territories() {
  if (byCountry && Date.now() - loadedAt < TTL) return byCountry;
  const rows = await prisma.price_regions.findMany({ include: { plan_region_prices: true } });
  const map = new Map();
  for (const r of rows) for (const c of r.countries || []) map.set(String(c).toUpperCase(), r);
  byCountry = map; loadedAt = Date.now();
  return map;
}

/** "CA", "ca", "CA-BC" (a vendor's country and province) → "CA"; anything else → null */
export function countryCode(value) {
  const m = /^([A-Za-z]{2})(?:[-_ ].*)?$/.exec(String(value || '').trim());
  return m ? m[1].toUpperCase() : null;
}

/**
 * Every plan's fixed price in a country, as a Map of plan id → { currency, monthly, annual, region } — empty when the
 * country pays the plans' own USD prices.
 */
export async function fixedPricesFor(country) {
  const code = countryCode(country);
  const r = code ? (await territories()).get(code) : null;
  return new Map((r?.plan_region_prices || []).map(p => [p.plan_id, { currency: r.currency, monthly: Number(p.monthly), annual: Number(p.annual), region: r.code }]));
}

/** One plan's fixed price in a country, or null for the plan's own USD price. */
export async function fixedPrice(planId, country) {
  return (await fixedPricesFor(country)).get(Number(planId)) || null;
}

/** The country a vendor's account says they are in (Settings → Account), or null. */
export async function vendorCountry(vendorId) {
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { country: true } });
  return countryCode(v?.country);
}
