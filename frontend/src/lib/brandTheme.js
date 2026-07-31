/**
 * brand-theme.js — derive a full inquiry-form theme from ONE brand color.
 *
 * Pure function: hex in -> plain object of CSS custom properties out.
 * OKLCH rather than HSL, because OKLCH lightness is perceptually uniform:
 * clamping it gives the same readability for a yellow as for a blue, which
 * HSL cannot promise.
 */

/* ---------------- color math: sRGB hex <-> OKLCH ---------------- */

function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '4caf50'; // safe fallback, never throws
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** hex -> { L (0..1), C (0..~0.37), h (deg) } */
export function toOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH -> #rrggbb (gamut-clamped, always a valid hex) */
export function fromOklch(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(clamp(toSrgb(v), 0, 1) * 255));
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255));
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------- theme shape presets (radius + type) ---------------- */

const SHAPES = {
  Modern: {
    '--radius-lg': '20px', '--radius-md': '14px', '--radius-sm': '10px', '--radius-pill': '999px',
    '--font-head': "'Montserrat', system-ui, sans-serif",
    '--font-body': "'Montserrat', system-ui, sans-serif",
    '--head-weight': '700', '--head-tracking': '-0.02em',
  },
  Classic: {
    '--radius-lg': '2px', '--radius-md': '2px', '--radius-sm': '2px', '--radius-pill': '2px',
    '--font-head': "'Cormorant Garamond', Georgia, serif",
    '--font-body': "'Montserrat', system-ui, sans-serif",
    '--head-weight': '600', '--head-tracking': '0.01em',
  },
  Minimal: {
    '--radius-lg': '4px', '--radius-md': '4px', '--radius-sm': '4px', '--radius-pill': '4px',
    '--font-head': "'DM Sans', system-ui, sans-serif",
    '--font-body': "'DM Sans', system-ui, sans-serif",
    '--head-weight': '500', '--head-tracking': '-0.02em',
  },
};

/**
 * Build every themeable token from one brand color.
 * @param {string} brandColor  e.g. "#4caf50" (invalid input falls back to green)
 * @param {string} [themeName] "Modern" | "Classic" | "Minimal"
 * @param {string} [fontFamily] optional font override from the vendor panel
 * @returns {Record<string,string>} CSS custom properties
 */
export function buildTheme(brandColor, themeName = 'Modern', fontFamily) {
  const { L, C, h } = toOklch(brandColor);
  const c = Math.min(C, 0.22);                 // cap neon input
  const brand = fromOklch(clamp(L, 0.42, 0.68), c, h); // keep the block legible
  const brandL = toOklch(brand).L;
  const isLight = brandL > 0.62;
  const onBrand = isLight ? fromOklch(0.24, Math.min(c * 0.5, 0.06), h) : '#ffffff';
  const flat = themeName === 'Minimal';

  const shape = { ...(SHAPES[themeName] || SHAPES.Modern) };
  if (fontFamily) {
    shape['--font-head'] = `'${fontFamily}', ${shape['--font-head']}`;
    shape['--font-body'] = `'${fontFamily}', ${shape['--font-body']}`;
  }

  return {
    // brand family
    '--brand': brand,
    '--brand-strong': fromOklch(Math.max(0.3, L - 0.12), c * 0.95, h),
    '--brand-ink': fromOklch(0.36, Math.min(c * 0.8, 0.11), h),   // headings
    '--brand-soft': fromOklch(0.965, c * 0.28, h),                // callout fills
    '--brand-border': fromOklch(0.9, c * 0.35, h),
    '--brand-ring': rgba(brand, 0.22),                            // focus ring
    '--on-brand': onBrand,
    '--on-brand-soft': isLight ? rgba('#ffffff', 0.7) : rgba('#ffffff', 0.92),

    // surfaces + text (hue-tinted neutrals, never flat gray)
    '--page-bg': fromOklch(0.975, c * 0.14, h),
    '--surface': flat ? fromOklch(0.995, c * 0.05, h) : '#ffffff',
    '--line': fromOklch(0.91, c * 0.16, h),
    '--field-bg': fromOklch(0.985, c * 0.1, h),
    '--field-line': fromOklch(0.89, c * 0.2, h),
    '--label': fromOklch(0.42, Math.min(c * 0.5, 0.06), h),
    '--text': fromOklch(0.3, Math.min(c * 0.3, 0.035), h),
    '--muted': fromOklch(0.6, Math.min(c * 0.3, 0.04), h),
    '--wm': fromOklch(0.955, c * 0.2, h),                         // watermark

    // depth
    '--shadow': flat ? 'none' : `0 18px 48px ${rgba(brand, 0.14)}, 0 2px 6px ${rgba(brand, 0.08)}`,
    '--btn-shadow': flat ? 'none' : `0 8px 20px ${rgba(brand, 0.32)}`,

    ...shape,
  };
}

/** Write the tokens onto an element (scoped) or document.documentElement (global). */
export function applyTheme(el, brandColor, themeName, fontFamily) {
  const target = el || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return {};
  const vars = buildTheme(brandColor, themeName, fontFamily);
  for (const [k, v] of Object.entries(vars)) target.style.setProperty(k, v);
  return vars;
}

/** React convenience: <div style={themeStyleObject(color, theme)}> */
export function themeStyleObject(brandColor, themeName, fontFamily) {
  return buildTheme(brandColor, themeName, fontFamily);
}

export default { buildTheme, applyTheme, themeStyleObject, toOklch, fromOklch };
