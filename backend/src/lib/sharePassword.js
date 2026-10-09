/**
 * 🔑 Passwords on things that are shared: gallery albums and File Flyer links.
 *
 * These were stored as typed and compared with ===, so anyone who could read
 * the database could read every couple's gallery. They are hashed now, the same
 * way account passwords always have been.
 *
 * The hash is what every login checks. File Flyer share passwords are hash
 * only. GALLERY passwords additionally keep an encrypted copy so the vendor's
 * eye button can show them — see sealPassword() below for why and the cost.
 *
 * bcrypt at cost 12, matching the account passwords. That is deliberately slow
 * — about 200ms a check — which is what makes guessing expensive. Both doors
 * are also rate limited at twelve attempts per fifteen minutes.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const COST = 12;

/* ════════════════════════════════════════════════════════════════════════
   👁️ A readable copy, for the vendor's eye button — GALLERY passwords only.

   Raj decided (2026-10-09) that a vendor must be able to see a gallery's
   password again: it is something they email to a couple, and "what was our
   password?" should not mean resetting it for everybody.

   So a gallery password is stored TWICE:
     • bcrypt hash  — the ONLY thing the client gallery's login ever checks
     • AES-256-GCM  — the copy the panel's eye button decrypts
   The key is derived from JWT_SECRET, so nothing new has to be set on the
   server. ⚠️ The trade: anyone holding BOTH the database AND the .env can read
   these. Account passwords are NOT handled this way and never should be.
   ════════════════════════════════════════════════════════════════════════ */
function sealKey() {
  return Buffer.from(crypto.hkdfSync('sha256', process.env.JWT_SECRET, 'iwopo', 'gallery-password-v1', 32));
}

/** Encrypt a typed gallery password for later display. Null in, null out. */
export function sealPassword(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sealKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

/** Decrypt, or null when there is nothing readable (an album set before this). */
export function openPassword(sealed) {
  try {
    const [v, iv, tag, enc] = String(sealed || '').split('.');
    if (v !== 'v1' || !iv || !tag || !enc) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

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
