/**
 * 🌗 The panel's theme (Raj, 2026-11-07): 'light', 'dark', or 'system' — follow the device, and light when the device
 * has no preference. public/boot.js applies the same rule before the first paint.
 */
export const resolveTheme = (t) => (t === 'light' || t === 'dark' ? t
  : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

export function applyTheme(t) {
  const choice = t === 'light' || t === 'dark' ? t : 'system';
  if (resolveTheme(choice) === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('vf_theme', choice); } catch { /* private mode */ }
}
