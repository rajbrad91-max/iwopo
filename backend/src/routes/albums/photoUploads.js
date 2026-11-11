/**
 * ⬆️ Uploading photos: through the server, or straight to storage (begin / complete).
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import * as objects from '../../lib/objectStore.js';
import { wouldExceed } from '../../lib/storageQuota.js';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { enqueueAlbum, noteUpload } from '../../lib/faceQueue.js';
import { dropLocal } from '../../lib/localFile.js';
import { deviceOrAuth } from '../../lib/deviceAuth.js';
import { renderTiers } from '../../lib/photoSizes.js';
import { enqueuePhotos } from '../../lib/photoProcessor.js';
import { recordObject } from '../../lib/storageLedger.js';
import { serverError } from '../../lib/httpError.js';
import { quiet } from '../../lib/quiet.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { ROOT, galleryKey, upload } from './shared.js';

const router = express.Router();

const DIRECT_MAX_FILES = 20;

const DIRECT_MAX_BYTES = 200 * 1024 * 1024;        // same per-photo limit as the posted path

/** An event id from the request is only believed if it is THIS album's. */
async function eventInAlbum(eventId, albumId, vendorId) {
  const n = parseInt(eventId, 10);
  if (!n) return null;
  const ev = await prisma.album_events.findFirst({ where: { id: n, album_id: albumId, vendor_id: vendorId }, select: { id: true } });
  return ev ? ev.id : null;
}

router.post('/:id/photos', deviceOrAuth, upload.array('photos', 50), async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    /* kind comes back too: a live shoot keeps two tiers rather than three,
       and asking for it here is cheaper than a second query. */
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true, kind: true } });  // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });

    /* 📏 Asked before a single byte is written. A photograph accepted and then
       found not to fit would leave the vendor over their limit with no way back,
       and leave files on disk that nothing points at. The incoming size is the
       originals; the derived tiers add roughly six per cent on top, which is
       absorbed rather than charged. */
    const incoming = (req.files || []).reduce((n, f) => n + (f.size || 0), 0);
    const over = await wouldExceed(v, incoming);
    if (over) {
      for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch { /* gone */ } }
      return res.status(413).json(over);
    }

    const dir = path.join(ROOT, String(v), String(id));
    fs.mkdirSync(dir, { recursive: true });

    /* 🎥 A property of the ALBUM, so decided once rather than per file — and
       above the loop, because the filename is built inside it and needs to
       know. */
    const twoTier = own.kind === 'liveshoot';
    const r2on = await objects.enabled(objects.PRIVATE);

    /** One file to R2 — the size is already known, so no second round trip to ask. */
    const toR2 = (name, size) => objects.putObject(objects.PRIVATE, galleryKey(v, id, name),
      fs.createReadStream(path.join(dir, name)), undefined, size)
      .then(() => { dropLocal(path.join(dir, name)); return true; })   // R2 has it; the VPS need not
      .catch((e) => { console.error('[gallery] R2 upload failed for', name, e.message); return false; });

    const saved = [];
    for (const f of req.files || []) {
      const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const origName = `${base}_orig${path.extname(f.originalname) || '.jpg'}`;
      const thumbName = `${base}_thumb.webp`;
      const fullName = `${base}_full.webp`;

      /* The uploaded file is kept exactly as it arrives — for a gallery the
         camera original, for a live shoot Raj's export — and it is what a
         download serves. It starts on its way to R2 at once, while the screen
         sizes are being made, rather than waiting for them. */
      fs.copyFileSync(f.path, path.join(dir, origName));
      const origSent = r2on ? toR2(origName, f.size) : null;

      // 📐 the two screen sizes — one shared definition, see lib/photoSizes.js
      const { fullSize, thumbSize } = await renderTiers(f.path, dir, { full: fullName, thumb: thumbName }, own.kind);
      const costBytes = f.size + fullSize + thumbSize;

      /* ☁️ The two screen sizes to R2, alongside the original already in
         flight. Failure is logged rather than fatal: the files are on disk and
         every reader falls back there, so an unreachable R2 costs a slower read,
         not a lost wedding. */
      if (r2on) await Promise.all([origSent, toR2(fullName, fullSize), toR2(thumbName, thumbSize)]);
      fs.unlinkSync(f.path);

      const rel = (n) => `${v}/${id}/${n}`;
      const eventId = req.body.event_id ? parseInt(req.body.event_id, 10) : null;
      const photo = await prisma.photos.create({
        data: {
          album_id: id, vendor_id: v,             // 🔒 tenancy stamped on every row
          filename: f.originalname,
          storage_path: rel(origName),
          thumb_path: rel(thumbName),
          preview_path: rel(fullName),
          size_bytes: BigInt(costBytes),
          event_id: eventId,
        },
      });
      // size_bytes is a BigInt, which JSON cannot represent; send it as a
      // number, which is exact for anything under nine petabytes
      saved.push({ ...photo, size_bytes: photo.size_bytes == null ? null : Number(photo.size_bytes) });
    }
    res.status(201).json({ uploaded: saved.length, photos: saved });
    /* 🤳 Faces. A live shoot is indexed at once — guests are standing there
       waiting. A gallery waits until the uploading has stopped (the panel's
       "uploads done", or a quiet spell for a closed tab), so face detection
       never competes with the photographs still coming in. */
    if (twoTier) enqueueAlbum(id); else noteUpload(id);
  } catch (e) {
    /* A file that fails half way (a corrupt JPEG, a dropped connection) used to
       leave every remaining upload of the batch sitting in /tmp. The sweep in
       lib/orphanSweep.js catches anything else that slips through. */
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch { /* moved or gone */ } }
    serverError(res, e);
  }
});

/* ══════════════════════════════════════════════════════════════════════
   🚀 Photos straight to R2 — the panel's upload path (Raj, 2026-10-09).

   "Uploading should happen first: the photo goes to R2, then the system makes
   the thumbnails after, so our VPS is not blocking the upload speed."

     1. begin    — this server checks the album and the space, and hands back
                   one signed URL per photo. Nothing large touches the VPS.
     2. (browser PUTs each original to Cloudflare directly)
     3. complete — the object is checked to really be there, the row is made
                   (ready:false), and photoProcessor makes the two screen
                   sizes in the background, a couple at a time.

   🔒 Tenancy: every key is built HERE from the token's vendor and an album
   already checked against it. A key sent back by the browser is rebuilt and
   compared before it is believed, exactly as the film upload does.
   The Live Shoot watcher still posts through POST /:id/photos above.
   ══════════════════════════════════════════════════════════════════════ */

router.post('/:id/photos/begin', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } });   // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });
    if (!await objects.enabled(objects.PRIVATE)) {
      return res.status(409).json({ error: 'direct_unavailable' });   // the panel falls back to posting
    }
    const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, DIRECT_MAX_FILES) : [];
    if (!files.length) return res.status(400).json({ error: 'No files' });
    for (const f of files) {
      const size = Number(f?.size);
      if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Every file needs its size' });
      if (size > DIRECT_MAX_BYTES) return res.status(413).json({ error: `${String(f.name || 'A file').slice(0, 80)} is over 200 MB` });
    }
    // 📏 asked before a single byte moves — and again on completion, against what really landed
    const over = await wouldExceed(v, files.reduce((n, f) => n + Number(f.size), 0));
    if (over) return res.status(413).json(over);

    const items = [];
    for (const f of files) {
      const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const ext = (path.extname(String(f.name || '')).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg').slice(0, 8);
      const key = galleryKey(v, id, `${base}_orig${ext}`);            // 🔒 vendor from the token
      items.push({ key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
    }
    res.json({ items });
  } catch (e) { serverError(res, e); }
});

router.post('/:id/photos/complete', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true, kind: true } });  // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, DIRECT_MAX_FILES) : [];
    const eventId = await eventInAlbum(req.body?.event_id, id, v);

    const created = [], errors = [];
    for (const it of items) {
      const name = path.basename(String(it?.key || ''));
      /* 🔒 rebuilt from the token's vendor and this album — a key for anybody
         else's prefix, or anything but an original, is refused */
      if (!/_orig\.[a-z0-9]{1,6}$/.test(name) || it.key !== galleryKey(v, id, name)) { errors.push('Not your file'); continue; }

      const rel = `${v}/${id}/${name}`;
      // a retried completion must not make the same photo twice
      const dup = await prisma.photos.findFirst({ where: { album_id: id, storage_path: rel }, select: { id: true } });
      if (dup) { created.push(dup.id); continue; }

      const head = await objects.headObject(objects.PRIVATE, it.key);
      if (!head) { errors.push(`${String(it.filename || name).slice(0, 80)} did not arrive`); continue; }
      const size = Number(head.size || 0);
      const over = await wouldExceed(v, size);                         // measured, not claimed
      if (over) {
        await objects.deleteObject(objects.PRIVATE, it.key).catch(quiet('albums · objects.deleteObject'));
        errors.push('over_quota'); continue;
      }
      /* 📒 the storage ledger only hears about objects this server writes —
         a direct upload has to be entered by hand, or the quota under-counts it */
      await recordObject(objects.PRIVATE, it.key, size).catch(quiet('albums · recordObject'));
      const base = name.replace(/_orig\.[^.]+$/, '');
      const row = await prisma.photos.create({
        data: {
          album_id: id, vendor_id: v,                                  // 🔒 tenancy stamped on the row
          filename: String(it.filename || name).slice(0, 200),
          storage_path: rel,
          preview_path: `${v}/${id}/${base}_full.webp`,                 // made next, by photoProcessor
          thumb_path: `${v}/${id}/${base}_thumb.webp`,
          size_bytes: BigInt(size),                                    // the screen sizes are added when made
          event_id: eventId,
          ready: false,
        },
        select: { id: true },
      });
      created.push(row.id);
    }

    enqueuePhotos(created);
    /* 🤳 faces wait for the upload to end — the processor starts them for a
       live shoot as soon as its photos are ready */
    if (own.kind !== 'liveshoot') noteUpload(id);
    if (errors.includes('over_quota')) return res.status(413).json({ error: 'over_quota', message: 'That would go over your storage limit.', created: created.length });
    res.status(created.length ? 201 : 400).json({ created: created.length, errors });
  } catch (e) { serverError(res, e); }
});

export default router;
