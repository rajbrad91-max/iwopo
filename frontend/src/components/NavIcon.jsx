/**
 * 🎨 The sidebar's own icons (2026-11-14): flat two-tone drawings made for iwopo (assets/nav/*.svg), chosen by Raj.
 * Drawn inline rather than as <img> so their thin cut lines take the sidebar's colour in either theme (--nav-cut).
 * The files are our own artwork and ship in the bundle — nothing a vendor or client can change.
 */
import { svgSet } from '../lib/svgSet';

const ICONS = svgSet(import.meta.glob('../assets/nav/*.svg', { query: '?raw', import: 'default', eager: true }));

export default function NavIcon({ name }) {
  return <span className="nav-ic nav-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />;
}
