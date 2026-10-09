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
import { getFaceDescriptors, faceDistance, selfieLimit } from '../lib/faceEngine.js';
import { isUsableFace } from '../lib/portraitScore.js';

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 12 * 1024 * 1024 } });

/* ⚠️ Was 0.58, on the reasoning that a guest told they appear in none of their
   own photographs is worse than one shown a picture of somebody else. That
   reasoning was wrong for a live shoot, and the data says so plainly: on a real
   album of ten people, FIVE of the forty-five pairs of DIFFERENT people sit
   closer than 0.58. At that setting the matcher cannot tell them apart at all —
   which is exactly what Raj saw, a selfie pulling in other men in turbans.
   Under 0.48 not one pair collides.

   And showing somebody else's photographs is not a shrug here. A gallery is one
   couple's; a live shoot hands a link to two hundred guests, and a stranger
   seeing your photographs is a privacy failure rather than an annoyance. A
   guest who is told to try again has lost a moment. */
/* 2026-10-09: on AuraFace the same caution is DIST.match; a saved
   "selfie strictness" (set on the parked engine's 0.48 scale) is mapped
   onto it by selfieLimit() so it keeps its meaning. */


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

    /* 🎨 The photographer's own name and mark, not iwopo's. A guest at a
       wedding has never heard of the platform — they know the studio, and the
       page they are handed should look like it came from them. Read from the
       vendor rather than hardcoded, so this is right for whoever owns the
       album rather than right for one of them. */
    const v = await prisma.vendors.findUnique({
      where: { id: a.vendor_id },
      select: { business_name: true, logo_path: true, phone: true, email: true },
    });

    /* The studio's own tagline and links, from the website they already built
       here. A guest who likes their photographs should be one tap from finding
       the photographer — that is the whole commercial point of handing out
       this link. */
    const site = await prisma.vendor_sites.findFirst({
      where: { vendor_id: a.vendor_id },
      select: { tagline: true, instagram: true, facebook: true, slug: true,
                contact_email: true, contact_phone: true },
    });

    const clusters = await prisma.face_clusters.count({ where: { album_id: a.id } });
    const photos = await prisma.photos.count({ where: { album_id: a.id } });

    /* 🖼️ One photograph from the shoot, for the backdrop.
       A page of type on cream is a form however nicely it is set. A picture
       from the evening behind it is what makes a guest feel they are in the
       right place — and the album already has hundreds. The cover if there is
       one, otherwise simply the first. */
    const heroRow = await prisma.photos.findFirst({
      where: { album_id: a.id, thumb_path: { not: null } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    /* ⏱️ When the most recent photograph landed.
       The page wants to say how fast this is, and a real "added four minutes
       ago" is worth more than any slogan: a guest can check it against the
       moment they were photographed. A boast nobody can verify is just
       marketing; this is evidence. */
    const newest = await prisma.photos.findFirst({
      where: { album_id: a.id },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });

    /* Somebody who proved themselves last week should land straight on their
       photographs, not on a camera prompt they have already satisfied. */
    const pass = passFor(req, a.id);

    res.json({
      already_matched: !!pass,
      album: { title: a.title, cover_photo: a.cover_photo },
      /* 🔒 An id, not a path. The image is fetched through the route below,
         which is public for previews but still scoped to this album. */
      hero: heroRow?.id || null,
      studio: {
        name: v?.business_name || null,
        logo: v?.logo_path || null,
        tagline: site?.tagline || null,
        instagram: site?.instagram || null,
        facebook: site?.facebook || null,
        site: site?.slug ? `/site/${site.slug}` : null,
        email: site?.contact_email || v?.email || null,
        phone: site?.contact_phone || v?.phone || null,
      },
      photos, people: clusters,
      latest_at: newest?.created_at || null,
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

    /* ⚠️ Individual faces, not cluster centroids.
       A centroid is an AVERAGE of everybody in a cluster, so a person
       photographed in varied light becomes a blur that can sit closer to
       someone else than to their own pictures. The gallery has always compared
       against individual descriptors, and measured on this same album that
       gives 42 correct hits and ZERO strangers at 0.48 — where centroid
       matching let strangers through. Same method here now. */
    const indexed = await prisma.photos.findMany({
      where: { album_id: a.id, face_indexed: true, face_count: { gt: 0 } },  // 🔒 this album only
      select: { id: true, faces: true },
    });

    const limit = selfieLimit(a.selfie_strictness);

    const ranked = [];
    for (const p of indexed) {
      (p.faces || []).forEach((f, k) => {
        // 👤 same rule as the circles: a back-of-head fingerprint is not a face
        if (!f.descriptor || !isUsableFace(f)) return;
        const d = faceDistance(me, f.descriptor);
        if (Number.isFinite(d)) ranked.push({ photo_id: p.id, k, d });
      });
    }
    ranked.sort((x, y) => x.d - y.d);

    const best = ranked[0];
    if (!best || best.d > limit) return res.json({ matched: false, photos: [] });

    /* ⚠️ The old code took EVERY cluster under the threshold, so one selfie
       matched several different people at once and the guest was shown all of
       their photographs. That is the fault Raj hit. Only the best match counts
       now — plus any cluster close enough to it to be the same person split in
       two, which is a different thing from a second person who looks similar. */
    /* Every face under the line belongs to this person. With no averaging to
       be fooled by, a straight threshold is enough — and the measurement says
       so: zero strangers at 0.48 on a real album. */
    const hits = ranked.filter(r => r.d <= limit);
    const ids = [...new Set(hits.map(r => r.photo_id))];

    /* The pass still names CLUSTERS, so photographs taken later in the evening
       appear for this guest as they arrive.
       🚨 Only the circles of the FACES that matched — not every circle linked to
       the matched photographs. A guest in one group shot with the bride used to
       get the bride's circle too, and with it every photograph of the bride. */
    const links = await prisma.photo_faces.findMany({
      where: { OR: hits.map(h => ({ photo_id: h.photo_id, face_index: h.k })) },
      select: { cluster_id: true },
    });
    const mine = [...new Set(links.map(l => l.cluster_id))].map(id => ({ id }));

    /* What is shown is exactly what the pass can open afterwards — the photos
       of those circles. Listing a matched photo the pass cannot reach drew a
       blank tile the guest could never fill. */
    const reach = mine.length ? await prisma.photo_faces.findMany({
      where: { cluster_id: { in: mine.map(m => m.id) } }, select: { photo_id: true },
    }) : [];
    const photos = await prisma.photos.findMany({
      where: { id: { in: [...new Set(reach.map(r => r.photo_id))] }, album_id: a.id },     // 🔒 belt and braces
      select: { id: true, filename: true, thumb_path: true, preview_path: true },
      orderBy: { filename: 'asc' },
    });
    if (!photos.length) return res.json({ matched: false, photos: [], still_indexing: ids.length > 0 });

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
 * GET /api/live/:token/hero/:id → the backdrop photograph.
 *
 * 🔒 Public, and narrowly so: thumbnails only, and only a photograph in THIS
 * album. A guest has not proved who they are yet, so this must not be a way to
 * read the shoot — one small image is the whole grant. The id comes from the
 * landing payload, and anything not in this album is a 404.
 */
router.get('/:token/hero/:id', async (req, res) => {
  try {
    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true, vendor_id: true },
    });
    if (!a) return res.status(404).end();

    const p = await prisma.photos.findFirst({
      where: { id: Number(req.params.id), album_id: a.id },     // 🔒 this album only
      select: { thumb_path: true },
    });
    if (!p?.thumb_path) return res.status(404).end();

    const seg = String(p.thumb_path).split('/').filter(Boolean);
    const key = `vendor/${a.vendor_id}/galleries/${seg[1]}/${seg[2]}`;
    const obj = await objects.getStream(objects.PRIVATE, key);
    if (!obj?.stream) return res.status(404).end();

    const ext = String(p.thumb_path).split('.').pop().toLowerCase();
    res.setHeader('Content-Type', ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    obj.stream.pipe(res);
  } catch { res.status(404).end(); }
});

/**
 * POST /api/live/:token/signout → forget this device.
 *
 * A phone gets handed round at a wedding. Whoever has it next should see their
 * own photographs, not the ones belonging to whoever held it first, and there
 * is otherwise no way to be rid of a pass for a fortnight.
 *
 * 🔒 Cleared by overwriting with an expiry in the past as well as clearing it,
 * because a browser that ignores one will honour the other.
 */
router.post('/:token/signout', async (req, res) => {
  try {
    const a = await prisma.albums.findFirst({
      where: { public_token: String(req.params.token), kind: 'liveshoot' },
      select: { id: true },
    });
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.clearCookie('live_pass_' + a.id, { httpOnly: true, sameSite: 'lax', secure: true });
    res.cookie('live_pass_' + a.id, '', { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 0 });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      /* ⚠️ The download NAME must match what is actually in the file.
         A live shoot serves a JPEG whatever was uploaded, so a guest who
         sent a .heic or a .png would otherwise be handed JPEG bytes under
         a name their phone believes is something else — which fails in a
         way nobody could ever diagnose. */
      const stored = String(rel).split('.').pop().toLowerCase();
      const ending = stored === 'webp' ? 'webp' : stored === 'png' ? 'png' : 'jpg';
      const nice = String(p.filename || 'photo').replace(/\.[^.]+$/, '') + '.' + ending;
      res.setHeader('Content-Disposition', `attachment; filename="${nice}"`);
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
