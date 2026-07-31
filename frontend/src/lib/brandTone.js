/**
 * 🎨 The panel's tone, derived from the vendor's brand colour.
 *
 * Hue only, at fixed lightness and capped saturation — not the brand colour
 * tinted. A vendor spends hours in this panel and picks their brand for a
 * logo, not for a workspace: a bright red would give a panel that is
 * exhausting to sit in, and a pale one (#ccebff, which a real account here
 * uses) would produce a near-white page with borders that vanish.
 *
 * So navy becomes a cool grey-blue panel and red a warm grey-pink one. Always
 * readable, always calm, still recognisably theirs. The brand colour itself
 * stays literal everywhere a client actually sees it.
 */

function hexToHsl(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 210, s: 0, l };           // grey has no hue to borrow
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  return { h: hue * 360, s, l };
}

const hsl = (h, s, l) => `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;

/**
 * Tokens for one theme, tinted by a hue.
 *
 * Saturation is capped rather than taken from the brand: a fully saturated
 * surface is hard to read against and hard to sit with, and the cap is what
 * makes any brand colour safe rather than only the tasteful ones.
 */
export function brandTone(brandHex, mode = 'light') {
  const c = hexToHsl(brandHex);
  if (!c) return null;
  const h = c.h;
  // a near-grey brand should not be forced into a colour it does not have
  const tint = c.s < 0.08 ? 0 : 1;

  if (mode === 'light') {
    const sat = Math.min(c.s, 0.30) * tint;
    return {
      '--bg':       hsl(h, sat * 0.5, 0.965),   // the page
      '--panel':    hsl(h, sat * 0.22, 0.995),  // cards and the sidebar
      '--panel-2':  hsl(h, sat * 0.38, 0.975),
      '--line':     hsl(h, sat * 0.42, 0.90),
      '--muted':    hsl(h, sat * 0.32, 0.46),
      '--text':     hsl(h, sat * 0.55, 0.13),
      '--fill':     hsl(h, sat * 0.45, 0.955),
      '--fill2':    hsl(h, sat * 0.45, 0.92),
      '--line2':    hsl(h, sat * 0.40, 0.94),
      // the header sits darker than the page, as a header should
      '--mat':      hsl(h, sat * 0.30, 0.99),
      '--v-side-1': hsl(h, sat * 0.26, 0.985),
      '--v-side-2': hsl(h, sat * 0.26, 0.985),
      '--v-topbar-1': hsl(h, sat * 0.34, 0.955),
      '--v-topbar-2': hsl(h, sat * 0.34, 0.955),
    };
  }
  const sat = Math.min(c.s, 0.34) * tint;
  return {
    '--bg':       hsl(h, sat * 0.62, 0.055),
    '--panel':    hsl(h, sat * 0.52, 0.105),
    '--panel-2':  hsl(h, sat * 0.50, 0.135),
    '--line':     hsl(h, sat * 0.40, 0.22),
    '--muted':    hsl(h, sat * 0.20, 0.62),
    '--text':     hsl(h, sat * 0.14, 0.95),
    '--fill':     hsl(h, sat * 0.44, 0.155),
    '--fill2':    hsl(h, sat * 0.42, 0.20),
    '--line2':    hsl(h, sat * 0.38, 0.17),
    '--mat':      hsl(h, sat * 0.52, 0.105),
    '--v-side-1': hsl(h, sat * 0.54, 0.095),
    '--v-side-2': hsl(h, sat * 0.54, 0.095),
    '--v-topbar-1': hsl(h, sat * 0.50, 0.125),
    '--v-topbar-2': hsl(h, sat * 0.50, 0.125),
  };
}

/**
 * Put the tone on an element as inline custom properties.
 *
 * Inline rather than a stylesheet because the value is per vendor and known
 * only at runtime — and because it then beats :root without anyone having to
 * reason about specificity, which is the thing that has gone wrong in this
 * codebase before.
 */
export function applyBrandTone(el, brandHex, mode) {
  if (!el) return;
  const tone = brandTone(brandHex, mode);
  // clear first, so switching back to no-brand restores the stock theme rather
  // than leaving whichever tokens the last brand happened to set
  for (const k of TOKEN_KEYS) el.style.removeProperty(k);
  if (!tone) return;
  for (const [k, v] of Object.entries(tone)) el.style.setProperty(k, v);
}

const TOKEN_KEYS = ['--bg', '--panel', '--panel-2', '--line', '--muted', '--text',
  '--fill', '--fill2', '--line2', '--mat', '--v-side-1', '--v-side-2',
  '--v-topbar-1', '--v-topbar-2'];
