import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { newJti, tokenStillValid } from '../lib/tokenRevocation.js';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Verify token, attach req.user = { id, role, vendor_id }
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  let payload;
  try {
    payload = jwt.verify(header.split(' ')[1], SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  /* A valid signature is no longer enough. The token may have been cancelled by
     a logout, or by a password change that cancelled every token this user
     holds. Answered from a short-lived cache, so the common case — a token that
     is perfectly fine — costs nothing. */
  if (!await tokenStillValid(payload)) {
    return res.status(401).json({ error: 'Session ended — please sign in again' });
  }
  req.user = payload;
  next();
}

// Only super_admin allowed
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin only' });
  }
  next();
}

export function signToken(user) {
  /* jti — a unique id for this token. Without one, "log out" can only mean
     "forget it in the browser": there is no way to name the token you want
     cancelled. */
  return jwt.sign(
    { id: user.id, role: user.role, vendor_id: user.vendor_id, jti: newJti() },
    SECRET,
    { expiresIn: '7d' }
  );
}
