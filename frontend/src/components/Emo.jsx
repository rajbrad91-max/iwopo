/**
 * 🎨 A Fluent emoji — the sidebar's artwork (public/emoji/<code point>.svg), so it is the same picture on every
 * phone and computer, where a typed emoji is drawn differently by each. Decorative: the text beside it carries
 * the meaning.
 */
import { svgSet } from '../lib/svgSet';

const TINTED = svgSet(import.meta.glob('../assets/emo-tint/*.svg', { query: '?raw', import: 'default', eager: true }));

export default function Emo({ cp, tint = false }) {
  // 🎨 `tint`: our own drawing of the picture (assets/emo-tint), in the text's own colour — the guests' two people, the
  // camera, the clapperboard (Raj, 2026-11-19) — or the theme's (the location pin, deep orange). Drawn inline, so
  // every browser shows it.
  // Each drawing's viewBox is centred on the picture itself, so it sits level with the words beside it.
  if (tint && TINTED[cp]) return <span className="emo emo-tint" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TINTED[cp] }} />;
  return <img className="emo" src={`/emoji/${cp}.svg`} alt="" aria-hidden="true" />;
}
