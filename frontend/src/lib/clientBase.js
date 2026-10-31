/**
 * 🌐 The address a vendor's client links use (2026-10-31) — their own domain, their subdomain, or the platform.
 *
 * The server decides (lib/vendorHosts.js clientBaseUrl, sent by GET /api/domain); the panel keeps the answer here so
 * every "copy link" button — portal, gallery, inquiry form — shows the same address the emails use. Until it has
 * loaded, links use this page's own address, which always works.
 */
let base = null;

export function setClientBase(url) {
  if (typeof url === 'string' && /^https?:\/\/[^/]+$/.test(url.replace(/\/+$/, ''))) base = url.replace(/\/+$/, '');
}

export const clientBase = () => base || window.location.origin;

/** The vendor's inquiry form: on their own address it is simply /inquiry; on the platform it names the studio. */
export function inquiryUrl(handle) {
  const b = clientBase();
  return b === window.location.origin ? `${b}/inquiry/${handle}` : `${b}/inquiry`;
}
