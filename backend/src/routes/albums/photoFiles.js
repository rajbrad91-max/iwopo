/**
 * 🖼️ Finishing an upload, deleting a photo, and serving its files.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import * as objects from '../../lib/objectStore.js';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { forgetPhotoFacesAWS } from '../../lib/faceAWSIndex.js';
import { uploadsFinished } from '../../lib/faceQueue.js';
import { tokenStillValid } from '../../lib/tokenRevocation.js';
import { serverError } from '../../lib/httpError.js';
import { noteFailure } from '../../lib/noteFailure.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { ROOT } from './shared.js';

const router = express.Router();

/**
 * 📤 The panel calls this when its upload loop ends, so grouping does not have
 * to wait out the quiet window. Purely an optimisation — the debounce still
 * fires on its own if this never arrives, which is what covers a closed tab.
 */
router.post('/:id/uploads-done', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } });  // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });
    res.json(await uploadsFinished(id));
  } catch (e) { serverError(res, e); }
});

// 🔒 delete a photo (tenant-checked)
router.delete('/:id/photos/:photoId', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const where = { id: Number(req.params.photoId), album_id: Number(req.params.id), vendor_id: v }; // 🔒 tenancy
  try {
    // fetch the file paths first so we can remove all tiers from disk after the row is gone
    const p = await prisma.photos.findFirst({
      where,
      select: { storage_path: true, preview_path: true, thumb_path: true },
    });
    if (!p) return res.status(404).json({ error: 'Not found' });

    // ☁️ drop this photo's faces from the album's Rekognition collection too,
    // otherwise AWS keeps storing faces whose photo no longer exists
    try { await forgetPhotoFacesAWS(req.params.id, req.params.photoId); } catch (e) { noteFailure('remove a deleted photo’s faces from AWS', e); /* best effort */ }

    await prisma.photos.deleteMany({ where });

    /* Remove every tier from BOTH places. Deleting only the local copy left the
       objects in R2 with nothing pointing at them — invisible, permanent, and
       still counted against the vendor's storage pool, so a vendor who tidied
       up their gallery would watch their space refuse to come back.

       The row is already gone at this point, so a failure here leaks an object
       rather than blocking the delete: better a stray file than a photograph a
       vendor cannot remove. */
    const r2on = await objects.enabled(objects.PRIVATE);
    for (const rel of [p.storage_path, p.preview_path, p.thumb_path]) {
      if (!rel) continue;
      try { fs.unlinkSync(path.join(ROOT, rel)); } catch { /* already gone — fine */ }
      if (r2on) {
        const parts = String(rel).split('/').filter(Boolean);
        if (parts.length >= 3) {
          try { await objects.deleteObject(objects.PRIVATE, objects.keyFor(v, 'galleries', parts[1], parts[2])); }
          catch (e) { console.error('[gallery] R2 delete failed for', rel, e.message); }
        }
      }
    }
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🔒 serve a gallery file — token via header OR ?token= (for <img src>). type = thumb|preview|orig
router.get('/file/:photoId/:type', async (req, res) => {
  const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
  const tok = (req.headers.authorization?.split(' ')[1]) || req.query.token;
  let user;
  try { user = jwt.verify(tok, SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  // 🎟️ the signature is fine, but the token may have been cancelled since
  if (!await tokenStillValid(user)) return res.status(401).json({ error: 'Session ended' });
  const v = user.vendor_id;
  try {
    const p = await prisma.photos.findFirst({
      where: { id: Number(req.params.photoId), vendor_id: v },   // 🔒 tenancy
    });
    if (!p) return res.status(404).json({ error: 'Not found' });
    const rel = req.params.type === 'orig' ? p.storage_path : req.params.type === 'preview' ? p.preview_path : p.thumb_path;

    /* A film has no poster when the browser could not draw one, so thumb_path
       is null and this used to throw on path.join — a 500 rather than a plain
       404, which the panel showed as a broken tile. */
    if (!rel) return res.status(404).json({ error: 'No file of that kind' });

    /* And R2. This route was written before object storage and never moved
       across, so anything uploaded straight to the bucket — which is every
       large film — had no local copy for it to find. The panel could not show
       a thumbnail, a preview or the film itself. */
    if (await objects.enabled(objects.PRIVATE)) {
      const parts = String(rel).split('/').filter(Boolean);
      if (parts.length >= 3) {
        try {
          const o = await objects.getStream(objects.PRIVATE,
            objects.keyFor(v, 'galleries', parts[1], parts[2]), req.headers.range);
          /* ⚠️ Not R2's answer when it is a generic one. It reports
             application/octet-stream for these objects, and a browser will not
             decode an <img> that claims to be a binary download — the request
             succeeds, the bytes are a perfectly good photograph, and the tile
             stays blank. Inferred from the extension instead, which is the
             thing that is actually true. Same fault as the live-shoot
             thumbnails had. */
          const ext = String(rel).split('.').pop().toLowerCase();
          const guess = ext === 'webp' ? 'image/webp'
            : ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : ext === 'mp4' ? 'video/mp4'
            : ext === 'mov' ? 'video/quicktime'
            : 'image/jpeg';
          res.setHeader('Content-Type',
            o.contentType && o.contentType !== 'application/octet-stream' ? o.contentType : guess);
          res.setHeader('Accept-Ranges', 'bytes');
          if (o.contentRange) { res.status(206); res.setHeader('Content-Range', o.contentRange); }
          if (o.size) res.setHeader('Content-Length', o.size);
          return o.stream.pipe(res);
        } catch { /* not in R2 — fall through to the disk */ }
      }
    }

    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(full, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  } catch (e) { serverError(res, e); }
});

export default router;
