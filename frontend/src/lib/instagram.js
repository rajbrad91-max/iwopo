/**
 * 📸 Instagram handles (tester report 2026-10-16: no "@" and any characters were accepted).
 * Keeps only what Instagram allows — letters, numbers, "." and "_", up to 30 — and turns a pasted
 * link (instagram.com/alina.riaz) or "@alina.riaz" into just the name. The "@" is shown by the form.
 */
export function instaHandle(v) {
  let s = String(v ?? '').trim();
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
}

/** Instagram's own rule: no dot at the start or end, no two dots in a row. '' when fine. */
export function instaProblem(h) {
  if (!h) return '';
  if (/^\.|\.$|\.\./.test(h)) return "An Instagram name can't start or end with a dot, or have two dots in a row";
  return '';
}
