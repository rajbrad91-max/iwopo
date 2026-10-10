/**
 * Where a vendor's clock lives.
 *
 * The country on their profile decides the timezone. Each country lists the
 * zones people there actually use, largest city first. The first city is the
 * one they get when we don't yet know which part of the country they're in.
 * A browser zone is only used to pick among that country's own cities — never
 * to borrow another country's zone, and never to fall back to Vancouver.
 *
 * The value stored in vendor_settings.timezone is the IANA id. The label the
 * vendor sees is the city.
 */

/** The column default. It is not a guess — every new row used to receive it. */
export const BLANKET_DEFAULT = 'America/Vancouver';

/** [iana id, largest well-known city in that zone]. First row is the country's largest city. */
const COUNTRY_ZONES = {
  'CA-BC': [
    ['America/Vancouver', 'Vancouver'],
    ['America/Dawson_Creek', 'Dawson Creek'],
  ],
  CA: [
    ['America/Toronto', 'Toronto'],
    ['America/Winnipeg', 'Winnipeg'],
    ['America/Edmonton', 'Calgary'],
    ['America/Regina', 'Regina'],
    ['America/Halifax', 'Halifax'],
    ['America/Moncton', 'Moncton'],
    ['America/St_Johns', "St. John's"],
    ['America/Whitehorse', 'Whitehorse'],
    ['America/Iqaluit', 'Iqaluit'],
  ],
  US: [
    ['America/New_York', 'New York'],
    ['America/Chicago', 'Chicago'],
    ['America/Denver', 'Denver'],
    ['America/Los_Angeles', 'Los Angeles'],
    ['America/Phoenix', 'Phoenix'],
    ['America/Boise', 'Boise'],
    ['America/Indiana/Indianapolis', 'Indianapolis'],
    ['America/Detroit', 'Detroit'],
    ['America/Kentucky/Louisville', 'Louisville'],
    ['America/Anchorage', 'Anchorage'],
    ['America/Juneau', 'Juneau'],
    ['Pacific/Honolulu', 'Honolulu'],
  ],
  MX: [
    ['America/Mexico_City', 'Mexico City'],
    ['America/Cancun', 'Cancún'],
    ['America/Mazatlan', 'Mazatlán'],
    ['America/Hermosillo', 'Hermosillo'],
    ['America/Chihuahua', 'Chihuahua'],
    ['America/Tijuana', 'Tijuana'],
  ],

  GB: [['Europe/London', 'London']],
  IE: [['Europe/Dublin', 'Dublin']],
  DE: [['Europe/Berlin', 'Berlin']],
  FR: [['Europe/Paris', 'Paris']],
  ES: [['Europe/Madrid', 'Madrid'], ['Atlantic/Canary', 'Las Palmas']],
  IT: [['Europe/Rome', 'Rome']],
  NL: [['Europe/Amsterdam', 'Amsterdam']],
  BE: [['Europe/Brussels', 'Brussels']],
  AT: [['Europe/Vienna', 'Vienna']],
  PT: [['Europe/Lisbon', 'Lisbon'], ['Atlantic/Madeira', 'Funchal'], ['Atlantic/Azores', 'Ponta Delgada']],
  GR: [['Europe/Athens', 'Athens']],
  CH: [['Europe/Zurich', 'Zurich']],
  SE: [['Europe/Stockholm', 'Stockholm']],
  NO: [['Europe/Oslo', 'Oslo']],
  DK: [['Europe/Copenhagen', 'Copenhagen']],
  FI: [['Europe/Helsinki', 'Helsinki']],
  IS: [['Atlantic/Reykjavik', 'Reykjavík']],
  PL: [['Europe/Warsaw', 'Warsaw']],
  CZ: [['Europe/Prague', 'Prague']],
  HU: [['Europe/Budapest', 'Budapest']],
  RO: [['Europe/Bucharest', 'Bucharest']],
  BG: [['Europe/Sofia', 'Sofia']],
  HR: [['Europe/Zagreb', 'Zagreb']],
  RS: [['Europe/Belgrade', 'Belgrade']],
  UA: [['Europe/Kyiv', 'Kyiv']],
  TR: [['Europe/Istanbul', 'Istanbul']],

  AE: [['Asia/Dubai', 'Dubai']],
  SA: [['Asia/Riyadh', 'Riyadh']],
  QA: [['Asia/Qatar', 'Doha']],
  KW: [['Asia/Kuwait', 'Kuwait City']],
  BH: [['Asia/Bahrain', 'Manama']],
  OM: [['Asia/Muscat', 'Muscat']],
  JO: [['Asia/Amman', 'Amman']],
  IL: [['Asia/Jerusalem', 'Tel Aviv']],

  IN: [['Asia/Kolkata', 'Mumbai']],
  PK: [['Asia/Karachi', 'Karachi']],
  BD: [['Asia/Dhaka', 'Dhaka']],
  LK: [['Asia/Colombo', 'Colombo']],
  NP: [['Asia/Kathmandu', 'Kathmandu']],
  CN: [['Asia/Shanghai', 'Shanghai'], ['Asia/Urumqi', 'Ürümqi']],
  HK: [['Asia/Hong_Kong', 'Hong Kong']],
  TW: [['Asia/Taipei', 'Taipei']],
  JP: [['Asia/Tokyo', 'Tokyo']],
  KR: [['Asia/Seoul', 'Seoul']],
  SG: [['Asia/Singapore', 'Singapore']],
  MY: [['Asia/Kuala_Lumpur', 'Kuala Lumpur'], ['Asia/Kuching', 'Kuching']],
  ID: [['Asia/Jakarta', 'Jakarta'], ['Asia/Makassar', 'Makassar'], ['Asia/Jayapura', 'Jayapura']],
  TH: [['Asia/Bangkok', 'Bangkok']],
  VN: [['Asia/Ho_Chi_Minh', 'Ho Chi Minh City']],
  PH: [['Asia/Manila', 'Manila']],

  ZA: [['Africa/Johannesburg', 'Johannesburg']],
  NG: [['Africa/Lagos', 'Lagos']],
  KE: [['Africa/Nairobi', 'Nairobi']],
  GH: [['Africa/Accra', 'Accra']],
  TZ: [['Africa/Dar_es_Salaam', 'Dar es Salaam']],
  UG: [['Africa/Kampala', 'Kampala']],
  EG: [['Africa/Cairo', 'Cairo']],
  MA: [['Africa/Casablanca', 'Casablanca']],
  TN: [['Africa/Tunis', 'Tunis']],
  MU: [['Indian/Mauritius', 'Port Louis']],
  CI: [['Africa/Abidjan', 'Abidjan']],
  SN: [['Africa/Dakar', 'Dakar']],
  CM: [['Africa/Douala', 'Douala']],

  BR: [
    ['America/Sao_Paulo', 'São Paulo'],
    ['America/Bahia', 'Salvador'],
    ['America/Fortaleza', 'Fortaleza'],
    ['America/Recife', 'Recife'],
    ['America/Belem', 'Belém'],
    ['America/Maceio', 'Maceió'],
    ['America/Araguaina', 'Araguaína'],
    ['America/Santarem', 'Santarém'],
    ['America/Manaus', 'Manaus'],
    ['America/Boa_Vista', 'Boa Vista'],
    ['America/Cuiaba', 'Cuiabá'],
    ['America/Campo_Grande', 'Campo Grande'],
    ['America/Porto_Velho', 'Porto Velho'],
    ['America/Rio_Branco', 'Rio Branco'],
    ['America/Noronha', 'Fernando de Noronha'],
  ],
  AR: [
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['America/Argentina/Cordoba', 'Córdoba'],
    ['America/Argentina/Mendoza', 'Mendoza'],
    ['America/Argentina/Salta', 'Salta'],
    ['America/Argentina/Tucuman', 'Tucumán'],
  ],
  CL: [['America/Santiago', 'Santiago'], ['America/Punta_Arenas', 'Punta Arenas'], ['Pacific/Easter', 'Easter Island']],
  CO: [['America/Bogota', 'Bogotá']],
  PE: [['America/Lima', 'Lima']],
  UY: [['America/Montevideo', 'Montevideo']],
  DO: [['America/Santo_Domingo', 'Santo Domingo']],
  JM: [['America/Jamaica', 'Kingston']],
  TT: [['America/Port_of_Spain', 'Port of Spain']],

  AU: [
    ['Australia/Sydney', 'Sydney'],
    ['Australia/Melbourne', 'Melbourne'],
    ['Australia/Brisbane', 'Brisbane'],
    ['Australia/Adelaide', 'Adelaide'],
    ['Australia/Perth', 'Perth'],
    ['Australia/Darwin', 'Darwin'],
    ['Australia/Hobart', 'Hobart'],
    ['Australia/Broken_Hill', 'Broken Hill'],
    ['Australia/Lord_Howe', 'Lord Howe Island'],
  ],
  NZ: [['Pacific/Auckland', 'Auckland'], ['Pacific/Chatham', 'Chatham Islands']],
  FJ: [['Pacific/Fiji', 'Suva']],
};

const CITY = new Map();
for (const rows of Object.values(COUNTRY_ZONES)) {
  for (const [tz, city] of rows) if (!CITY.has(tz)) CITY.set(tz, city);
}

export function zonesForCountry(country) {
  const rows = COUNTRY_ZONES[String(country || '').trim()] || [];
  return rows.map(([tz, city]) => ({ tz, city }));
}

export function cityOf(tz) {
  if (CITY.has(tz)) return CITY.get(tz);
  const tail = String(tz || '').split('/').pop() || '';
  return tail.replace(/_/g, ' ');
}

/** A real IANA zone, or '' . */
export function knownZone(tz) {
  const s = String(tz || '').trim();
  if (!s || s.length > 80) return '';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: s });
    return s;
  } catch {
    return '';
  }
}

/**
 * The zone this vendor should be on.
 * refine=true means the stored value was missing, the old Vancouver default,
 * or a zone from somewhere else — the panel may still pick another city in
 * the same country from the computer's zone.
 */
export function resolveTimezone(saved, country) {
  const zones = zonesForCountry(country);
  const clean = knownZone(saved);
  const hit = clean && zones.find(z => z.tz === clean);
  if (hit) return { tz: hit.tz, city: hit.city, zones, refine: false };
  if (zones.length) {
    return { tz: zones[0].tz, city: zones[0].city, zones, refine: true };
  }
  if (clean && clean !== BLANKET_DEFAULT) {
    return { tz: clean, city: cityOf(clean), zones: [], refine: false };
  }
  return { tz: '', city: '', zones: [], refine: true };
}

/**
 * What to write when the vendor saves. A listed country can only keep one of
 * its own cities. A vendor with no country can keep a real zone they already
 * have. Nobody is written down as Vancouver just because the field was empty.
 */
export function timezoneToStore(sent, saved, country) {
  const zones = zonesForCountry(country);
  const pick = knownZone(sent);
  if (zones.length) {
    if (pick && zones.some(z => z.tz === pick)) return pick;
    const keep = knownZone(saved);
    if (keep && zones.some(z => z.tz === keep)) return keep;
    return zones[0].tz;
  }
  if (pick && pick !== BLANKET_DEFAULT) return pick;
  const keep = knownZone(saved);
  if (keep && keep !== BLANKET_DEFAULT) return keep;
  return pick || null;
}
