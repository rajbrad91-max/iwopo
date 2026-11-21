/**
 * 🎨 The panel themes Super Admin chooses from (Raj, 2026-11-21). One is set
 * for every vendor's panel. `seed` tints the panel's backgrounds (lib/brandTone);
 * the accent shades for each live in styles/colors.css under data-palette.
 */
export const PANEL_THEMES = [
  { key: 'teal', label: 'Teal', note: 'Today’s look · default', seed: '#0d9488' },
  { key: 'ocean', label: 'Ocean', note: 'Calm steel blue', seed: '#2c6a9a' },
  { key: 'clay', label: 'Clay', note: 'Warm terracotta', seed: '#a8603e' },
];

export const themeSeed = (key) => (PANEL_THEMES.find(t => t.key === key) || PANEL_THEMES[0]).seed;
