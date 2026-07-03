import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Verify token, attach req.user = { id, role, vendor_id }
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const payload = jwt.verify(header.split(' ')[1], SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Only super_admin allowed
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin only' });
  }
  next();
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, vendor_id: user.vendor_id },
    SECRET,
    { expiresIn: '7d' }
  );
}
