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
import sharp from 'sharp';
import { withLogo, LOGO_DEFAULTS } from '../lib/rawDelivery.js';

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

/* ── 👨‍💻 editors ────────────────────────────────────────────────────────
   The vendor lets an editor in by email; the editor signs up with it on
   /editor (routes/editor.js). Removing one ends their access immediately. */
const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 160);

router.get('/editors', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.raw_editors.findMany({ where: { vendor_id: vid(req) }, orderBy: { created_at: 'asc' } });
    res.json({ editors: rows.map(r => ({ id: r.id, email: r.email, name: r.name || '', joined: !!r.password_hash, joinedAt: r.joined_at, lastLoginAt: r.last_login_at })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/editors', requireAuth, async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look right' });
    const name = String(req.body?.name || '').trim().slice(0, 120) || null;
    const row = await prisma.raw_editors.upsert({
      where: { vendor_id_email: { vendor_id: vid(req), email } },
      create: { vendor_id: vid(req), email, name },
      update: { name, revoked_at: null },
    });
    res.json({ id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/editors/:id', requireAuth, async (req, res) => {
  try {
    const { count } = await prisma.raw_editors.deleteMany({ where: { id: Number(req.params.id), vendor_id: vid(req) } });   // 🔒
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Every album with RAWs or a client selection: where each client stands. */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v, OR: [{ raw_files: { some: {} } }, { selections: { some: {} } }] },
      select: { id: true, title: true, selection_notes: { select: { updated_at: true } } },
      orderBy: { id: 'desc' },
    });
    const out = [];
    for (const a of albums) {
      await pairAlbum(a.id, v);
      const [raws, picks] = await Promise.all([
        prisma.raw_files.findMany({ where: { album_id: a.id, vendor_id: v }, select: { photo_id: true, size_bytes: true, delete_after: true } }),
        prisma.selections.findMany({ where: { album_id: a.id }, select: { photo_id: true } }),
      ]);
      const picked = new Set(picks.map(p => p.photo_id));
      out.push({
        id: a.id, name: a.title,
        raws: raws.length,
        bytes: raws.reduce((t, r) => t + Number(r.size_bytes || 0), 0),
        selected: picked.size,
        selectedWithRaw: raws.filter(r => r.photo_id && picked.has(r.photo_id)).length,
        sentAt: a.selection_notes?.updated_at || null,
        deleteAfter: raws.map(r => r.delete_after).filter(Boolean).sort()[0] || null,
      });
    }
    res.json({ clients: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ®️ the logo printed on delivered photos ────────────────────────── */
const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const settingsOf = async (v) => (await prisma.rawsel_settings.findUnique({ where: { vendor_id: v } })) || { vendor_id: v, logo_key: null, ...LOGO_DEFAULTS };
const readAll = async (key) => { const { stream } = await objects.getStream(objects.PRIVATE, key); const parts = []; for await (const c of stream) parts.push(c); return Buffer.concat(parts); };

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const s = await settingsOf(vid(req));
    let logo = null;
    if (s.logo_key) logo = `data:image/png;base64,${(await sharp(await readAll(s.logo_key)).resize({ width: 240, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
    res.json({ pos: s.logo_pos, size: s.logo_size, opacity: s.logo_opacity, margin: s.logo_margin, logo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const data = {
      logo_pos: POSITIONS.includes(b.pos) ? b.pos : 'br',
      logo_size: clampInt(b.size, 3, 60, 14),
      logo_opacity: clampInt(b.opacity, 5, 100, 85),
      logo_margin: clampInt(b.margin, 0, 20, 3),
      updated_at: new Date(),
    };
    await prisma.rawsel_settings.upsert({ where: { vendor_id: vid(req) }, create: { vendor_id: vid(req), ...data }, update: data });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** The logo itself — sent as a data URL (PNG, JPEG or WebP, up to 3 MB), kept as a PNG. */
router.post('/settings/logo', requireAuth, async (req, res) => {
  try {
    const m = String(req.body?.dataUrl || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP image' });
    const raw = Buffer.from(m[2], 'base64');
    if (raw.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'The logo must be under 3 MB' });
    const png = await sharp(raw).resize({ width: 2000, withoutEnlargement: true }).png().toBuffer();
    const key = objects.keyFor(vid(req), 'rawsel', `logo-${Date.now()}.png`);
    await objects.putObject(objects.PRIVATE, key, png, 'image/png', png.length);
    const old = await prisma.rawsel_settings.findUnique({ where: { vendor_id: vid(req) } });
    await prisma.rawsel_settings.upsert({ where: { vendor_id: vid(req) }, create: { vendor_id: vid(req), logo_key: key, ...LOGO_DEFAULTS }, update: { logo_key: key, updated_at: new Date() } });
    if (old?.logo_key && old.logo_key !== key) await objects.deleteObject(objects.PRIVATE, old.logo_key).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** How a delivered photo will look: the vendor's own latest photo with the logo as set (or as being tried). */
router.post('/settings/preview', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const s = await settingsOf(v);
    if (!s.logo_key) return res.status(400).json({ error: 'Upload a logo first' });
    const b = req.body || {};
    const trial = {
      logo_pos: POSITIONS.includes(b.pos) ? b.pos : s.logo_pos,
      logo_size: clampInt(b.size, 3, 60, s.logo_size),
      logo_opacity: clampInt(b.opacity, 5, 100, s.logo_opacity),
      logo_margin: clampInt(b.margin, 0, 20, s.logo_margin),
    };
    const sample = await prisma.photos.findFirst({ where: { vendor_id: v, ready: true, kind: 'photo' }, select: { preview_path: true }, orderBy: { id: 'desc' } });
    let base;
    try { base = sample ? await readAll(objects.keyFor(v, 'galleries', ...sample.preview_path.split('/').slice(1))) : null; } catch { base = null; }
    if (!base) base = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#b8b2a8' } }).jpeg().toBuffer();
    const out = await sharp(await withLogo(base, await readAll(s.logo_key), trial)).resize({ width: 900 }).jpeg({ quality: 80 }).toBuffer();
    res.json({ image: `data:image/jpeg;base64,${out.toString('base64')}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
