/**
 * 📁 The order a gallery's folders appear in.
 *
 * The Videos folder always sits last, whatever order the folders were made in.
 * Its sort_order is set when the first film is uploaded, so an album where a
 * film arrived before any photograph folder existed put Videos first — and a
 * couple opening the gallery met the films before the pictures they came for.
 *
 * Sorted here rather than in the query because it has to be identical in the
 * vendor's panel and on the client's page, and those read from three different
 * places. One function, three callers, no chance of them drifting.
 */
export const VIDEO_FOLDER = 'Videos';

export function orderEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const av = a.name === VIDEO_FOLDER ? 1 : 0;
    const bv = b.name === VIDEO_FOLDER ? 1 : 0;
    if (av !== bv) return av - bv;                      // films last
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
  });
}
