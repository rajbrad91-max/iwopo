/**
 * 📞 Phone numbers, one rule for every phone box in iwopo (tester report 2026-10-16: letters could be typed).
 * Allowed while typing: digits, a leading +, spaces, ( ) - . for formatting. Anything else never appears.
 */
export const phoneChars = (v) => String(v ?? '').replace(/[^0-9+()\-.\s]/g, '').replace(/(?!^)\+/g, '').slice(0, 30);

/** A real number: 5–15 digits (any country), only the characters above. Returns a message, or '' when fine. */
export function phoneProblem(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/[^0-9+()\-.\s]/.test(s)) return 'Phone numbers can only contain digits';
  const n = s.replace(/\D/g, '').length;
  if (n < 5) return 'That phone number looks too short';
  if (n > 15) return 'That phone number looks too long';
  return '';
}
