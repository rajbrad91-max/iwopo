/**
 * 📸 The server's copy of the Instagram rule (frontend/src/lib/instagram.js): the handle is kept as
 * "@name" with only the characters Instagram allows; anything else is refused, even if the form is skipped.
 */
export function cleanInstagram(v) {
  let s = String(v ?? '').trim();
  if (!s) return { value: '' };
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s) || /^\.|\.$|\.\./.test(s)) return { error: 'Instagram names can only have letters, numbers, "." and "_"' };
  return { value: `@${s}` };
}
