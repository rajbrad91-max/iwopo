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
  none: { label: 'None' },              // watermark only — not a profession
  photographer: { label: 'Photographer' },
  videographer: { label: 'Videographer' },
  photo_video: { label: 'Photo & Video' },
  dj: { label: 'DJ' },
  makeup: { label: 'Make-Up Artist' },
  cake: { label: 'Cake Maker' },
  florist: { label: 'Florist / Floor Wrapper' },
  bartender: { label: 'Bartender' },
  caterer: { label: 'Caterer' },
  planner: { label: 'Wedding Planner' },
  musician: { label: 'Musician / Singer' },
  transportation: { label: 'Transportation' },
  other: { label: 'Other' },
};

/** Every real profession — everything except "None", which means no watermark. */
export const PROFESSION_LIST = Object.entries(PROFESSIONS)
  .filter(([k]) => k !== 'none')
  .map(([key, v]) => ({ key, ...v }));

export function professionLabel(key) {
  return (PROFESSIONS[key] || PROFESSIONS.none).label;
}
