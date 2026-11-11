/**
 * 🙂 Face indexing and finding someone by a selfie.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import fs from 'fs';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { getFaceDescriptors, findMatches } from '../../lib/faceEngine.js';
import { isUsableFace } from '../../lib/portraitScore.js';
import { searchBySelfie } from '../../lib/faceAWS.js';
import { indexAlbumNow } from '../../lib/faceQueue.js';
import { getSetting } from '../../lib/settings.js';
import { serverError } from '../../lib/httpError.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { upload } from './shared.js';

const router = express.Router();

// 🧠 index faces for an album (runs detection on all un-indexed photos)
router.post('/:id/index-faces', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });
    // run one throttled pass via the shared queue worker (single-worker, yields between photos)
    const r = await indexAlbumNow(id);
    res.json({ requested: r.requested, remaining: r.remaining });
  } catch (e) { serverError(res, e); }
});

// 🔍 search album by selfie → returns matching photo IDs (vendor preview/testing)
router.post('/:id/face-search', requireAuth, upload.single('selfie'), async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });
    if (!req.file) return res.status(400).json({ error: 'No selfie uploaded' });

    const engine = await getSetting('face_engine', 'vladmandic');

    let ids = [];
    if (engine === 'aws') {
      // ☁️ one call: AWS searches this album's Rekognition collection
      const matches = await searchBySelfie(id, req.file.path, 80);
      fs.unlinkSync(req.file.path);
      if (matches.length) {
        const rows = await prisma.album_faces.findMany({
          where: { album_id: id, vendor_id: v, rekognition_face_id: { in: matches.map(m => m.faceId) } }, // 🔒 tenancy
          select: { photo_id: true },
        });
        ids = [...new Set(rows.map(r => r.photo_id))];
      }
    } else {
      const photos = await prisma.photos.findMany({
        where: { album_id: id, vendor_id: v, face_indexed: true, face_count: { gt: 0 } }, // 🔒 tenancy
        select: { id: true, faces: true },
      });
      // @vladmandic: descriptor vectors
      const q = await getFaceDescriptors(req.file.path);
      fs.unlinkSync(req.file.path);
      if (!q.length) return res.status(400).json({ error: 'No face found in selfie' });
      const candidates = [];
      for (const p of photos) {
        for (const f of (p.faces || [])) if (f.descriptor && isUsableFace(f)) candidates.push({ photo_id: p.id, descriptor: f.descriptor });
      }
      const matches = findMatches(q[0].descriptor, candidates)   // the engine's own "same person" limit;
      const seen = new Set();
      for (const m of matches) { if (!seen.has(m.photo_id)) { seen.add(m.photo_id); ids.push(m.photo_id); } }
    }
    res.json({ matches: ids.length, photo_ids: ids, engine });
  } catch (e) { serverError(res, e); }
});

export default router;
