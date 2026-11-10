import geoip from 'geoip-lite';
import prisma from '../config/prisma.js';
import { getFeatures } from './entitlements.js';
import { clientIp } from './clientIp.js';

/**
 * 📊 Gallery download log — a Studio feature, `gallery_insights` (Raj, 2026-11-09).
 *
 * Every photo, film or Zip a client downloads from a gallery is written down with the FULL IP address (Raj's choice),
 * the kind of device and browser, roughly where (geoip-lite, offline — nothing is sent anywhere) and when; the
 * vendor reads it from the 📊 button on the gallery's tile. A full IP is personal data, so it is collected only for a
 * vendor whose plan has the feature — nobody else's clients are logged. Rows go with their gallery (ON DELETE CASCADE).
 * Recording can never fail or slow a download: it is not awaited by the routes, and swallows its own errors.
 *
 * 🟢 Every Zip downloaded: after a Zip is logged, markIfAllDownloaded() looks — once, there and then — at whether every
 * tab's every part (or every part of the whole gallery) has now been downloaded at least once, by anyone, ever. If so,
 * the gallery remembers how many photos it held (albums.downloads_complete_count) and its 📊 button turns green; the
 * panel only reads that number, so nothing is worked out when it loads. Adding or removing photos changes the count,
 * so green always means the gallery as it is now.
 */
export const VISIT_GAP_MS = 30 * 60 * 1000;   // the same IP downloading again within 30 minutes = the same visit

const deviceOf = (ua) => (/tablet|ipad|playbook|silk/i.test(ua) ? 'Tablet' : /mobile|android|iphone|ipod|windows phone/i.test(ua) ? 'Mobile' : 'Desktop');
function browserOf(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung';
  if (/Chrome\/|CriOS/.test(ua)) return 'Chrome';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}
function placeOf(ip) {
  const g = ip ? geoip.lookup(ip) : null;
  return g ? [g.city, g.region, g.country].filter(Boolean).join(', ').slice(0, 120) || null : null;
}

/** note one download: kind 'photo' (a photo or film) or 'zip'; label = the file name, or what the Zip held */
export async function recordDownload(req, album, { kind, label, photoId = null, eventId = null, part = null, parts = null }) {
  try {
    if (!(await getFeatures(album.vendor_id)).has('gallery_insights')) return false;
    const ip = clientIp(req) || 'unknown';
    const ua = String(req.headers['user-agent'] || '');
    await prisma.gallery_downloads.create({
      data: {
        album_id: album.id, photo_id: photoId, kind, label: String(label).slice(0, 300), event_id: eventId, part, parts,
        ip: ip.slice(0, 64), device: deviceOf(ua), browser: browserOf(ua), place: placeOf(ip),
      },
    });
    return true;
  } catch (e) { console.error('[download log]', e.message); return false; }
}

/**
 * Has every Zip of this gallery now been downloaded? `tabs` = [{ eventId, parts }] for each tab with photos, `whole` =
 * the parts of the whole-gallery Zip. A tab's Zip downloaded without a part number held the whole tab.
 */
export async function markIfAllDownloaded(albumId, tabs, whole) {
  try {
    const got = await prisma.gallery_downloads.findMany({ where: { album_id: albumId, kind: 'zip' }, select: { event_id: true, part: true } });
    const has = (ev, n) => got.some(g => g.event_id === ev && (g.part === null || g.part === n));
    const all = (ev, parts) => Array.from({ length: parts }, (_, i) => i + 1).every(n => has(ev, n));
    const done = (tabs.length > 0 && tabs.every(t => all(t.eventId, t.parts))) || (whole > 0 && all(null, whole));
    if (!done) return false;
    const count = await prisma.photos.count({ where: { album_id: albumId } });
    await prisma.albums.update({ where: { id: albumId }, data: { downloads_complete_count: count, downloads_complete_at: new Date() } });
    return true;
  } catch (e) { console.error('[download log]', e.message); return false; }
}

/** a gallery's log as visits (newest first) and totals — the most recent 5000 downloads */
export async function downloadLog(albumId) {
  const rows = (await prisma.gallery_downloads.findMany({
    where: { album_id: albumId },
    orderBy: { created_at: 'desc' },
    take: 5000,
    select: { kind: true, label: true, ip: true, device: true, browser: true, place: true, created_at: true },
  })).reverse();
  const open = new Map();   // ip -> the visit still open for it
  const visits = [];
  for (const r of rows) {
    const at = r.created_at.getTime();
    let v = open.get(r.ip);
    if (!v || at - v.last > VISIT_GAP_MS) {
      v = { ip: r.ip, device: r.device, browser: r.browser, place: r.place, from: r.created_at, to: r.created_at, last: at, items: [] };
      open.set(r.ip, v);
      visits.push(v);
    }
    v.items.push({ kind: r.kind, label: r.label, at: r.created_at });
    v.to = r.created_at; v.last = at;
  }
  visits.sort((a, b) => b.last - a.last);
  return {
    totals: {
      downloads: rows.length,
      photos: rows.filter(r => r.kind === 'photo').length,
      zips: rows.filter(r => r.kind === 'zip').length,
      ips: new Set(rows.map(r => r.ip)).size,
      last: rows.length ? rows[rows.length - 1].created_at : null,
    },
    visits: visits.map(v => ({ ip: v.ip, device: v.device, browser: v.browser, place: v.place, from: v.from, to: v.to, items: v.items })),
  };
}
