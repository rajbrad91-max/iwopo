/**
 * 🎥 Uploading videos and their posters.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import * as objects from '../../lib/objectStore.js';
import { wouldExceed } from '../../lib/storageQuota.js';
import { VIDEO_FOLDER } from '../../lib/albumEvents.js';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { dropLocal } from '../../lib/localFile.js';
import { serverError } from '../../lib/httpError.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { ROOT, galleryKey } from './shared.js';

const router = express.Router();

/**
 * Films get their own limit. 200MB is generous for a photograph and refuses
 * almost every wedding film. This is still a single request, so a dropped
 * connection loses the upload — resumable multipart is the follow-up, and it is
 * where vendors will feel the pain first.
 */
const uploadVideo = multer({
  dest: '/tmp/vf_uploads',
  limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 2 },
  fileFilter: (req, f, cb) => {
    const ok = f.fieldname === 'poster' ? /^image\//.test(f.mimetype) : /^video\//.test(f.mimetype);
    cb(ok ? null : Object.assign(new Error('Wrong file type'), { status: 400 }), ok);
  },
});

/**
 * 🎬 The folder films live in.
 *
 * Films go to their own event rather than into whichever one the vendor happens
 * to be looking at. A wedding film dropped among four hundred photographs of
 * the Mehndi is lost, and the grid has to reason about two kinds of thing in
 * one place. One folder, created the first time a film is uploaded, and never
 * created for an album that has none.
 *
 * Sorted last on purpose: the photographs are what a couple opens the gallery
 * for, and the films should not push them down the page.
 */
async function videoEventId(albumId, vendorId) {
  const existing = await prisma.album_events.findFirst({
    where: { album_id: albumId, vendor_id: vendorId, name: VIDEO_FOLDER },  // 🔒 tenancy
    select: { id: true },
  });
  if (existing) return existing.id;

  const top = await prisma.album_events.aggregate({
    where: { album_id: albumId },
    _max: { sort_order: true },
  });
  const made = await prisma.album_events.create({
    data: {
      album_id: albumId, vendor_id: vendorId,                               // 🔒 tenancy
      name: VIDEO_FOLDER, sort_order: (top._max.sort_order || 0) + 1,
    },
    select: { id: true },
  });
  return made.id;
}

/**
 * 🎬 Upload one film.
 *
 * Deliberately one per request, not fifty. A wedding film is gigabytes where a
 * photograph is megabytes, and batching them means one dropped connection loses
 * the lot. One at a time also lets the panel show real progress per film.
 *
 * Nothing is transcoded. The vendor uploads a finished MP4 and it is stored as
 * it is — no ffmpeg on this box, and none needed while the file is already
 * something a browser can play. Whether it actually plays is a property of the
 * VIEWER, not the file: Safari decodes HEVC and Chrome on Windows does not. The
 * player deals with that by offering a download when decoding fails.
 *
 * The poster frame is drawn by the browser before upload — it can already
 * decode the file it is about to send — which is why this needs no ffmpeg
 * either. A file the uploader's own browser cannot decode arrives without a
 * poster, and the grid falls back to a plain film tile.
 */
router.post('/:id/videos', requireAuth, uploadVideo.fields([
  { name: 'video', maxCount: 1 },
  { name: 'poster', maxCount: 1 },
]), async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  const file = req.files?.video?.[0];
  const poster = req.files?.poster?.[0];

  const cleanup = () => {
    for (const f of [file, poster]) {
      if (f?.path) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
    }
  };

  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) { cleanup(); return res.status(404).json({ error: 'Album not found' }); }
    if (!file) { cleanup(); return res.status(400).json({ error: 'No file' }); }

    /* 📏 A film is the largest single thing a vendor can upload — gigabytes
       where a photograph is megabytes — so it is the last place that should be
       allowed past the pool. Checked before the file is moved into place. */
    const over = await wouldExceed(v, (file.size || 0) + (poster?.size || 0));
    if (over) { cleanup(); return res.status(413).json(over); }

    const dir = path.join(ROOT, String(v), String(id));
    fs.mkdirSync(dir, { recursive: true });

    const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const ext = (path.extname(file.originalname) || '.mp4').toLowerCase().slice(0, 8);
    const vidName = `${base}_video${ext}`;
    // renamed rather than copied where possible: a 20GB copy doubles the disk
    // used and the time taken, for no gain
    try { fs.renameSync(file.path, path.join(dir, vidName)); }
    catch { fs.copyFileSync(file.path, path.join(dir, vidName)); fs.unlinkSync(file.path); }

    // the poster stands in for both tiers, so the grid and the viewer need no
    // special case for a film
    let thumbName = null, fullName = null;
    if (poster) {
      thumbName = `${base}_thumb.webp`;
      fullName = `${base}_full.webp`;
      await sharp(poster.path).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, thumbName));
      await sharp(poster.path).resize(2200, 2200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, fullName));
      fs.unlinkSync(poster.path);
    }

    /* ☁️ And to R2, which this route never did — it was written before object
       storage existed and was missed when the rest of the gallery moved across.
       A film uploaded this way lived only on the VPS disk, so it was absent
       from every backup and every assumption made elsewhere about where
       gallery media lives. */
    if (await objects.enabled(objects.PRIVATE)) {
      for (const n of [vidName, thumbName, fullName].filter(Boolean)) {
        try {
          await objects.putObject(objects.PRIVATE, galleryKey(v, id, n),
            fs.createReadStream(path.join(dir, n)));
          dropLocal(path.join(dir, n));
        } catch (e) { console.error('[video] R2 upload failed for', n, e.message); }
      }
    }

    const rel = (n) => (n ? `${v}/${id}/${n}` : null);
    const dur = Number(req.body.duration_s);
    const photo = await prisma.photos.create({
      data: {
        album_id: id, vendor_id: v,               // 🔒 tenancy stamped on the row
        kind: 'video',
        filename: file.originalname,
        storage_path: rel(vidName),
        thumb_path: rel(thumbName),
        preview_path: rel(fullName),
        // a film costs its own size plus the two poster tiers
        size_bytes: BigInt([vidName, thumbName, fullName].reduce((n, x) => {
          try { return x ? n + fs.statSync(path.join(dir, x)).size : n; } catch { return n; }
        }, 0)),
        duration_s: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
        // a film is never sent to the face engine, so it is marked done rather
        // than left to sit in the backlog forever
        face_indexed: true,
        // always the Videos folder, whatever tab the vendor happens to be on
        event_id: await videoEventId(id, v),
      },
    });
    res.status(201).json({ photo: { ...photo, size_bytes: photo.size_bytes == null ? null : Number(photo.size_bytes) } });
  } catch (e) { cleanup(); serverError(res, e); }
});

/* ══════════════════════════════════════════════════════════════════════
   ⬆️ Direct-to-R2 upload for large films.

   Three endpoints, and the browser does the carrying. A hundred-gigabyte film
   cannot come through this server at all — R2 refuses a single PUT over 5GB,
   and staging it in /tmp then moving it would need twice the file's size in
   free disk. So the browser is handed a signed URL per part and talks to
   Cloudflare directly.

   🔒 Every one of these checks the album belongs to the caller before it does
   anything, and the object key is built from the token's vendor id. A signed
   part URL is scoped to one key, so it cannot be repointed by editing it.
   ══════════════════════════════════════════════════════════════════════ */

// begin — reserve a key and hand back an upload id
router.post('/:id/videos/begin', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });
    if (!await objects.enabled(objects.PRIVATE)) {
      return res.status(400).json({ error: 'Direct upload needs R2 storage to be configured' });
    }

    const size = Number(req.body?.size_bytes);
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'size_bytes required' });

    /* 📏 Asked before a single byte moves. The browser reports the size, so it
       is checked again on completion against what actually landed — a client
       under-reporting here would otherwise walk past the plan. */
    const over = await wouldExceed(v, size);
    if (over) return res.status(413).json(over);

    const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(String(req.body?.filename || '')).toLowerCase().slice(0, 8) || '.mp4';
    const name = `${base}_video${ext}`;
    const key = galleryKey(v, id, name);
    const uploadId = await objects.beginMultipart(objects.PRIVATE, key, req.body?.content_type || 'video/mp4');

    /* S3 refuses a multipart upload where any part except the last is under
       5 MiB, and it refuses it at the END — every part uploads happily and then
       completion fails, which is a miserable way to lose an hour of a vendor's
       time. 64MB is well clear of that and keeps the part count sane: a 100GB
       film is 1600 parts rather than 20000. */
    res.json({
      upload_id: uploadId, key, name,
      part_size: 64 * 1024 * 1024,
      min_part_size: 5 * 1024 * 1024,               // anything smaller will be rejected on completion
    });
  } catch (e) { serverError(res, e); }
});

// sign — one part at a time, so a resumed upload only re-signs what it needs
router.post('/:id/videos/sign', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });

    const { key, upload_id: uploadId } = req.body || {};
    const part = Number(req.body?.part_number);
    if (!key || !uploadId || !Number.isInteger(part) || part < 1) {
      return res.status(400).json({ error: 'key, upload_id and part_number required' });
    }
    /* 🔒 The key comes back from the client, so it is checked against the
       prefix this vendor and album own. Without this, a caller could sign a
       part for another vendor's key and write into their gallery. */
    if (key !== galleryKey(v, id, path.basename(key))) {
      return res.status(403).json({ error: 'Not your key' });
    }

    res.json({ url: await objects.signPart(objects.PRIVATE, key, uploadId, part) });
  } catch (e) { serverError(res, e); }
});

// complete — stitch the parts, then record the film
router.post('/:id/videos/complete', requireAuth, uploadVideo.single('poster'), async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });

    const { key, upload_id: uploadId } = req.body || {};
    if (!key || !uploadId) return res.status(400).json({ error: 'key and upload_id required' });
    if (key !== galleryKey(v, id, path.basename(key))) {                                             // 🔒
      return res.status(403).json({ error: 'Not your key' });
    }

    await objects.completeMultipart(objects.PRIVATE, key, uploadId);

    /* The real size, measured on the object rather than taken from the client.
       If it turns out not to fit after all, the film is removed again rather
       than left occupying space nobody agreed to. */
    const head = await objects.headObject(objects.PRIVATE, key);
    const actual = Number(head?.size || 0);
    const over = await wouldExceed(v, actual);
    if (over) {
      await objects.deleteObject(objects.PRIVATE, key);
      return res.status(413).json(over);
    }

    const name = path.basename(key);
    const dur = Number(req.body?.duration_s);

    /* 🖼 The poster the browser drew before uploading. It comes through this
       server rather than going direct, because it is a few hundred kilobytes
       rather than a few hundred gigabytes — and it has to be resized into the
       same two tiers a photograph uses, so the grid and the viewer need no
       special case for a film. Without it a film shows as a blank tile. */
    const base = name.replace(/_video\.[^.]+$/, '');
    let thumbName = null, fullName = null;
    if (req.file) {
      const dir = path.join(ROOT, String(v), String(id));
      fs.mkdirSync(dir, { recursive: true });
      thumbName = `${base}_thumb.webp`;
      fullName = `${base}_full.webp`;
      try {
        await sharp(req.file.path).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, thumbName));
        await sharp(req.file.path).resize(2200, 2200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, fullName));
        if (await objects.enabled(objects.PRIVATE)) {
          for (const n2 of [thumbName, fullName]) {
            await objects.putObject(objects.PRIVATE, galleryKey(v, id, n2), fs.createReadStream(path.join(dir, n2)));
            dropLocal(path.join(dir, n2));
          }
        }
      } catch (e) {
        // a missing poster is a plain tile, not a failed upload
        console.error('[video] poster failed for', name, e.message);
        thumbName = null; fullName = null;
      }
      try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    }

    const rel = (n2) => (n2 ? `${v}/${id}/${n2}` : null);
    const photo = await prisma.photos.create({
      data: {
        album_id: id, vendor_id: v,                    // 🔒 tenancy stamped on the row
        kind: 'video',
        filename: String(req.body?.filename || name).slice(0, 200),
        storage_path: `${v}/${id}/${name}`,
        thumb_path: rel(thumbName),
        preview_path: rel(fullName),
        size_bytes: BigInt(actual),
        duration_s: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
        face_indexed: true,                            // a film never goes to the face engine
        event_id: await videoEventId(id, v),
      },
    });
    res.status(201).json({ photo: { ...photo, size_bytes: Number(photo.size_bytes) } });
  } catch (e) { serverError(res, e); }
});

// abandon — a vendor who cancels should not leave parts costing storage
router.post('/:id/videos/abort', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });
    const { key, upload_id: uploadId } = req.body || {};
    if (!key || !uploadId) return res.status(400).json({ error: 'key and upload_id required' });
    if (key !== galleryKey(v, id, path.basename(key))) return res.status(403).json({ error: 'Not your key' });  // 🔒
    await objects.abortMultipart(objects.PRIVATE, key, uploadId);
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

export default router;
