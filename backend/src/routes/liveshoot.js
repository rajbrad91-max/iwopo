/**
 * 🎥 A live shoot — everybody sees only themselves.
 *
 * A gallery hands one link to a couple and shows everything. A live shoot
 * hands one link to a whole wedding, and each guest proves who they are with a
 * selfie to see the photographs they are in.
 *
 * The machinery already existed: every photograph is clustered by face as it
 * arrives, so this compares one selfie against those clusters. Nothing new is
 * indexed and nothing is recomputed.
 *
 * 🔒 The selfie is NOT stored. It is written to a temporary file, turned into
 * 128 numbers, and deleted in a finally block. A guest at somebody's wedding
 * did not agree to us keeping a photograph of their face, and a folder of
 * selfies is a liability nobody asked for.
 */
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { getFaceDescriptors, faceDistance } from '../lib/faceEngine.js';

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 12 * 1024 * 1024 } });

/* Looser than the clustering threshold on purpose. Clustering decides whether
   two photographs from the same camera are the same person; this compares a
   phone selfie in bad light against that. Too tight and a guest is told they
   are in none of their own photographs, which is the worse failure — they can
   see a photograph that is not them and shrug. */
const DEFAULT_MATCH = 0.58;

/** GET /api/live/:token → what this link is, before anybody proves anything. */
router.get('/:token', async (req, res) => {
  try {
    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true, title: true, cover_photo: true, vendor_id: true, faces_clustered: true },
    });
    if (!a) return res.status(404).json({ error: 'Not found' });

    const clusters = await prisma.face_clusters.count({ where: { album_id: a.id } });
    const photos = await prisma.photos.count({ where: { album_id: a.id } });
    res.json({
      album: { title: a.title, cover_photo: a.cover_photo },
      photos, people: clusters,
      /* Said plainly, because "no photographs found" during the indexing lag
         would read as "you are in none of them". */
      still_indexing: !a.faces_clustered,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/live/:token/match → a selfie in, that person's photographs out.
 */
router.post('/:token/match', upload.single('selfie'), async (req, res) => {
  const tmp = req.file?.path;
  try {
    if (!tmp) return res.status(400).json({ error: 'Send a photo of yourself.' });

    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true, vendor_id: true, selfie_strictness: true },
    });
    if (!a) return res.status(404).json({ error: 'Not found' });

    const found = await getFaceDescriptors(tmp);
    if (!found?.length) {
      return res.status(400).json({ error: "I couldn't find a face in that — try again with better light, looking at the camera." });
    }
    if (found.length > 1) {
      return res.status(400).json({ error: 'There is more than one face in that photo. Send one of just you.' });
    }
    const me = found[0].descriptor;

    const clusters = await prisma.face_clusters.findMany({
      where: { album_id: a.id },                      // 🔒 this album only
      select: { id: true, centroid: true },
    });

    const limit = a.selfie_strictness ? a.selfie_strictness / 100 : DEFAULT_MATCH;
    const mine = clusters
      .map(c => ({ id: c.id, d: faceDistance(me, c.centroid) }))
      .filter(c => Number.isFinite(c.d) && c.d <= limit)
      .sort((x, y) => x.d - y.d);

    if (!mine.length) return res.json({ matched: false, photos: [] });

    const links = await prisma.photo_faces.findMany({
      where: { cluster_id: { in: mine.map(m => m.id) } },
      select: { photo_id: true },
    });
    const ids = [...new Set(links.map(l => l.photo_id))];

    const photos = await prisma.photos.findMany({
      where: { id: { in: ids }, album_id: a.id },     // 🔒 belt and braces
      select: { id: true, filename: true, thumb_path: true, preview_path: true },
      orderBy: { filename: 'asc' },
    });

    /* A short-lived pass, so the gallery page can fetch these images without
       re-uploading the selfie for every thumbnail. It names the photographs it
       covers, so it cannot be used to see anything else. */
    const pass = crypto.randomBytes(24).toString('base64url');
    res.json({
      matched: true,
      pass,
      count: photos.length,
      photos: photos.map(p => ({ id: p.id, filename: p.filename })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    /* Always, on every path. The selfie does not outlive the request. */
    if (tmp) await fs.unlink(tmp).catch(() => {});
  }
});

export default router;
