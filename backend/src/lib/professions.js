/**
 * 🧑‍💼 The trades a vendor can choose — the same keys as frontend/src/lib/professions.js (the panel draws their names,
 * icons and watermarks; the server only needs to know which keys are real).
 */
export const PROFESSION_KEYS = new Set([
  'photographer', 'videographer', 'photo_video', 'dj', 'makeup', 'cake', 'florist',
  'bartender', 'caterer', 'planner', 'musician', 'transportation', 'other',
]);

/** A trade as stored: a known key, else "other" (a vendor who does not say is "Other", with its generic sample). */
export const professionOf = (key) => (PROFESSION_KEYS.has(String(key || '')) ? String(key) : 'other');
