/**
 * 🎨 A Fluent emoji — the sidebar's artwork (public/emoji/<code point>.svg), so it is the same picture on every
 * phone and computer, where a typed emoji is drawn differently by each. Decorative: the text beside it carries
 * the meaning.
 */
export default function Emo({ cp }) {
  return <img className="emo" src={`/emoji/${cp}.svg`} alt="" aria-hidden="true" />;
}
