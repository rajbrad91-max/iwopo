/**
 * 🔢 Order filenames the way a person reads them: 2 before 10, not after.
 *
 * A plain string comparison puts "10" before "2", because it compares character
 * by character and '1' sorts before '2'. A wedding delivered that way reads
 * 1, 10, 11, 12, 13, 14, 15, 2, 3 — every photograph present and the story of
 * the day scrambled.
 *
 * This lives in one place because the same album is listed from four: the
 * vendor's panel, the client's grid, a single event, and both zips. They must
 * agree, or a vendor arranges photographs in one order and their couple
 * receives another.
 *
 * A Postgres expression was tried first and cannot work — lpad on a
 * backreference pads the literal string '\1' rather than the digits it matched,
 * because the function is evaluated before the replacement ever happens.
 * Intl.Collator does it correctly and runs on rows already in hand.
 */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Compare two filenames. Exported for callers that sort by more than one key. */
export function byFilename(a, b) {
  return collator.compare(a || '', b || '');
}

/** Sort photo-ish rows by filename, falling back to id so the order is stable. */
export function naturalSort(rows) {
  return [...(rows || [])].sort((a, b) =>
    byFilename(a.filename, b.filename) || ((a.id || 0) - (b.id || 0)));
}
