import * as objects from '../lib/objectStore.js';
import { recordEvent } from '../lib/siteEvents.js';
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
 * 🔒 Neither the selfie NOR the face numbers are stored. The photo becomes 128
 * numbers, those are compared, and both are gone before the response is sent.
 * A guest at somebody's wedding did not agree to us keeping a photograph of
 * their face, and a folder of selfies is a liability nobody asked for.
 *
 * 🎟️ A device does not have to prove itself twice. A successful match sets a
 * signed cookie naming the clusters this device matched, good for fourteen
 * days — so somebody checks once and can come back all week. The cookie holds
 * cluster ids and an album, nothing biometric: if it leaks it unlocks those
 * photographs and nothing else, which a stored face descriptor could not
 * promise. And because it names CLUSTERS rather than photographs, pictures
 * taken later in the shoot appear for that guest as they arrive.
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

/* Fourteen days, as Raj asked. Long enough that a guest who looks on the night
   can come back the following weekend; short enough that a borrowed phone does
   not carry access indefinitely. */
const PASS_DAYS = 14;

/* One header, parsed by hand. cookie-parser would be a dependency, a middleware
   on every request in the app, and a supply-chain surface, to read a single
   value on three routes. */
function cookieFrom(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** The pass, from the cookie or from a header the page can send. */
function passFor(req, albumId) {
  const token = cookieFrom(req, 'live_pass_' + albumId)
    || String(req.headers['x-live-pass'] || '')
    || String(req.query.pass || '');
  return readPass(token, albumId);
}

/** Sign what this device proved, so it need not prove it again. */
function mintPass(albumId, clusterIds) {
  const body = JSON.stringify({ a: albumId, c: clusterIds, exp: Date.now() + PASS_DAYS * 864e5 });
  const payload = Buffer.from(body).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'iwopo').update(payload).digest('base64url');
  return payload + '.' + sig;
}

/**
 * Read a pass back, or null.
 *
 * ⚠️ The signature is checked BEFORE the contents are trusted. Without that,
 * anybody could edit the cluster list in their own cookie and see every guest's
 * photographs — the whole point of the selfie undone by a text editor.
 */
export function readPass(token, albumId) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expect = crypto.createHmac('sha256', process.env.JWT_SECRET || 'iwopo').update(payload).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now()) return null;              // expired
    if (Number(data.a) !== Number(albumId)) return null; // a pass for another album
    return data;
  } catch { return null; }
}

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

    /* Somebody who proved themselves last week should land straight on their
       photographs, not on a camera prompt they have already satisfied. */
    const pass = passFor(req, a.id);

    res.json({
      already_matched: !!pass,
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

    const pass = mintPass(a.id, mine.map(m => m.id));
    /* httpOnly so no script on the page can read it, sameSite lax so following
       the link from a message still carries it. */
    res.cookie('live_pass_' + a.id, pass, {
      httpOnly: true, sameSite: 'lax', secure: true,
      maxAge: PASS_DAYS * 864e5,
    });
    res.json({
      matched: true,
      pass,
      valid_days: PASS_DAYS,
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

/**
 * GET /api/live/:token/mine → this device's photographs.
 *
 * 🔒 The clusters come from the SIGNED pass, never from the request. A guest
 * asking for cluster 9 gets what their own pass says, not what they typed.
 */
router.get('/:token/mine', async (req, res) => {
  try {
    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true },
    });
    if (!a) return res.status(404).json({ error: 'Not found' });

    const pass = passFor(req, a.id);
    if (!pass) return res.status(401).json({ error: 'Send a photo of yourself first.' });

    const links = await prisma.photo_faces.findMany({
      where: { cluster_id: { in: pass.c.map(Number) } },
      select: { photo_id: true },
    });
    const photos = await prisma.photos.findMany({
      where: { id: { in: [...new Set(links.map(l => l.photo_id))] }, album_id: a.id },  // 🔒 this album only
      select: { id: true, filename: true },
      orderBy: { filename: 'asc' },
    });
    res.json({ count: photos.length, photos, expires: pass.exp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/live/:token/photo/:id/:size → one image.
 *
 * 🔒 Two walls, both needed. The photograph must be in THIS album, and it must
 * be in a cluster this device's pass names. Checking only the album would hand
 * any guest the whole shoot by counting upwards through the ids.
 */
router.get('/:token/photo/:id/:size', async (req, res) => {
  try {
    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true, vendor_id: true },
    });
    if (!a) return res.status(404).end();

    const pass = passFor(req, a.id);
    if (!pass) return res.status(401).end();

    const id = Number(req.params.id);
    const allowed = await prisma.photo_faces.findFirst({
      where: { photo_id: id, cluster_id: { in: pass.c.map(Number) } },
      select: { photo_id: true },
    });
    if (!allowed) return res.status(404).end();            // not this person's photograph

    const p = await prisma.photos.findFirst({
      where: { id, album_id: a.id },                       // 🔒 and it must be this album's
      select: { storage_path: true, preview_path: true, thumb_path: true, filename: true },
    });
    if (!p) return res.status(404).end();

    const size = req.params.size;
    const rel = size === 'orig' ? p.storage_path : size === 'preview' ? p.preview_path : p.thumb_path;
    if (!rel) return res.status(404).end();

    const seg = String(rel).split('/').filter(Boolean);
    const key = `vendor/${a.vendor_id}/galleries/${seg[1]}/${seg[2]}`;

    if (size === 'orig') {
      recordEvent(req, a.vendor_id, 'photo_download', { targetId: id, label: p.filename });
      res.setHeader('Content-Disposition', `attachment; filename="${p.filename}"`);
    }
    /* getStream, not getObject — the latter does not exist, which lint could
       not catch because objects is a namespace import. */
    const obj = await objects.getStream(objects.PRIVATE, key);
    if (!obj?.stream) return res.status(404).end();
    /* ⚠️ Not obj.contentType. R2 hands back application/octet-stream for these
       objects, and a browser will not draw an <img> that claims to be a binary
       download — the request succeeds, the bytes are a perfectly good WEBP, and
       the grid stays blank. Inferred from the extension instead, which is the
       thing that is actually true. */
    const ext = String(rel).split('.').pop().toLowerCase();
    const mime = ext === 'webp' ? 'image/webp'
      : ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'mp4' ? 'video/mp4'
      : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    obj.stream.pipe(res);
  } catch { res.status(404).end(); }
});

export default router;
