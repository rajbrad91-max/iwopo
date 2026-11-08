import prisma from '../config/prisma.js';

/**
 * 🔗 Optional links on a vendor's client pages — the inquiry form, a gallery, the all-galleries page (Raj, 2026-11-08).
 * The business name and the "Private gallery" label can be made clickable, up to two buttons sit on the left of a
 * thin bar at the top, social icons on its right, and a footer can carry contact details and the same icons.
 * Everything is optional: with nothing set, clientLinksFor() is null and the pages are exactly as they were.
 * Only http(s) links are kept — a "javascript:" or "data:" address can never reach a client's page.
 */
export const SOCIALS = ['instagram', 'facebook', 'youtube', 'tiktok', 'pinterest', 'whatsapp'];
const LIMIT = { label: 40, url: 300, phone: 40, email: 160, address: 200 };
const text = (v, n) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };

/** A web address a vendor typed — "perfectposes.ca", "https://…" — as a safe absolute http(s) link, or null. */
export function cleanUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    const out = u.toString();
    return out.length <= LIMIT.url ? out : null;
  } catch { return null; }
}
/** WhatsApp: a phone number becomes its wa.me link; a link is kept as a link. */
function cleanWhatsapp(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, '');
  if (/^[+\d\s().-]+$/.test(s) && digits.length >= 7 && digits.length <= 15) return `https://wa.me/${digits}`;
  return cleanUrl(s);
}
const cleanEmail = (raw) => { const s = text(raw, LIMIT.email); return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null; };

/**
 * What the vendor sent, cleaned: { data } to save, or { error } naming the first thing that is not a usable link.
 * An empty field clears it. A button needs both a label and a link.
 */
export function cleanLinks(body = {}) {
  const data = {};
  const bad = (field) => ({ error: `“${field}” is not a web address we can use — check it, or leave it empty.` });
  for (const [k, name] of [['title_url', 'Business name link'], ['private_url', '“Private gallery” link']]) {
    data[k] = cleanUrl(body[k]);
    if (String(body[k] ?? '').trim() && !data[k]) return bad(name);
  }
  for (const n of [1, 2]) {
    const label = text(body[`button${n}_label`], LIMIT.label), url = cleanUrl(body[`button${n}_url`]);
    if (String(body[`button${n}_url`] ?? '').trim() && !url) return bad(`Button ${n} link`);
    if (!!label !== !!url) return { error: `Button ${n} needs both a name and a link.` };
    data[`button${n}_label`] = label; data[`button${n}_url`] = url;
  }
  for (const s of SOCIALS) {
    data[s] = s === 'whatsapp' ? cleanWhatsapp(body[s]) : cleanUrl(body[s]);
    if (String(body[s] ?? '').trim() && !data[s]) return bad(s[0].toUpperCase() + s.slice(1));
  }
  data.footer_phone = text(body.footer_phone, LIMIT.phone);
  data.footer_email = cleanEmail(body.footer_email);
  if (String(body.footer_email ?? '').trim() && !data.footer_email) return { error: 'The footer email does not look like an email address.' };
  data.footer_address = text(body.footer_address, LIMIT.address);
  return { data };
}

/** The links as the client pages use them — or null when the vendor has set nothing at all. */
export async function clientLinksFor(vendorId) {
  const r = vendorId ? await prisma.client_links.findUnique({ where: { vendor_id: Number(vendorId) } }) : null;
  if (!r) return null;
  const buttons = [1, 2].filter(n => r[`button${n}_label`] && r[`button${n}_url`]).map(n => ({ label: r[`button${n}_label`], url: r[`button${n}_url`] }));
  const socials = SOCIALS.filter(s => r[s]).map(s => ({ kind: s, url: r[s] }));
  const contact = (r.footer_phone || r.footer_email || r.footer_address) ? { phone: r.footer_phone, email: r.footer_email, address: r.footer_address } : null;
  if (!r.title_url && !r.private_url && !buttons.length && !socials.length && !contact) return null;
  return { title_url: r.title_url, private_url: r.private_url, buttons, socials, contact };
}
