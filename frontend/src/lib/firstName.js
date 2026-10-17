/**
 * 👋 A client's first name for a personal thank-you ("Thank you, Alina!") — tester suggestion 2026-10-16.
 * "alina riaz" → "Alina"; empty or odd input → '' (the message then reads without a name).
 */
export function firstName(full) {
  const w = String(full ?? '').trim().split(/\s+/)[0] || '';
  if (!/\p{L}/u.test(w)) return '';
  return w.charAt(0).toLocaleUpperCase() + w.slice(1);
}
