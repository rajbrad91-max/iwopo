import prisma from '../config/prisma.js';
import { callerIp } from '../middleware/rateLimit.js';

/**
 * 🛡️ Security log (2026-10-30): sign-ins, wrong passwords, lock-outs, password changes and email confirmations for
 * each account, with when, which device and which network. The account holder sees their own in Settings → Security
 * (GET /api/me/security); nothing here is shown to anyone else. Kept for KEEP_DAYS.
 *
 * Writing is fire-and-forget and never throws — a log that failed must not stop someone signing in.
 */
const KEEP_DAYS = 180;

/** "Chrome · Android" from a browser's user-agent — enough to recognise your own phone or laptop. */
export function deviceOf(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /Android/.test(s) ? 'Android' : /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Windows/.test(s) ? 'Windows'
    : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

/** Record one event for an account ({ id, vendor_id }). Unknown accounts are not logged — there is no one to show. */
export function logSecurity(req, user, event) {
  if (!user?.id) return;
  prisma.security_events.create({
    data: {
      user_id: user.id,
      vendor_id: user.vendor_id ?? null,
      event,
      ip: String(callerIp(req) || '').slice(0, 64) || null,
      device: deviceOf(req.headers?.['user-agent']).slice(0, 120),
    },
  })
    // now and then, clear what is older than the keeping period — no separate job to forget about
    .then(() => (Math.random() < 0.02
      ? prisma.security_events.deleteMany({ where: { created_at: { lt: new Date(Date.now() - KEEP_DAYS * 864e5) } } })
      : null))
    .catch(() => {});
}
