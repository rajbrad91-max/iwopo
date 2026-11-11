import geoip from 'geoip-lite';
import prisma from '../config/prisma.js';
import { clientIp } from './clientIp.js';
import { COUNTRY_CURRENCY } from './currencies.js';

/**
 * 🌍 The visitor's country and currency, and today's exchange rates (Raj, 2026-11-06). Plan prices are FIXED per
 * country since 2026-11-11 (lib/regionalPrice.js); these rates now serve the estimates that remain — add-on prices —
 * and Super Admin's profit figures. The country comes from the visitor's IP; the rates are fetched once a day and the
 * last good set is kept, so a rate feed that is down never breaks a page.
 */
const FEED = 'https://open.er-api.com/v6/latest/USD';
const DAY = 86_400_000;
let rates = null, fetchedAt = 0, loading = null;

async function loadRates() {
  if (rates && Date.now() - fetchedAt < DAY) return rates;
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch(FEED, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d?.result !== 'success' || !d.rates?.USD) throw new Error('rate feed answered without rates');
      rates = d.rates; fetchedAt = Date.now();
      await prisma.platform_settings.upsert({ where: { key: 'fx_rates_usd' }, update: { value: JSON.stringify({ at: fetchedAt, rates }) }, create: { key: 'fx_rates_usd', value: JSON.stringify({ at: fetchedAt, rates }) } }).catch(() => {});
    } catch (e) {
      if (!rates) {                                                                 // the last good set, from before a restart
        const saved = await prisma.platform_settings.findUnique({ where: { key: 'fx_rates_usd' } }).catch(() => null);
        if (saved?.value) { const s = JSON.parse(saved.value); rates = s.rates; fetchedAt = s.at; }
      }
      console.warn('[localPrice] rates not refreshed:', e.message);
    } finally { loading = null; }
    return rates;
  })();
  return loading;
}

/** The visitor's country (two letters, from their IP), or null when unknown. */
export function visitorCountry(req) {
  return geoip.lookup(clientIp(req))?.country || null;
}

/** The visitor's currency, from their country — USD when unknown. */
export function visitorCurrency(req) {
  const c = visitorCountry(req);
  return (c && COUNTRY_CURRENCY[c]) || 'USD';
}

/** How many of `currency` one US dollar buys today, or null when unknown (or USD itself). */
export async function usdRate(currency) {
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'USD') return null;
  const r = await loadRates();
  return r?.[c] || null;
}

/** A USD amount in `currency`, rounded the way a price is read — whole units, or cents below 20. */
export function convert(usd, rate) {
  const v = Number(usd) * rate;
  return v >= 20 ? Math.round(v) : Math.round(v * 100) / 100;
}
