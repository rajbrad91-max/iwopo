/**
 * 💍 A vendor's one brand colour (Raj, 2026-11-21) — the colour their clients
 * see on the gallery, inquiry form, portal, contract, invoice and File Flyer.
 * It never dresses the vendor's own panel; Super Admin's panel theme does that.
 *
 * The client pages were drawn in iwopo's gold (the brand family in
 * styles/colors.css) or in teal (File Flyer's accent family). These turn the
 * vendor's colour into those same shades — each keeps its own lightness, so a
 * pale tint stays pale and a deep line stays deep, only the hue follows.
 */
import { toOklch, fromOklch } from './brandTheme';

/** the colours a page falls back to when a vendor has none saved */
export const PORTAL_DEFAULT = '#C9A86A';   // the gold iwopo's client pages were drawn in
export const BRAND_DEFAULT = '#0d9488';    // the teal a new vendor starts with

const valid = (hex) => /^#[0-9a-f]{6}$/i.test(hex || '');

function shades(hex, family, base) {
  if (!valid(hex)) return {};
  const b = toOklch(hex); const o0 = toOklch(base);
  const ratio = o0.C > 0 ? b.C / o0.C : 0;
  const out = {};
  for (const [k, v] of Object.entries(family)) {
    const o = toOklch(v);
    out[k] = fromOklch(o.L, Math.min(0.22, o.C * ratio), (b.h + (o.h - o0.h) + 360) % 360);
  }
  return out;
}

/** the gold family on the portal, contract, invoice and inquiry form */
export const brandVars = (hex) => (valid(hex) ? { '--brand': hex, ...shades(hex,
  { '--brand-881': '#e7d7a8', '--brand-747': '#c9a86a', '--brand-678': '#b8922a', '--brand-549': '#8a6d1f' }, '#c9a86a') } : {});

/** the teal family a File Flyer link is drawn in */
export const accentVars = (hex) => shades(hex,
  { '--accent-704': '#14b8a6', '--accent-600': '#0d9488', '--accent-511': '#0f766e' }, '#0d9488');

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The colour moved lighter or darker, hue kept, until it reads on `bg` —
    a navy brand on a black gallery is lifted, a pale one on white is deepened. */
export function readableOn(hex, bg) {
  if (!valid(hex) || !valid(bg)) return hex;
  const c = toOklch(hex); const up = lum(bg) < 0.18;
  for (let L = c.L, i = 0; i < 40; i++) {
    const t = fromOklch(L, c.C, c.h);
    if (contrast(t, bg) >= 3) return t;
    L = up ? Math.min(0.97, L + 0.02) : Math.max(0.08, L - 0.02);
  }
  return hex;
}

/** Too pale to carry white text or show on a white page (white, cream, pale grey). */
export const tooLight = (hex) => valid(hex) && lum(hex) > 0.7;
