/**
 * ðŸŽžï¸ Raw Selector â€” RAW uploads and their status, per album.
 *
 * ðŸ”’ PRIVATE: mounted behind gate('rawsel'), a services.is_private feature that
 * is off for every vendor unless Super Admin switches it on. The vendor always
 * comes from the login token, an album is only ever one of theirs, and an
 * upload key is rebuilt from both before anything is recorded.
 */
import express from 'express';
import path from 'node:path';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import * as objects from '../lib/objectStore.js';
import { wouldExceed } from '../lib/storageQuota.js';
import { recordObject } from '../lib/storageLedger.js';
import { isRaw, stemOf, rawKey, pairAlbum, albumStatus, deleteRaws } from '../lib/rawFiles.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);
const MAX_FILES = 20;                         // per begin/complete, like gallery photos
const MAX_BYTES = 200 * 1024 * 1024;          // a camera RAW is 25â€“60 MB

async function ownAlbum(req, res) {
  const album = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: vid(req) }, select: { id: true } });
  if (!album) res.status(404).json({ error: 'Album not found' });
  return album;
}

/** How this album's RAWs stand (paired / waiting / missing). */
router.get('/albums/:albumId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    res.json(await albumStatus(a.id, vid(req)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Upload addresses for RAW files â€” straight from the browser to the private bucket. */
router.post('/albums/:albumId/begin', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    if (!await objects.enabled(objects.PRIVATE)) return res.status(409).json({ error: 'Storage is not available' });
    const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, MAX_FILES) : [];
    if (!files.length) return res.status(400).json({ error: 'No files' });
    for (const f of files) {
      if (!isRaw(f?.name)) return res.status(400).json({ error: `${String(f?.name || 'A file').slice(0, 80)} is not a camera RAW file` });
      const size = Number(f?.size);
      if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Every file needs its size' });
      if (size > MAX_BYTES) return res.status(413).json({ error: `${String(f.name).slice(0, 80)} is over 200 MB` });
    }
    const over = await wouldExceed(vid(req), files.reduce((n, f) => n + Number(f.size), 0));
    if (over) return res.status(413).json(over);
    const items = [];
    for (const f of files) {
      const safe = path.basename(String(f.name)).replace(/[^\w.-]+/g, '_').slice(-120);
      const key = rawKey(vid(req), a.id, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
      items.push({ name: f.name, key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
    }
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Record RAWs that have landed, and pair them with their JPEGs. */
router.post('/albums/:albumId/complete', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    const v = vid(req);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_FILES) : [];
    let saved = 0; const errors = [];
    for (const it of items) {
      const leaf = path.basename(String(it?.key || ''));
      // ðŸ”’ rebuilt from the token's vendor and this album: anyone else's key is refused
      if (!leaf || it.key !== rawKey(v, a.id, leaf) || !isRaw(leaf)) { errors.push('Not your file'); continue; }
      const head = await objects.headObject(objects.PRIVATE, it.key);
      if (!head) { errors.push(`${String(it.name || leaf).slice(0, 80)} did not arrive`); continue; }
      const size = Number(head.size || 0);
      const over = await wouldExceed(v, size);
      if (over) { await objects.deleteObject(objects.PRIVATE, it.key).catch(() => {}); errors.push('over_quota'); continue; }
      await recordObject(objects.PRIVATE, it.key, size).catch(() => {});
      const filename = path.basename(String(it.name || leaf)).slice(0, 200);
      const stem = stemOf(filename);
      // the same RAW uploaded again replaces the old copy rather than doubling it
      const old = await prisma.raw_files.findUnique({ where: { album_id_stem: { album_id: a.id, stem } } });
      if (old && old.object_key !== it.key) await deleteRaws({ id: old.id });
      await prisma.raw_files.upsert({
        where: { album_id_stem: { album_id: a.id, stem } },
        create: { vendor_id: v, album_id: a.id, filename, stem, object_key: it.key, size_bytes: BigInt(size) },
        update: { filename, object_key: it.key, size_bytes: BigInt(size) },
      });
      saved++;
    }
    await pairAlbum(a.id, v);
    res.json({ saved, errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Delete one RAW. */
router.delete('/albums/:albumId/raws/:rawId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    const n = await deleteRaws({ id: Number(req.params.rawId), album_id: a.id, vendor_id: vid(req) });
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Delete every RAW in the album (the panel asks first). */
router.delete('/albums/:albumId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    res.json({ deleted: await deleteRaws({ album_id: a.id, vendor_id: vid(req) }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
