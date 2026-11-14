/**
 * 🌦️ Weather for the dashboard (Raj, 2026-11-14) — Open-Meteo: free, no account, no key.
 *
 * Two calls: a place name → coordinates (geocoding), and coordinates → a daily forecast. Both are cached in memory,
 * because every vendor opening the dashboard would otherwise ask the same questions again: places for a week,
 * forecasts for half an hour. Only a place name and coordinates leave the server — never a client's name.
 */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const PLACE_TTL = 7 * 24 * 3600 * 1000;
const FORECAST_TTL = 30 * 60 * 1000;
const CACHE_MAX = 2000;

const places = new Map();      // "name|CC" → { at, hit }
const forecasts = new Map();   // "lat,lon,unit" → { at, days }

function remember(map, key, value) {
  if (map.size >= CACHE_MAX) map.delete(map.keys().next().value);   // oldest first
  map.set(key, { at: Date.now(), ...value });
}
const fresh = (entry, ttl) => entry && Date.now() - entry.at < ttl;

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`weather service ${r.status}`);
  return r.json();
}

/** "CA-BC" / "US" / "pk" → "CA" / "US" / "PK"; anything else → '' */
export const countryCode = (country) => {
  const m = String(country || '').trim().match(/^([A-Za-z]{2})(\b|-)/);
  return m ? m[1].toUpperCase() : '';
};

/** the countries that read temperatures in Fahrenheit */
export const unitFor = (cc) => (['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW'].includes(cc) ? 'fahrenheit' : 'celsius');

/**
 * The names worth looking up in a typed location, most specific first:
 * "Fraser River Lodge, Agassiz BC" → ["Fraser River Lodge, Agassiz BC", "Agassiz BC", "Agassiz", "Fraser River Lodge"].
 * People type venues, streets and postcodes; the geocoder only knows places, so each comma part is tried
 * on its own, the town (usually last) before the venue, with a trailing province / state code and digits removed.
 */
export function placeCandidates(location) {
  const full = String(location || '').trim();
  if (!full) return [];
  const parts = full.split(',').map(s => s.trim()).filter(Boolean).reverse();
  const out = [full];
  for (const p of parts) {
    out.push(p);
    const bare = p.replace(/\b[A-Z]{2}\b\s*$/, '').replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b\d{5}(-\d{4})?\b/g, '').replace(/\d+/g, '').trim();
    if (bare && bare.length > 2) out.push(bare);
  }
  return [...new Set(out)].slice(0, 6);
}

/** a typed location → { name, lat, lon } or null — in the vendor's own country first, then anywhere */
export async function findPlace(location, cc) {
  for (const name of placeCandidates(location)) {
    for (const code of cc ? [cc, ''] : ['']) {
      const key = `${name.toLowerCase()}|${code}`;
      const cached = places.get(key);
      if (fresh(cached, PLACE_TTL)) { if (cached.hit) return cached.hit; continue; }
      const q = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' });
      if (code) q.set('countryCode', code);
      const data = await getJson(`${GEO_URL}?${q}`);
      const r = data.results?.[0];
      const hit = r ? { name: r.name, lat: r.latitude, lon: r.longitude } : null;
      remember(places, key, { hit });
      if (hit) return hit;
    }
  }
  return null;
}

/** today + the next 7 days for a place: [{ date, code, max, min, rain }] in the place's own time zone */
export async function forecast(lat, lon, unit) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${unit}`;
  const cached = forecasts.get(key);
  if (fresh(cached, FORECAST_TTL)) return cached.days;
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '8', temperature_unit: unit,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  const d = (await getJson(`${FORECAST_URL}?${q}`)).daily || {};
  const days = (d.time || []).map((date, i) => ({
    date, code: d.weather_code?.[i] ?? null,
    max: Math.round(d.temperature_2m_max?.[i]), min: Math.round(d.temperature_2m_min?.[i]),
    rain: d.precipitation_probability_max?.[i] ?? null,
  })).filter(day => Number.isFinite(day.max) && Number.isFinite(day.min));   // a day the service left blank is not shown as NaN°
  remember(forecasts, key, { days });
  return days;
}
