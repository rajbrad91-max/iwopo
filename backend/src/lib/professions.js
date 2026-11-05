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

/** 🤖 Each trade in a few words, as the chat assistant says what kind of business it speaks for. */
export const TRADE_WORDS = {
  photographer: 'photography', videographer: 'videography', photo_video: 'photography & videography', dj: 'DJ',
  makeup: 'makeup', cake: 'cake', florist: 'floral', bartender: 'bartending', caterer: 'catering', planner: 'event planning',
  musician: 'live music', transportation: 'transportation',
};

/** The trades whose chat asks photo / video questions (coverage sides, getting ready, pre-events). */
export const PHOTO_VIDEO_TRADES = new Set(['photographer', 'videographer', 'photo_video']);
