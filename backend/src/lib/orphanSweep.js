/**
 * 🧹 Gallery files that nothing points at any more.
 *
 * Raj, 2026-10-09: "if a vendor deletes albums or photos it should completely
 * delete them — no orphans, no stale photos piling up in storage." Every delete
 * route already removes its own files, but some leftovers cannot be prevented
 * at the moment they happen:
 *   • an upload stopped half way — files written, the photo row never created
 *   • the server restarting in the middle of a batch
 *   • anything an older build failed to remove
 * Seen on staging: album "GreatTest" kept 3 objects in R2 with no photo row
 * after an interrupted upload, and /tmp held 36 MB of half-received files.
 *
 * So this sweeps, on a timer, rather than trusting every path to be perfect.
 *
 * 🔒 Safety rules, all deliberate:
 *   • Only touches vendor/<id>/galleries/… in the PRIVATE bucket. File Flyer,
 *     site images and logos are not this sweep's business.
 *   • A file is only an orphan if NO photo row names it and it is not one of
 *     the album's current cover files.
 *   • Nothing younger than GRACE_MS is touched — a photo's files land a moment
 *     before its row does, and an upload in progress must never lose a file.
 *   • If the database read fails, nothing is deleted. An empty "referenced"
 *     list must never be mistaken for "everything is an orphan".
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../config/prisma.js';
import { GALLERIES_ROOT } from '../config/paths.js';
import * as objects from './objectStore.js';

const GRACE_MS = 60 * 60_000;              // 1 hour
const TMP_GRACE_MS = 6 * 60 * 60_000;      // a 4 GB film at 1.6 MB/s is ~45 minutes; 6 h is ample
/* multer's landing folders — files here are the raw bodies of requests that
   either finished (and were moved/removed) or died half way */
const TMP_DIRS = ['/tmp/vf_uploads', '/tmp/iwopo-selfie', '/tmp/iwopo_files'];

/** The files an album legitimately owns: every tier of every photo, plus its cover. */
async function ownedNames() {
  const [albums, photos] = await Promise.all([
    prisma.albums.findMany({ select: { id: true, vendor_id: true, cover_photo: true } }),
    prisma.photos.findMany({ select: { album_id: true, storage_path: true, preview_path: true, thumb_path: true } }),
  ]);
  const byAlbum = new Map(albums.map(a => [a.id, { vendor: a.vendor_id, names: new Set(), coverBase: a.cover_photo ? a.cover_photo.replace(/\.webp$/, '') : null }]));
  for (const p of photos) {
    const a = byAlbum.get(p.album_id);
    if (!a) continue;
    for (const rel of [p.storage_path, p.preview_path, p.thumb_path]) if (rel) a.names.add(path.basename(rel));
  }
  return byAlbum;
}

function isOwned(album, name) {
  if (!album) return false;                                     // the album itself is gone
  if (album.names.has(name)) return true;
  // cover.webp, cover_tall.webp, cover_master.webp
  return !!album.coverBase && name.startsWith(album.coverBase);
}

/**
 * @param {{ dryRun?: boolean }} opts  dryRun reports without deleting anything
 */
export async function sweepGalleryOrphans({ dryRun = false } = {}) {
  const out = { r2: 0, r2Bytes: 0, disk: 0, tmp: 0, tmpBytes: 0, dryRun };
  let owned;
  try { owned = await ownedNames(); }
  catch (e) { console.error('[orphans] database read failed — nothing deleted:', e.message); return out; }
  const now = Date.now();

  /* ☁️ R2 — every vendor's gallery prefix */
  if (await objects.enabled(objects.PRIVATE)) {
    const vendors = await prisma.vendors.findMany({ select: { id: true } });
    for (const v of vendors) {
      let keys;
      try { keys = await objects.listAll(objects.PRIVATE, `vendor/${v.id}/galleries/`); }
      catch (e) { console.error('[orphans] list failed for vendor', v.id, e.message); continue; }
      for (const k of keys) {
        const parts = k.key.split('/');                         // vendor / id / galleries / album / name
        const album = owned.get(Number(parts[3]));
        if (album && album.vendor !== v.id) continue;           // 🔒 never judge another vendor's prefix
        if (isOwned(album, parts[parts.length - 1])) continue;
        if (k.at && now - new Date(k.at).getTime() < GRACE_MS) continue;
        out.r2++; out.r2Bytes += k.size || 0;
        if (!dryRun) await objects.deleteObject(objects.PRIVATE, k.key).catch(() => {});
      }
    }
  }

  /* 💽 disk — <root>/<vendor>/<album>/file left behind locally */
  try {
    for (const vDir of fs.readdirSync(GALLERIES_ROOT, { withFileTypes: true })) {
      if (!vDir.isDirectory() || !/^\d+$/.test(vDir.name)) continue;
      for (const aDir of fs.readdirSync(path.join(GALLERIES_ROOT, vDir.name), { withFileTypes: true })) {
        if (!aDir.isDirectory() || !/^\d+$/.test(aDir.name)) continue;
        const album = owned.get(Number(aDir.name));
        if (album && album.vendor !== Number(vDir.name)) continue;
        const dir = path.join(GALLERIES_ROOT, vDir.name, aDir.name);
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          const st = fs.statSync(full);
          if (!st.isFile() || isOwned(album, f) || now - st.mtimeMs < GRACE_MS) continue;
          out.disk++;
          if (!dryRun) fs.unlinkSync(full);
        }
      }
    }
  } catch { /* no local gallery folder at all — nothing to sweep */ }

  /* 🧺 half-received request bodies */
  for (const dir of TMP_DIRS) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const f of names) {
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || now - st.mtimeMs < TMP_GRACE_MS) continue;
        out.tmp++; out.tmpBytes += st.size;
        if (!dryRun) fs.unlinkSync(full);
      } catch { /* gone already */ }
    }
  }

  if (out.r2 || out.disk || out.tmp) {
    console.log(`[orphans] ${dryRun ? 'would remove' : 'removed'} R2 ${out.r2} (${Math.round(out.r2Bytes / 1048576)} MB), disk ${out.disk}, temp ${out.tmp} (${Math.round(out.tmpBytes / 1048576)} MB)`);
  }
  return out;
}
