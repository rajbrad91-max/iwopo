/**
 * 🎟️ Cancelling a token before it expires.
 *
 * A JWT is trusted on its signature alone, which is what makes it fast — no
 * lookup per request. It is also why one cannot be taken back: until this,
 * logging out threw the token away in the browser and left it perfectly valid
 * on the wire for the rest of its seven days, and a stolen laptop could not be
 * locked out at all.
 *
 * Two mechanisms, because they answer different questions:
 *
 *   • ONE token, by its jti — this is Log out. Signing out on a phone should
 *     not sign the desktop out too.
 *   • EVERY token a user holds, by refusing any issued before a moment — this
 *     is a password change, or an admin locking someone out. The "I think
 *     someone got into my account" case, where precision is the wrong instinct.
 *
 * The cost is a lookup per request, so both answers are cached in memory for a
 * few seconds. That is the deliberate trade: a cancelled token may survive for
 * up to CACHE_MS, and in exchange the common case — a token that is perfectly
 * fine — costs nothing. The window is short enough that "log out" feels
 * immediate and long enough that a busy panel is not querying on every call.
 *
 * ⚠️ This cache is per process, and correct only because pm2 runs ONE instance
 * in fork mode. Moving to cluster mode would give each worker its own cache and
 * its own few seconds of staleness.
 */
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';

const CACHE_MS = 5_000;

const revokedCache = new Map();      // jti → { revoked, at }
const validFromCache = new Map();    // userId → { validFrom, at }

/** A unique id for a token, so it can be named later. */
export function newJti() {
  return crypto.randomBytes(16).toString('hex');
}

/** Has this specific token been cancelled? */
async function isRevoked(jti) {
  if (!jti) return false;                       // issued before jti existed — see verifyRevocation
  const hit = revokedCache.get(jti);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.revoked;
  let revoked;
  try {
    revoked = !!await prisma.revoked_tokens.findUnique({ where: { jti }, select: { jti: true } });
  } catch { revoked = false; }                  // a database blip must not lock everyone out
  revokedCache.set(jti, { revoked, at: Date.now() });
  return revoked;
}

/** The moment before which every one of this user's tokens is refused. */
async function validFrom(userId) {
  const hit = validFromCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.validFrom;
  let vf;
  try {
    const u = await prisma.users.findUnique({
      where: { id: Number(userId) }, select: { tokens_valid_from: true },
    });
    vf = u?.tokens_valid_from ? new Date(u.tokens_valid_from).getTime() : null;
  } catch { vf = null; }
  validFromCache.set(userId, { validFrom: vf, at: Date.now() });
  return vf;
}

/**
 * Is this payload still acceptable? Called after the signature has been checked.
 *
 * A token signed before this existed has no jti. It is NOT refused — that would
 * sign every vendor out the moment this deploys — but it is still subject to
 * the user-wide cutoff, so a password change catches it.
 */
export async function tokenStillValid(payload) {
  if (!payload?.id) return true;
  if (await isRevoked(payload.jti)) return false;
  const vf = await validFrom(payload.id);
  if (vf && payload.iat && payload.iat * 1000 < vf) return false;
  return true;
}

/** Cancel one token — Log out. */
export async function revokeToken(payload) {
  if (!payload?.jti || !payload?.id) return false;
  const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 7 * 864e5);
  try {
    await prisma.revoked_tokens.upsert({
      where: { jti: payload.jti },
      update: {},
      create: { jti: payload.jti, user_id: Number(payload.id), expires_at: expiresAt },
    });
  } catch { return false; }
  revokedCache.set(payload.jti, { revoked: true, at: Date.now() });
  return true;
}

/** Cancel every token a user holds — password change, or locking an account. */
export async function revokeAllForUser(userId) {
  const now = new Date();
  try {
    await prisma.users.update({
      where: { id: Number(userId) }, data: { tokens_valid_from: now },
    });
  } catch { return false; }
  validFromCache.set(Number(userId), { validFrom: now.getTime(), at: Date.now() });
  return true;
}

/**
 * 🧹 Drop rows for tokens that would have expired anyway.
 *
 * Without this the table grows for ever and never shrinks — one row per logout,
 * kept long after the token it names became worthless.
 */
export async function sweepRevoked() {
  try {
    const { count } = await prisma.revoked_tokens.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    if (count) console.log('[tokens] swept', count, 'expired revocations');
    return count;
  } catch { return 0; }
}
