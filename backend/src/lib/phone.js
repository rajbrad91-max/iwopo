/**
 * 📞 The server's copy of the phone rule (frontend/src/lib/phone.js) — nothing with letters is saved,
 * even if someone skips the form. Empty is allowed here; the form decides when a phone is required.
 */
export function phoneProblem(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/[^0-9+()\-.\s]/.test(s)) return 'Phone numbers can only contain digits';
  const n = s.replace(/\D/g, '').length;
  if (n < 5) return 'That phone number looks too short';
  if (n > 15) return 'That phone number looks too long';
  return '';
}
