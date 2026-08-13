/**
 * 🏷️ The one list of vendor professions.
 *
 * Used in three places that used to disagree: the inquiry form's background
 * watermark, the professions advertised on the public page, and the super
 * panel's Vendors by Type. Three separate hand-written lists meant the public
 * page advertised Venues and Hair stylists that a vendor could not pick, while
 * the panel charted Editors and 360 Booths that existed nowhere else.
 *
 * The key is what `inquiry_settings.background` stores, so adding a profession
 * here adds it everywhere at once — and existing vendors keep their key.
 */
export const PROFESSIONS = {
  none: { label: 'None', icon: '' },              // watermark only — not a profession
  photographer: { label: 'Photographer', icon: '📷' },
  videographer: { label: 'Videographer', icon: '🎥' },
  photo_video: { label: 'Photo & Video', icon: '🎬' },
  dj: { label: 'DJ', icon: '🎧' },
  makeup: { label: 'Make-Up Artist', icon: '💄' },
  cake: { label: 'Cake Maker', icon: '🎂' },
  florist: { label: 'Florist / Floor Wrapper', icon: '💐' },
  bartender: { label: 'Bartender', icon: '🍸' },
  caterer: { label: 'Caterer', icon: '🍽️' },
  planner: { label: 'Wedding Planner', icon: '📋' },
  musician: { label: 'Musician / Singer', icon: '🎶' },
  transportation: { label: 'Transportation', icon: '🚗' },
  other: { label: 'Other', icon: '✨' },
};

/** Every real profession — everything except "None", which means no watermark. */
export const PROFESSION_LIST = Object.entries(PROFESSIONS)
  .filter(([k]) => k !== 'none')
  .map(([key, v]) => ({ key, ...v }));

export function professionLabel(key) {
  return (PROFESSIONS[key] || PROFESSIONS.none).label;
}
