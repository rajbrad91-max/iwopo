/**
 * 📊 Recording who visited and who downloaded what.
 *
 * Nothing was recorded before this, so an analytics page had nothing to show.
 *
 * ⚠️ Recording must never break the thing being recorded. A visitor whose
 * gallery failed to open because an analytics row would not insert has lost
 * something real over something nobody would miss — so every call here
 * swallows its own errors and nothing awaits the result.
 *
 * 🔒 On the visitor's address. It is TRUNCATED on the way in, never stored
 * whole: 203.0.113.47 becomes 203.0.113.0, and an IPv6 address keeps only its
 * first four groups. Enough to tell two cities apart, not enough to identify a
 * person. A vendor's clients never agreed to be tracked by us, and "we only
 * kept it for analytics" is not a defence anybody accepts.
 */
import geoip from 'geoip-lite';
import prisma from '../config/prisma.js';

/** nginx sits in front, so the real address is in the forwarded header. */
function callerIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || '';
}

/** Drop the part that identifies one household. */
export function truncateIp(ip) {
  if (!ip) return null;
  const clean = String(ip).replace(/^::ffff:/, '');
  if (clean.includes(':')) return clean.split(':').slice(0, 4).join(':') + '::';   // IPv6 → /64
  const p = clean.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0` : null;                      // IPv4 → /24
}

/** Three buckets, not the whole user-agent — the string itself is a fingerprint. */
function uaKind(ua = '') {
  const s = String(ua).toLowerCase();
  if (/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp/.test(s)) return 'bot';
  if (/mobile|android|iphone|ipad/.test(s)) return 'mobile';
  return 'desktop';
}

/**
 * Note something that happened. Fire and forget — never awaited by a route.
 *
 * @param {object} req
 * @param {number} vendorId   whose site or gallery this was
 * @param {string} kind       site_view | gallery_open | photo_download | zip_download | file_download
 * @param {object} [extra]    { targetId, label }
 */
export function recordEvent(req, vendorId, kind, extra = {}) {
  const vid = Number(vendorId);
  if (!vid || !kind) return;

  const ip = callerIp(req);
  const geo = ip ? geoip.lookup(ip) : null;
  const ref = String(req.headers.referer || req.headers.referrer || '').slice(0, 300) || null;

  prisma.site_events.create({
    data: {
      vendor_id: vid,
      kind: String(kind).slice(0, 24),
      target_id: extra.targetId != null ? Number(extra.targetId) : null,
      label: extra.label ? String(extra.label).slice(0, 200) : null,
      ip_prefix: truncateIp(ip),
      country: geo?.country ? String(geo.country).slice(0, 2) : null,
      referrer: ref,
      ua_kind: uaKind(req.headers['user-agent']),
    },
  }).catch(() => { /* analytics must never cost somebody their gallery */ });
}

/**
 * 🧹 Events older than a year.
 *
 * Kept long enough to compare this season with last, and no longer — a table
 * that only grows is a bill nobody decided to pay, and old visitor data is a
 * liability rather than an asset.
 */
export async function sweepOldEvents() {
  try {
    const { count } = await prisma.site_events.deleteMany({
      where: { created_at: { lt: new Date(Date.now() - 365 * 864e5) } },
    });
    if (count) console.log('[events] swept', count, 'older than a year');
    return count;
  } catch { return 0; }
}
