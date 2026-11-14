/**
 * ✉️ "New sign-in" email (Raj, 2026-11-14): when an account is signed in on a device it has not used before, the
 * account holder gets one email from iwopo's no-reply address saying which browser and roughly which city. That
 * replaces the old Settings → Security list. Fire-and-forget: an email problem never stops a sign-in.
 */
import geoip from 'geoip-lite';
import { clientIp } from './clientIp.js';
import { notice } from './emailCodes.js';

/** "Chrome · Android" from a browser's user-agent — enough to recognise your own phone or laptop. */
export function deviceOf(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /Android/.test(s) ? 'Android' : /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Windows/.test(s) ? 'Windows'
    : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

const countryName = (code) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
};

/** "Vancouver, BC, Canada" from the network address — approximate, and null when it cannot be told */
export function placeOf(req) {
  const g = geoip.lookup(clientIp(req) || '');
  if (!g) return null;
  return [g.city, g.region, g.country && countryName(g.country)].filter(Boolean).join(', ') || null;
}

/** email the account holder that a device it has not used before just signed in */
export function newDeviceAlert(req, user) {
  if (!user?.email) return;
  const device = deviceOf(req.headers?.['user-agent']).replace(' · ', ' on ');
  const place = placeOf(req);
  notice(user.email, 'New sign-in to your iwopo account', [
    'Your iwopo account was just signed in on a new device.',
    `Browser: ${device}`,
    `Location: ${place ? `${place} (approximate)` : 'unknown'}`,
  ]);
}
