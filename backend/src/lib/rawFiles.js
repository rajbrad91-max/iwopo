/**
 * 🎞️ Raw Selector — camera RAW files behind gallery JPEGs (private feature 'rawsel').
 *
 * Raj, 2026-10-10: he uploads JPEG + RAW together; clients see and pick the
 * JPEGs; his editor later downloads only the RAWs of the picked photos. RAWs
 * live in the PRIVATE bucket under vendor/<id>/raws/<album>/ — never shown to
 * a client, never thumbnailed, never face-scanned. Nothing here runs for a
 * vendor without the feature, and nothing touches the gallery's own files.
 */
import path from 'node:path';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { forgetObject } from './storageLedger.js';

/** Camera RAW formats: Sony, Canon (new + old), Nikon, Fujifilm, Adobe DNG, Panasonic, Olympus. */
export const RAW_EXT = ['.arw', '.cr3', '.cr2', '.nef', '.raf', '.dng', '.rw2', '.orf'];
export const isRaw = (name) => RAW_EXT.includes(path.extname(String(name || '')).toLowerCase());

/** What pairs a RAW with its JPEG: the file name without extension, lower-case. */
export const stemOf = (name) => path.basename(String(name || '')).replace(/\.[^.]+$/, '').toLowerCase().slice(0, 200);

/** Where an album's RAWs live. */
export const rawKey = (vendorId, albumId, name) => objects.keyFor(vendorId, 'raws', String(albumId), name);

/**
 * Pair every RAW in the album that has no JPEG yet with the photo of the same
 * name. Run when RAWs arrive and whenever the album's RAWs are listed — so it
 * does not matter whether the JPEG or the RAW was uploaded first, and the
 * gallery's own upload code needs no change.
 */
export async function pairAlbum(albumId, vendorId) {
  const loose = await prisma.raw_files.findMany({ where: { album_id: albumId, vendor_id: vendorId, photo_id: null }, select: { id: true, stem: true } });
  if (!loose.length) return 0;
  const photos = await prisma.photos.findMany({
    where: { album_id: albumId, vendor_id: vendorId, kind: 'photo' },
    select: { id: true, filename: true },
  });
  const byStem = new Map(photos.map(p => [stemOf(p.filename), p.id]));
  let paired = 0;
  for (const r of loose) {
    const pid = byStem.get(r.stem);
    if (pid) { await prisma.raw_files.update({ where: { id: r.id }, data: { photo_id: pid } }); paired++; }
  }
  return paired;
}

/** How the album's RAWs stand: paired, waiting for a JPEG, and JPEGs with no RAW. */
export async function albumStatus(albumId, vendorId) {
  await pairAlbum(albumId, vendorId);
  const [raws, photos] = await Promise.all([
    prisma.raw_files.findMany({ where: { album_id: albumId, vendor_id: vendorId }, select: { id: true, filename: true, photo_id: true, size_bytes: true, delete_after: true } }),
    prisma.photos.findMany({ where: { album_id: albumId, vendor_id: vendorId, kind: 'photo' }, select: { id: true, filename: true } }),
  ]);
  const withRaw = new Set(raws.filter(r => r.photo_id).map(r => r.photo_id));
  return {
    raws: raws.length,
    paired: withRaw.size,
    jpegs: photos.length,
    bytes: raws.reduce((n, r) => n + Number(r.size_bytes || 0), 0),
    rawsWithoutJpeg: raws.filter(r => !r.photo_id).map(r => ({ id: r.id, filename: r.filename })),
    jpegsWithoutRaw: photos.filter(p => !withRaw.has(p.id)).map(p => p.filename).slice(0, 200),
    deleteAfter: raws.map(r => r.delete_after).filter(Boolean).sort()[0] || null,
  };
}

/** Delete RAW rows and their files. */
export async function deleteRaws(where) {
  const rows = await prisma.raw_files.findMany({ where, select: { id: true, object_key: true } });
  for (const r of rows) {
    await objects.deleteObject(objects.PRIVATE, r.object_key).catch(() => {});
    await forgetObject(objects.PRIVATE, r.object_key).catch(() => {});
  }
  await prisma.raw_files.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
  return rows.length;
}

/* 🧹 Every 10 minutes (server.js):
   • a RAW whose photo was deleted (by the client or the vendor) lost its row
     with the photo — its file, now pointed at by nothing, is removed;
   • RAWs past their delete-after date (30 days after the edited photos were
     delivered) are removed.
   Only vendor/<id>/raws/ is looked at, files younger than an hour are left
   alone (an upload may still be finishing), and if the database read fails
   nothing is deleted. */
const GRACE_MS = 60 * 60 * 1000;
export async function sweepRaws() {
  const due = await deleteRaws({ delete_after: { lt: new Date() } });
  let orphans = 0;
  const vendors = await prisma.raw_files.findMany({ distinct: ['vendor_id'], select: { vendor_id: true } }).catch(() => null);
  const owners = await prisma.vendor_feature_overrides.findMany({ where: { feature_key: 'rawsel', enabled: true }, select: { vendor_id: true } }).catch(() => null);
  if (!vendors || !owners) return { due, orphans };
  const ids = [...new Set([...vendors, ...owners].map(r => r.vendor_id))];
  for (const v of ids) {
    let keys;
    try { keys = await objects.listAll(objects.PRIVATE, `vendor/${v}/raws/`); } catch { continue; }
    if (!keys.length) continue;
    const known = new Set((await prisma.raw_files.findMany({ where: { vendor_id: v }, select: { object_key: true } })).map(r => r.object_key));
    for (const k of keys) {
      if (known.has(k.key) || Date.now() - new Date(k.at).getTime() < GRACE_MS) continue;
      await objects.deleteObject(objects.PRIVATE, k.key).catch(() => {});
      await forgetObject(objects.PRIVATE, k.key).catch(() => {});
      orphans++;
    }
  }
  if (due || orphans) console.log(`[rawsel] removed ${due} RAW(s) past their date, ${orphans} whose photo was deleted`);
  return { due, orphans };
}
