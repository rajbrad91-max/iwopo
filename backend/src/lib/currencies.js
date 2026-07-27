/**
 * 💱 Currencies a vendor can be paid in.
 *
 * iwopo is used by vendors in different countries, so a price is meaningless
 * without saying which currency it is in. A vendor's own money — what their
 * clients owe them — is shown in THEIR currency. iwopo's pricing to the vendor
 * is a separate thing and is not affected by this.
 *
 * The default is derived from the country they already choose in their profile,
 * so most vendors never touch it; it is a preference they can override rather
 * than a question they must answer.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
];

/** The country codes already offered in the profile → what they'd be paid in. */
export const COUNTRY_CURRENCY = {
  'CA-BC': 'CAD', CA: 'CAD', US: 'USD', GB: 'GBP', AU: 'AUD', NZ: 'NZD',
  IN: 'INR', AE: 'AED', SA: 'SAR', SG: 'SGD', ZA: 'ZAR', MX: 'MXN',
  BR: 'BRL', JP: 'JPY', PK: 'PKR', BD: 'BDT', PH: 'PHP', MY: 'MYR',
  KE: 'KES', NG: 'NGN',
  IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
  default: 'USD',
};

/**
 * What this vendor is paid in: their own choice if they made one, otherwise
 * whatever their country implies, and US dollars if we know neither.
 */
export function currencyFor(chosen, country) {
  if (chosen && CURRENCIES.some(c => c.code === chosen)) return chosen;
  return COUNTRY_CURRENCY[country] || 'USD';
}

export function currencySymbol(code) {
  return (CURRENCIES.find(c => c.code === code) || {}).symbol || '$';
}

/** Fast membership test for validating what a vendor sends. */
export const CURRENCY_CODES = new Set(CURRENCIES.map(c => c.code));
