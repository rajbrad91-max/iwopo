/**
 * 🍪 Proof that somebody passed a gate, as a cookie that cannot be forged.
 *
 * ⚠️ The File Flyer password and the portal's Secure Login both used to set a
 * cookie whose value was simply "1". The server then believed any request
 * carrying `ff_<id>=1` — and share ids and lead ids are small, sequential
 * numbers. Typing that cookie into a browser's devtools walked straight past
 * the password, so the gate only ever stopped people who did not know that.
 *
 * The value is now an HMAC over what the gate actually protects. It names the
 * gate, the row, and a fingerprint of the secret that was checked (the share's
 * password hash, the lead's email), so:
 *   • it cannot be made up without the server's secret
 *   • a cookie for one share or lead is useless on another
 *   • changing the password, or the email on file, retires every old cookie
 */
import crypto from 'node:crypto';

function mac(kind, id, fingerprint) {
  /* JWT_SECRET is required at boot by checkEnv, so there is no fallback here —
     a silent default secret is exactly the kind of thing that gets forgotten. */
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`${kind}.${id}.${fingerprint ?? ''}`)
    .digest('base64url');
}

/** The value to set once the gate has been passed. */
export function gateValue(kind, id, fingerprint) {
  return mac(kind, id, fingerprint);
}

/** Does this cookie value prove the gate was passed for this row, as it is now? */
export function gatePassed(value, kind, id, fingerprint) {
  if (!value) return false;
  const want = Buffer.from(mac(kind, id, fingerprint));
  const got = Buffer.from(String(value));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Read one cookie by name, without cookie-parser for the sake of one value. */
export function cookieOf(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
