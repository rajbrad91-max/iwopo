/**
 * 🖼️ One big line drawing behind the inquiry form, for the vendor's trade.
 *
 * Raj, 2026-10-09: rows of small emoji across the whole page looked busy; one
 * stylish drawing (with a smaller companion) reads as a watermark, not
 * wallpaper. Plain strokes in currentColor, so the page tints them with the
 * vendor's brand colour; "None" shows nothing at all. Drawn on a 120×120 grid.
 */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const ART = {
  camera: (
    <g {...S}>
      <path d="M14 42a8 8 0 0 1 8-8h14l6-9h36l6 9h14a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" />
      <circle cx="60" cy="64" r="21" /><circle cx="60" cy="64" r="12" /><circle cx="60" cy="64" r="4" />
      <rect x="86" y="42" width="12" height="7" rx="2" />
    </g>
  ),
  photo: (
    <g {...S}>
      <rect x="16" y="26" width="88" height="68" rx="4" />
      <rect x="24" y="34" width="72" height="52" rx="2" />
      <path d="M24 78l20-20 14 14 10-10 28 26" /><circle cx="78" cy="48" r="6" />
    </g>
  ),
  video: (
    <g {...S}>
      <circle cx="34" cy="30" r="12" /><circle cx="34" cy="30" r="3" />
      <circle cx="62" cy="30" r="12" /><circle cx="62" cy="30" r="3" />
      <rect x="12" y="44" width="70" height="44" rx="6" />
      <path d="M82 58l26-12v40l-26-12z" /><path d="M30 88l-8 18M64 88l8 18" />
    </g>
  ),
  mixer: (
    <g {...S}>
      <rect x="6" y="38" width="108" height="52" rx="6" />
      <circle cx="32" cy="64" r="17" /><circle cx="32" cy="64" r="5" /><path d="M32 47v6" />
      <circle cx="88" cy="64" r="17" /><circle cx="88" cy="64" r="5" /><path d="M88 47v6" />
      <path d="M56 48v32M64 48v32" /><rect x="53" y="56" width="6" height="6" rx="1" /><rect x="61" y="66" width="6" height="6" rx="1" />
    </g>
  ),
  headphones: (
    <g {...S}>
      <path d="M22 70V60a38 38 0 0 1 76 0v10" />
      <rect x="14" y="66" width="18" height="30" rx="7" /><rect x="88" y="66" width="18" height="30" rx="7" />
    </g>
  ),
  lipstick: (
    <g {...S}>
      <rect x="44" y="64" width="32" height="42" rx="3" />
      <rect x="47" y="46" width="26" height="18" rx="2" />
      <path d="M50 46V26l20-12v32" /><path d="M44 78h32" />
    </g>
  ),
  brush: (
    <g {...S}>
      <path d="M40 104l30-46" /><path d="M66 64l6-10 22-34a8 8 0 0 0-12-8L56 46l-6 10z" /><path d="M58 52l12 8" />
    </g>
  ),
  cake: (
    <g {...S}>
      <rect x="22" y="78" width="76" height="24" rx="3" />
      <rect x="32" y="56" width="56" height="22" rx="3" />
      <rect x="42" y="36" width="36" height="20" rx="3" />
      <path d="M22 88c8 6 14-6 22 0s14-6 22 0 14-6 22 0 8-4 10-2" />
      <path d="M60 36V26" /><path d="M60 14c3 4 3 7 0 9-3-2-3-5 0-9z" />
      <path d="M14 106h92" />
    </g>
  ),
  flowers: (
    <g {...S}>
      <circle cx="60" cy="34" r="7" />
      <path d="M60 27c-6-12 6-12 0 0M67 34c12-6 12 6 0 0M60 41c6 12-6 12 0 0M53 34c-12 6-12-6 0 0" />
      <circle cx="36" cy="50" r="5" /><circle cx="84" cy="50" r="5" />
      <path d="M60 41v62M36 55c8 16 18 30 24 48M84 55c-8 16-18 30-24 48" />
      <path d="M60 78c-10-2-16-10-16-18 10 2 16 10 16 18zM60 70c10-2 16-10 16-18-10 2-16 10-16 18z" />
    </g>
  ),
  cocktail: (
    <g {...S}>
      <path d="M22 28h76L60 70z" /><path d="M60 70v30" /><path d="M42 104h36" />
      <path d="M34 40h52" /><path d="M76 16L66 44" /><circle cx="64" cy="48" r="4" />
    </g>
  ),
  cloche: (
    <g {...S}>
      <path d="M18 82a42 42 0 0 1 84 0" /><path d="M10 82h100" /><path d="M16 90h88" />
      <path d="M60 40v-6" /><circle cx="60" cy="30" r="4" />
    </g>
  ),
  calendar: (
    <g {...S}>
      <rect x="16" y="26" width="88" height="78" rx="6" /><path d="M16 46h88" /><path d="M38 18v16M82 18v16" />
      <path d="M60 92c-14-9-20-16-20-23a8 8 0 0 1 20-4 8 8 0 0 1 20 4c0 7-6 14-20 23z" />
    </g>
  ),
  notes: (
    <g {...S}>
      <path d="M44 88V30l52-12v58" /><path d="M44 42l52-12" />
      <ellipse cx="34" cy="88" rx="11" ry="8" /><ellipse cx="86" cy="76" rx="11" ry="8" />
    </g>
  ),
  mic: (
    <g {...S}>
      <rect x="46" y="14" width="28" height="50" rx="14" /><path d="M36 50a24 24 0 0 0 48 0" /><path d="M60 74v24M46 104h28" />
    </g>
  ),
  car: (
    <g {...S}>
      <path d="M8 78V66c0-6 4-10 10-11l14-3 14-14h34l16 16 12 2c4 1 6 4 6 8v14z" />
      <path d="M50 44h28l12 12H44z" /><circle cx="32" cy="80" r="10" /><circle cx="90" cy="80" r="10" />
      <path d="M8 78h14M42 80h38M100 80h12" />
    </g>
  ),
  sparkle: (
    <g {...S}>
      <path d="M60 14c4 28 12 36 40 40-28 4-36 12-40 40-4-28-12-36-40-40 28-4 36-12 40-40z" />
      <path d="M96 84c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12z" />
    </g>
  ),
};

/** The main drawing and its smaller companion, per trade. */
const BY_TRADE = {
  photographer: ['camera', 'photo'],
  videographer: ['video', 'camera'],
  photo_video: ['camera', 'video'],
  dj: ['mixer', 'headphones'],
  makeup: ['lipstick', 'brush'],
  cake: ['cake', 'sparkle'],
  florist: ['flowers', 'sparkle'],
  bartender: ['cocktail', 'sparkle'],
  caterer: ['cloche', 'sparkle'],
  planner: ['calendar', 'sparkle'],
  musician: ['notes', 'mic'],
  transportation: ['car', 'sparkle'],
  other: ['sparkle', null],
};

export default function ProfessionArt({ trade }) {
  const [main, second] = BY_TRADE[trade] || [];
  if (!main) return null;                       // "None": a plain page
  return (
    <>
      <svg className="iq-art" viewBox="0 0 120 120" aria-hidden="true">{ART[main]}</svg>
      {second && <svg className="iq-art iq-art-2" viewBox="0 0 120 120" aria-hidden="true">{ART[second]}</svg>}
    </>
  );
}
