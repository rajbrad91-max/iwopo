/** ✉️ {tag} → value in an email template, the same rule as the server (backend/src/lib/emailTemplates.js):
 *  a tag with no value given is left as written. `esc` escapes the values for an HTML design. */
export function fillTags(text, vals, esc = (s) => s) {
  return String(text || '').replace(/\{([a-z_]+)\}/g, (m, t) => (Object.prototype.hasOwnProperty.call(vals, t) ? esc(String(vals[t] ?? '')) : m));
}

export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
