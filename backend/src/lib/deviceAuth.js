/**
 * 🔑 Authenticating a machine rather than a person.
 *
 * A login token lasts seven days, so a watcher using one stops every week —
 * and stops silently, which is the worst kind. A device token does not expire.
 *
 * 🔒 The trade for that is scope. This token lives in a config file on a laptop
 * that goes to weddings. If the laptop walks off, whoever has it can add
 * photographs to one vendor's albums and nothing else: no leads, no deletions,
 * no password change, no client details. And it can be revoked from the panel
 * the moment it is missed.
 */
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

/** A token and its hash. The plain one is shown once and never stored. */
export function mintToken() {
  const plain = 'iwd_' + crypto.randomBytes(24).toString('base64url');
  return { plain, hash: hashToken(plain) };
}

/* SHA-256 rather than bcrypt, deliberately: this is a 192-bit random secret,
   not a password somebody chose. There is no dictionary to attack, and every
   upload verifies it — bcrypt at cost 12 would add a tenth of a second to each
   photograph in a shoot of several hundred. */
export function hashToken(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

/**
 * Express middleware for the FEW routes a device may reach.
 *
 * 🔒 Opt-in, not fall-through. requireAuth still refuses a device token
 * everywhere else — jwt.verify simply fails on one — so a route is closed to
 * devices until somebody deliberately opens it. That is the right way round
 * for a credential sitting in a config file on a laptop: forgetting to protect
 * a new route leaves it protected, rather than leaving it open.
 *
 * A person's normal token still works on these routes, so the panel and the
 * watcher use the same endpoints.
 */
export async function deviceOrAuth(req, res, next) {
  const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw.startsWith('iwd_')) return requireAuth(req, res, next);   // a person, not a machine

  try {
    const row = await prisma.device_tokens.findFirst({
      where: { token_hash: hashToken(raw), revoked_at: null },
      select: { id: true, vendor_id: true, scope: true },
    });
    if (!row) return res.status(401).json({ error: 'That device token is not valid.' });

    /* Shaped like a normal user so downstream routes need no special case —
       every tenancy check already reads req.user.vendor_id. */
    req.user = { id: null, vendor_id: row.vendor_id, role: 'device', device_id: row.id, scope: row.scope };
    req.isDevice = true;

    /* Last seen, best effort. A vendor looking at the list wants to know the
       watcher is alive, and a write failing here must not fail an upload. */
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    prisma.device_tokens.update({
      where: { id: row.id },
      data: { last_used: new Date(), last_ip: ip },
    }).catch(() => {});

    return next();
  } catch {
    return res.status(401).json({ error: 'That device token is not valid.' });
  }
}
