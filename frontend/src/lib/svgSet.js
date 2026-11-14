/**
 * 🎨 A folder of SVG drawings, by file name — for the components that draw iwopo's own icons inline.
 * Vite needs each `import.meta.glob(...)` written out where it is used, so callers pass its result here:
 *   svgSet(import.meta.glob('../assets/nav/*.svg', { query: '?raw', import: 'default', eager: true }))
 * → { leads: '<svg…>', bookings: '<svg…>', … }
 */
export const svgSet = (files) =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.split('/').pop().replace('.svg', ''), svg]));
