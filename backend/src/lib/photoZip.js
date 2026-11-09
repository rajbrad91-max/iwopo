import archiver from 'archiver';

/**
 * 📦 Zips of photographs and films (Raj, 2026-11-08).
 *
 * STORED, not compressed: a JPEG or a film is already compressed, so squeezing it again saves almost nothing and
 * costs the server a great deal of work. Stored, the Zip is the same size, its first byte leaves sooner, and several
 * clients downloading at once no longer slow the server down for everyone else.
 *
 * IN PARTS: a big download is cut into Zips of at most ZIP_PART_BYTES, in the gallery's own order, so a connection
 * that drops repeats one part rather than ten gigabytes. A single file larger than a part is a part of its own.
 * File Flyer and the editor portal keep their own compressed Zips — they can carry documents, where it helps.
 */
/* 4 GB — Raj's choice (2026-11-08), counted the way drives are labelled (4,000,000,000 bytes): a part then stays
   below the 4 GB single-file limit of FAT32 USB sticks and memory cards, Zip overhead included. */
export const ZIP_PART_BYTES = 4_000_000_000;

/** a Zip that stores its files as they are */
export const photoZip = () => archiver('zip', { store: true });

/** the rows, in the order given, cut into consecutive parts of at most ZIP_PART_BYTES (by photos.size_bytes) */
export function zipParts(rows) {
  const parts = [];
  let cur = null;
  for (const r of rows) {
    const size = Number(r.size_bytes) || 0;
    if (!cur || (cur.rows.length && cur.bytes + size > ZIP_PART_BYTES)) { cur = { rows: [], bytes: 0 }; parts.push(cur); }
    cur.rows.push(r);
    cur.bytes += size;
  }
  return parts;
}
