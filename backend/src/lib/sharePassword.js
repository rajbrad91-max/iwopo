/**
 * 🔑 Passwords on things that are shared: gallery albums and File Flyer links.
 *
 * These were stored as typed and compared with ===, so anyone who could read
 * the database could read every couple's gallery. They are hashed now, the same
 * way account passwords always have been.
 *
 * The consequence is the point of hashing, not a side effect: NOBODY can read
 * one back — not the vendor, not this code, not a database dump. A vendor who
 * forgets a gallery password sets a new one; there is no way to look it up.
 *
 * bcrypt at cost 12, matching the account passwords. That is deliberately slow
 * — about 200ms a check — which is what makes guessing expensive. Both doors
 * are also rate limited at twelve attempts per fifteen minutes.
 */
import bcrypt from 'bcryptjs';

const COST = 12;

/** A value that is already a bcrypt hash — used so a re-save doesn't double-hash. */
export function looksHashed(v) {
  return typeof v === 'string' && /^\$2[aby]\$\d{2}\$/.test(v);
}

/**
 * Hash a password for storage.
 * Returns null for an empty value, so "no password" stays no password rather
 * than becoming a hash of the empty string that nothing could ever match.
 */
export async function hashSharePassword(v) {
  if (v == null || v === '') return null;
  if (looksHashed(v)) return v;                 // already hashed, leave it alone
  return bcrypt.hash(String(v), COST);
}

/**
 * Check a typed password against what is stored.
 *
 * A stored value that is NOT a bcrypt hash is refused rather than compared as
 * text. Falling back to === would leave the old behaviour reachable for any row
 * that escaped the migration, which is the kind of quiet bypass that survives
 * for years.
 */
export async function checkSharePassword(typed, stored) {
  if (!stored) return false;
  if (!looksHashed(stored)) {
    console.error('[password] stored value is not hashed — refusing to compare as text');
    return false;
  }
  try { return await bcrypt.compare(String(typed ?? ''), stored); }
  catch { return false; }
}
