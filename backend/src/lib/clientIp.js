/**
 * 🌐 The address a request really came from (2026-11-04).
 *
 * nginx is the only thing in front of the app, and it APPENDS the address it saw to X-Forwarded-For. The header's
 * FIRST entry is therefore whatever the visitor wrote: reading it (as nine places once did) let anyone dodge every
 * rate limit, the two-trials-per-network rule and the e-signature audit trail by sending a made-up address.
 * With trust proxy = 'loopback' (server.js), Express skips nginx itself and req.ip is the address nginx actually
 * saw. Every caller asks here, so there is one rule.
 */
export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}
