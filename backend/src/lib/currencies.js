/**
 * 💱 Currencies a vendor can be paid in.
 *
 * The list is broad on purpose. An earlier version carried twenty-one, which
 * quietly meant a vendor in Indonesia, Turkey, Korea, Poland or Egypt had no
 * correct answer available — and a photographer unable to state what they charge
 * in is not a small gap in a product sold worldwide.
 *
 * There are no symbols here. Intl already knows how each of these is written and
 * where the symbol goes, in the reader's own locale; a hand-kept symbol table
 * would be a second, worse copy of that, and would go stale.
 */
export const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'BDT', name: 'Bangladeshi Taka' },
  { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'DOP', name: 'Dominican Peso' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'FJD', name: 'Fijian Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'ILS', name: 'Israeli Shekel' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'ISK', name: 'Icelandic Krona' },
  { code: 'JMD', name: 'Jamaican Dollar' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MUR', name: 'Mauritian Rupee' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'TTD', name: 'Trinidad & Tobago Dollar' },
  { code: 'TWD', name: 'Taiwan Dollar' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UAH', name: 'Ukrainian Hryvnia' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'UYU', name: 'Uruguayan Peso' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'XAF', name: 'Central African Franc' },
  { code: 'XOF', name: 'West African Franc' },
  { code: 'ZAR', name: 'South African Rand' },
];

/**
 * Country → what a vendor there is paid in.
 *
 * Only the exceptions and the non-obvious ones need naming: everything in the
 * euro area maps to EUR, and the rest is one line each. A country missing from
 * here still works — it falls back to US dollars and the vendor can set their
 * own — so an unlisted country is a poorer default, never a broken one.
 */
export const COUNTRY_CURRENCY = {
  // North America
  'CA-BC': 'CAD', CA: 'CAD', US: 'USD', MX: 'MXN',
  // Euro area
  IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', GR: 'EUR', FI: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR',
  LV: 'EUR', EE: 'EUR', LU: 'EUR', CY: 'EUR', MT: 'EUR', HR: 'EUR',
  // Rest of Europe
  GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
  HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', UA: 'UAH', IS: 'ISK', TR: 'TRY',
  // Middle East
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', IL: 'ILS',
  // Asia
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', CN: 'CNY', JP: 'JPY',
  KR: 'KRW', TW: 'TWD', HK: 'HKD', SG: 'SGD', MY: 'MYR', ID: 'IDR', TH: 'THB',
  VN: 'VND', PH: 'PHP',
  // Africa
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', TZ: 'TZS', UG: 'UGX',
  EG: 'EGP', MA: 'MAD', TN: 'TND', MU: 'MUR', CI: 'XOF', SN: 'XOF', CM: 'XAF',
  // Latin America & Caribbean
  BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU',
  DO: 'DOP', JM: 'JMD', TT: 'TTD',
  // Oceania
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD',
  default: 'USD',
};

/**
 * What this vendor is paid in: their own choice if they made one, otherwise
 * whatever their country implies, and US dollars if we know neither.
 */
export function currencyFor(chosen, country) {
  if (chosen && CURRENCY_CODES.has(chosen)) return chosen;
  return COUNTRY_CURRENCY[country] || 'USD';
}

/** Fast membership test for validating what a vendor sends. */
export const CURRENCY_CODES = new Set(CURRENCIES.map(c => c.code));
