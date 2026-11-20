/**
 * 🎨 A Fluent emoji — the sidebar's artwork (public/emoji/<code point>.svg), so it is the same picture on every
 * phone and computer, where a typed emoji is drawn differently by each. Decorative: the text beside it carries
 * the meaning.
 */
export default function Emo({ cp, tint = false }) {
  // 🎨 `tint`: the artwork's shape in the text's own colour (styles/index.css .emo-tint) — for a picture too dark to
  // sit beside coloured text, like the guests' silhouettes (Raj, 2026-11-19)
  if (tint) return <span className={`emo emo-tint emo-${cp}`} aria-hidden="true" />;
  return <img className="emo" src={`/emoji/${cp}.svg`} alt="" aria-hidden="true" />;
}
