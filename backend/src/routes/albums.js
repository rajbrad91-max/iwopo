import { GALLERIES_ROOT } from '../config/paths.js';
import * as objects from '../lib/objectStore.js';
import { wouldExceed } from '../lib/storageQuota.js';
import { orderEvents, VIDEO_FOLDER } from '../lib/albumEvents.js';
import { writeMaster, writeCrops, SHAPES } from '../lib/coverImage.js';
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getFaceDescriptors, findMatches } from '../lib/faceEngine.js';
import { searchBySelfie, deleteCollection } from '../lib/faceAWS.js';
import { forgetPhotoFacesAWS } from '../lib/faceAWSIndex.js';
import { enqueueAlbum, indexAlbumNow } from '../lib/faceQueue.js';
import { getSetting } from '../lib/settings.js';

const router = express.Router();
const ROOT = GALLERIES_ROOT;

/**
 * 🔒 The R2 key for one gallery file.
 *
 * Mirrors the folder shape on disk, vendor first. The vendor id comes from the
 * caller's token and the album id from a row already checked against it — never
 * from anything the request supplied, because the prefix is the only thing
 * separating one vendor's photographs from another's.
 */
function galleryKey(vendorId, albumId, name) {
  return objects.keyFor(vendorId, 'galleries', String(albumId), name);
}
const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 200 * 1024 * 1024 } });

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

// which vendor am I?
function vid(req) { return req.user.vendor_id; }

// 🔒 list my albums
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v },                    // 🔒 tenancy
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { photos: true } } },
    });
    // how many photos are flagged selected, per album (one grouped query, not N)
    const picked = await prisma.photos.groupBy({
      by: ['album_id'],
      where: { vendor_id: v, is_selected: true },   // 🔒 tenancy (photos carry vendor_id directly)
      _count: { _all: true },
    });
    const pickedBy = new Map(picked.map(r => [r.album_id, r._count._all]));

    /* Counted apart, because a film is not a photograph. The single total read
       "1 photos" for an album holding one film and no photographs at all. */
    const byKind = await prisma.photos.groupBy({
      by: ['album_id', 'kind'],
      where: { vendor_id: v },                       // 🔒 tenancy
      _count: { _all: true },
    });
    const kindOf = new Map();
    for (const r of byKind) {
      const cur = kindOf.get(r.album_id) || { photo: 0, video: 0 };
      cur[r.kind === 'video' ? 'video' : 'photo'] += r._count._all;
      kindOf.set(r.album_id, cur);
    }

    const rows = albums.map(({ _count, ...a }) => {
      const k = kindOf.get(a.id) || { photo: 0, video: 0 };
      return {
        ...a,
        photo_count: k.photo,
        video_count: k.video,
        selected_count: pickedBy.get(a.id) || 0,
      };
    });
    res.json({ albums: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 create album
router.post('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { title, category, guest_username, guest_password, admin_username, admin_password,
    client_email, exp_enabled, exp_from_date, exp_date, exp_notes, face_ai } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    // 16 bytes, matching the rest of the app. Six was 48 bits — short enough
    // that guessing gallery links was worth someone's time, and a gallery is
    // the most private thing here. Existing links keep working.
    const token = crypto.randomBytes(16).toString('hex');
    const album = await prisma.albums.create({
      data: {
        vendor_id: v, title,
        category: category || null,
        guest_username: guest_username || null, guest_password: guest_password || null,
        admin_username: admin_username || null, admin_password: admin_password || null,
        client_email: client_email || null,
        exp_enabled: !!exp_enabled,
        exp_from_date: exp_from_date ? new Date(exp_from_date) : null,
        exp_date: exp_date ? new Date(exp_date) : null,
        exp_notes: exp_notes || null,
        face_ai: !!face_ai,
        public_token: token,
      },
    });
    res.status(201).json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 confirmed bookings (for auto-fill name + phone) — status 'booked'
router.get('/booking-options', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const bookings = await prisma.leads.findMany({
      where: { vendor_id: v, status: 'booked', archived_at: null, name: { not: null } }, // 🔒 tenancy
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json({ bookings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 update album
router.put('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  const { pw_prefix, spw_prefix, instructions_template } = req.body;
  try {
    const data = {
      pw_prefix: pw_prefix || '',
      spw_prefix: spw_prefix || '',
      instructions_template: instructions_template || null,
    };
    await prisma.album_settings.upsert({
      where: { vendor_id: v },                    // 🔒 tenancy
      update: data,
      create: { vendor_id: v, ...data },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 album settings GET — per vendor
router.get('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const row = await prisma.album_settings.findUnique({
      where: { vendor_id: v },                    // 🔒 tenancy
      select: { pw_prefix: true, spw_prefix: true, instructions_template: true },
    });
    const vendor = await prisma.vendors.findUnique({
      where: { id: v },
      select: { gallery_token: true },
    });
    const settings = row || { pw_prefix: '', spw_prefix: '', instructions_template: null };
    settings.gallery_token = vendor?.gallery_token || null;
    res.json({ settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f',
  title_text: 'Private gallery', subtitle_text: 'Your photos, ready to view and download',
  tagline_text: '',
};

// 🎨 gallery theme GET — per vendor
router.get('/theme', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const theme = await prisma.gallery_theme.findUnique({ where: { vendor_id: v } }); // 🔒 tenancy
    res.json({ theme: theme || { ...THEME_DEFAULTS } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🎨 gallery theme PUT — per vendor
router.put('/theme', requireAuth, async (req, res) => {
  const v = vid(req);
  const t = { ...THEME_DEFAULTS, ...req.body };
  try {
    const data = {
      heading_font: t.heading_font, body_font: t.body_font,
      bg_color: t.bg_color, heading_color: t.heading_color, accent_color: t.accent_color,
      sub_color: t.sub_color, title_text: t.title_text, subtitle_text: t.subtitle_text,
      tagline_text: t.tagline_text,
    };
    await prisma.gallery_theme.upsert({
      where: { vendor_id: v },                    // 🔒 tenancy
      update: data,
      create: { vendor_id: v, ...data },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  const { title, category, guest_username, guest_password, admin_username, admin_password,
    client_email, exp_enabled, exp_from_date, exp_date, exp_notes, face_ai } = req.body;
  try {
    // 🔒 tenancy: scope the update itself by vendor, so it can't touch another vendor's album
    const data = {
      category: category || null,
      guest_username: guest_username || null, guest_password: guest_password || null,
      admin_username: admin_username || null, admin_password: admin_password || null,
      client_email: client_email || null,
      exp_enabled: !!exp_enabled,
      exp_from_date: exp_from_date ? new Date(exp_from_date) : null,
      exp_date: exp_date ? new Date(exp_date) : null,
      exp_notes: exp_notes || null,
      face_ai: !!face_ai,
    };
    if (title) data.title = title;              // COALESCE($1,title): keep existing when blank
    const { count } = await prisma.albums.updateMany({ where: { id, vendor_id: v }, data });
    if (!count) return res.status(404).json({ error: 'Not found' });
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 email gallery instructions to client
router.post('/:id/email-instructions', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const a = await prisma.albums.findFirst({ where: { id, vendor_id: v } });   // 🔒 tenancy
    if (!a) return res.status(404).json({ error: 'Not found' });

    // recipient: explicit override from popup, else album's stored client_email
    const to = (req.body.email || a.client_email || '').trim();
    if (!to) return res.status(400).json({ error: 'No recipient email' });

    // body: popup sends already-filled text; otherwise fall back to template + fill
    let body = req.body.body;
    if (!body) {
      const st = await prisma.album_settings.findUnique({
        where: { vendor_id: v },                // 🔒 tenancy
        select: { instructions_template: true },
      });
      body = (st?.instructions_template || DEFAULT_INSTRUCTIONS)
        .replaceAll('{client_name}', a.title || 'Client')
        .replaceAll('{admin_password}', a.admin_password || '')
        .replaceAll('{guest_password}', a.guest_password || '');
    }

    // remember the entered email on the album for next time
    if (req.body.email && req.body.email !== a.client_email) {
      await prisma.albums.updateMany({ where: { id: a.id, vendor_id: v }, data: { client_email: to } });
    }

    const lead = { vendor_id: v, email: to, name: a.title };
    const { sendLeadEmail } = await import('./email.js');
    await sendLeadEmail(req, lead, 'Your Photos Are Ready 📸', body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const DEFAULT_INSTRUCTIONS = `Dear {client_name},

Your photos are now ready to view and download! 🎉

Guest Password: {guest_password}
(Share this with friends and family)

Admin Password: {admin_password}
(Use this to manage or remove photos)

Thank you for choosing us! 💛`;

// 🔒 upload/replace cover photo → webp 1200px
router.post('/:id/cover', requireAuth, upload.single('cover'), async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const dir = path.join(ROOT, String(id));
    fs.mkdirSync(dir, { recursive: true });
    /* A master, then two crops from it. The master is what lets the focal point
       stay adjustable — moving it later re-cuts from a picture we still hold
       rather than asking the vendor to upload the photograph again.

       The focus arrives WITH the upload. It used to be saved in a separate call
       afterwards, which was fine while the cover was only resized, but a crop
       has to know where to crop before it happens. */
    const base = `cover_${Date.now()}`;
    const master = `${base}_master.webp`;
    await writeMaster(req.file.path, path.join(dir, master));
    fs.unlink(req.file.path, () => {});          // the camera file has served its purpose

    const focus = req.body?.focus || '50% 50%';
    await writeCrops(path.join(dir, master), dir, base, focus);
    await coverToR2(v, id, dir, [master, `${base}.webp`, `${base}_tall.webp`]);
    await removeOldCover(v, id, dir);            // whatever the previous cover was

    await prisma.albums.updateMany({
      where: { id, vendor_id: v },
      data: { cover_photo: `${base}.webp`, cover_focus: /^\d{1,3}%\s\d{1,3}%$/.test(focus) ? focus : '50% 50%' },
    });
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Covers live in R2 too. They were never wired across when the rest of the
 * gallery moved, so they existed only on the VPS disk — absent from the bucket
 * and from every assumption made elsewhere about where gallery media lives.
 */
async function coverToR2(vendorId, albumId, dir, files) {
  if (!await objects.enabled(objects.PRIVATE)) return;
  await Promise.all(files.map(async (f) => {
    try {
      await objects.putObject(objects.PRIVATE, galleryKey(vendorId, albumId, f),
        fs.createReadStream(path.join(dir, f)));
    } catch (e) { console.error('[cover] R2 upload failed for', f, e.message); }
  }));
}

/**
 * Which rendition to hand back. "?v=tall" asks for the phone-shaped one; a
 * cover uploaded before this existed has no tall file, so the caller falls
 * through to the disk and gets the wide one — old covers keep working.
 */
function coverVariant(coverPhoto, want) {
  if (want !== 'tall') return coverPhoto;
  return coverPhoto.replace(/\.webp$/, '_tall.webp');
}

/** Covers read from R2 first, like every other piece of gallery media. */
async function serveCoverFromR2(res, vendorId, albumId, file) {
  if (!vendorId || !await objects.enabled(objects.PRIVATE)) return false;
  try {
    const o = await objects.getStream(objects.PRIVATE, galleryKey(vendorId, albumId, file));
    if (o.contentType) res.setHeader('Content-Type', o.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (o.size) res.setHeader('Content-Length', o.size);
    o.stream.pipe(res);
    return true;
  } catch { return false; }               // not in R2 — the disk still has it
}

/** Replacing a cover should not leave the old one occupying the vendor's pool. */
async function removeOldCover(vendorId, albumId, dir) {
  const prev = await prisma.albums.findFirst({ where: { id: albumId, vendor_id: vendorId }, select: { cover_photo: true } });
  if (!prev?.cover_photo) return;
  const base = prev.cover_photo.replace(/\.webp$/, '');
  for (const f of [`${base}.webp`, `${base}_tall.webp`, `${base}_master.webp`]) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* already gone */ }
    if (await objects.enabled(objects.PRIVATE)) {
      try { await objects.deleteObject(objects.PRIVATE, galleryKey(vendorId, albumId, f)); } catch { /* fine */ }
    }
  }
}

// 🎯 save the cover focal point ("X% Y%") so covers frame well on any aspect ratio
router.put('/:id/cover-focus', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const focus = (req.body.focus || '50% 50%').trim();
    // validate: two percentages like "37% 62%"
    if (!/^\d{1,3}%\s\d{1,3}%$/.test(focus)) return res.status(400).json({ error: 'Bad focus format' });
    const { count } = await prisma.albums.updateMany({ where: { id, vendor_id: v }, data: { cover_focus: focus } }); // 🔒 tenancy
    if (!count) return res.status(404).json({ error: 'Not found' });

    /* Re-cut both renditions around the new point. This is the whole reason the
       master is kept: without it, moving the focal point would mean uploading
       the photograph again. */
    try {
      const cur = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { cover_photo: true } });
      if (cur?.cover_photo) {
        const dir = path.join(ROOT, String(id));
        const base = cur.cover_photo.replace(/\.webp$/, '');
        const master = path.join(dir, `${base}_master.webp`);
        if (fs.existsSync(master)) {
          await writeCrops(master, dir, base, focus);
          await coverToR2(v, id, dir, [`${base}.webp`, `${base}_tall.webp`]);
        }
        // a cover uploaded before the master existed simply keeps its old crop;
        // the focal point still moves for anything uploaded since
      }
    } catch (e) { console.error('[cover] re-crop failed:', e.message); }
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 public cover image
router.get('/cover/:id', async (req, res) => {
  try {
    const a = await prisma.albums.findUnique({
      where: { id: Number(req.params.id) },
      select: { cover_photo: true, vendor_id: true },
    });
    if (!a?.cover_photo) return res.status(404).end();
    const file = coverVariant(a.cover_photo, req.query.v);
    if (await serveCoverFromR2(res, a.vendor_id, Number(req.params.id), file)) return;
    res.sendFile(path.join(ROOT, String(req.params.id), file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch { res.status(404).end(); }
});

// 🔒 album detail + photos (tenant-checked)
router.get('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });   // 🔒 tenancy
    if (!album) return res.status(404).json({ error: 'Album not found' });
    const photos = await prisma.photos.findMany({
      where: { album_id: id, vendor_id: v },        // 🔒 tenancy
      orderBy: { created_at: 'asc' },
    });
    const events = await prisma.album_events.findMany({
      where: { album_id: id, vendor_id: v },        // 🔒 tenancy
      select: { id: true, name: true, sort_order: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ album, photos, events: orderEvents(events) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 events CRUD (per-client mode)
router.post('/:id/events', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });
    const top = await prisma.album_events.aggregate({
      where: { album_id: id },
      _max: { sort_order: true },
    });
    const event = await prisma.album_events.create({
      data: { album_id: id, vendor_id: v, name, sort_order: (top._max.sort_order || 0) + 1 },
      select: { id: true, name: true, sort_order: true },
    });
    res.status(201).json({ event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = vid(req);
  const { name } = req.body;
  try {
    const where = { id: Number(req.params.eventId), album_id: Number(req.params.id), vendor_id: v }; // 🔒 tenancy
    const { count } = await prisma.album_events.updateMany({
      where,
      data: name ? { name } : {},                 // COALESCE($1,name): blank keeps the current name
    });
    if (!count) return res.status(404).json({ error: 'Not found' });
    const event = await prisma.album_events.findFirst({ where, select: { id: true, name: true } });
    res.json({ event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { count } = await prisma.album_events.deleteMany({
      where: { id: Number(req.params.eventId), album_id: Number(req.params.id), vendor_id: v }, // 🔒 tenancy
    });
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 delete album (tenant-checked, cascades photos)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { count } = await prisma.albums.deleteMany({
      where: { id: Number(req.params.id), vendor_id: v },   // 🔒 tenancy
    });
    if (!count) return res.status(404).json({ error: 'Not found' });
    // ☁️ tear down the album's Rekognition collection so AWS isn't left holding
    // face data (and billing for it) after the album is gone
    try { await deleteCollection(req.params.id); } catch { /* best effort */ }
    // remove the album's entire storage folder (all photos + tiers) from disk
    try { fs.rmSync(path.join(ROOT, String(v), String(req.params.id)), { recursive: true, force: true }); } catch { /* folder already gone — fine */ }

    /* And the same folder in R2. Object storage has no folders, so "delete the
       folder" means listing the prefix and removing each key — a whole wedding
       left behind here is hundreds of objects nothing points at, charged to the
       vendor forever. Done after the row is gone so a storage failure cannot
       block the delete itself. */
    if (await objects.enabled(objects.PRIVATE)) {
      try {
        const prefix = objects.keyFor(v, 'galleries', String(req.params.id)) + '/';
        const keys = await objects.listAll(objects.PRIVATE, prefix);
        for (const o of keys) await objects.deleteObject(objects.PRIVATE, o.key);
        if (keys.length) console.log('[album] removed', keys.length, 'objects under', prefix);
      } catch (e) { console.error('[album] R2 cleanup failed:', e.message); }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 upload photos → 3-tier pipeline (thumb 800 / full 2200 webp / original)
router.post('/:id/photos', requireAuth, upload.array('photos', 50), async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
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

    const saved = [];
    for (const f of req.files || []) {
      const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const origName = `${base}_orig${path.extname(f.originalname) || '.jpg'}`;
      const thumbName = `${base}_thumb.webp`;
      const fullName = `${base}_full.webp`;

      // original (as-is, for download + pinch-zoom 1:1)
      fs.copyFileSync(f.path, path.join(dir, origName));
      // full-screen 2200px long-edge webp (the single display tier)
      await sharp(f.path).rotate().resize(2200, 2200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, fullName));
      // thumb 800px webp (grid)
      await sharp(f.path).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, thumbName));

      // what this photograph actually costs: the original and both tiers
      const costBytes = [origName, fullName, thumbName].reduce((n, x) => {
        try { return n + fs.statSync(path.join(dir, x)).size; } catch { return n; }
      }, 0);

      /* ☁️ And to R2, into the PRIVATE bucket. A gallery is opened with an
         album password or a view token, so its objects must never sit beside
         the public website images — a single bucket would let anyone holding a
         file's URL walk past that gate.

         Written after the disk, and failure is logged rather than fatal: the
         photographs are already saved locally and every reader falls back
         there, so an unreachable R2 costs a slower read, not a lost wedding. */
      if (await objects.enabled(objects.PRIVATE)) {
        // all three tiers at once rather than in turn — they are independent,
        // and waiting for each in sequence tripled the time a batch of
        // photographs spent in the request
        await Promise.all([origName, fullName, thumbName].map(async (n) => {
          try {
            await objects.putObject(objects.PRIVATE, galleryKey(v, id, n),
              fs.createReadStream(path.join(dir, n)));
          } catch (e) { console.error('[gallery] R2 upload failed for', n, e.message); }
        }));
      }
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
    // 🤳 queue face indexing (throttled single worker — never blocks the API)
    enqueueAlbum(id);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  const v = vid(req);
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
  } catch (e) { cleanup(); res.status(500).json({ error: e.message }); }
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
  const v = vid(req);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// sign — one part at a time, so a resumed upload only re-signs what it needs
router.post('/:id/videos/sign', requireAuth, async (req, res) => {
  const v = vid(req);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// complete — stitch the parts, then record the film
router.post('/:id/videos/complete', requireAuth, uploadVideo.single('poster'), async (req, res) => {
  const v = vid(req);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// abandon — a vendor who cancels should not leave parts costing storage
router.post('/:id/videos/abort', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒
    if (!own) return res.status(404).json({ error: 'Album not found' });
    const { key, upload_id: uploadId } = req.body || {};
    if (!key || !uploadId) return res.status(400).json({ error: 'key and upload_id required' });
    if (key !== galleryKey(v, id, path.basename(key))) return res.status(403).json({ error: 'Not your key' });  // 🔒
    await objects.abortMultipart(objects.PRIVATE, key, uploadId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 delete a photo (tenant-checked)
router.delete('/:id/photos/:photoId', requireAuth, async (req, res) => {
  const v = vid(req);
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
    try { await forgetPhotoFacesAWS(req.params.id, req.params.photoId); } catch { /* best effort */ }

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 serve a gallery file — token via header OR ?token= (for <img src>). type = thumb|preview|orig
router.get('/file/:photoId/:type', async (req, res) => {
  const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
  const tok = (req.headers.authorization?.split(' ')[1]) || req.query.token;
  let user;
  try { user = jwt.verify(tok, SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
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
          if (o.contentType) res.setHeader('Content-Type', o.contentType);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🧠 index faces for an album (runs detection on all un-indexed photos)
router.post('/:id/index-faces', requireAuth, async (req, res) => {
  const v = vid(req);
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Album not found' });
    // run one throttled pass via the shared queue worker (single-worker, yields between photos)
    const r = await indexAlbumNow(id);
    res.json({ requested: r.requested, remaining: r.remaining });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔍 search album by selfie → returns matching photo IDs (vendor preview/testing)
router.post('/:id/face-search', requireAuth, upload.single('selfie'), async (req, res) => {
  const v = vid(req);
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
        for (const f of (p.faces || [])) if (f.descriptor) candidates.push({ photo_id: p.id, descriptor: f.descriptor });
      }
      const matches = findMatches(q[0].descriptor, candidates, 0.5);
      const seen = new Set();
      for (const m of matches) { if (!seen.has(m.photo_id)) { seen.add(m.photo_id); ids.push(m.photo_id); } }
    }
    res.json({ matches: ids.length, photo_ids: ids, engine });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⭐ favorites a vendor received for one of their albums, grouped by client email.
// Ownership enforced: the album must belong to the requesting vendor.
router.get('/:id/favorites', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    const favs = await prisma.favorites.findMany({
      where: { album_id: id },                   // album already proven to belong to this vendor
      orderBy: [{ email: 'asc' }, { created_at: 'asc' }],
      include: { photos: { select: { filename: true, event_id: true, album_events: { select: { name: true } } } } },
    });
    const rows = favs.map(f => ({
      email: f.email, photo_id: f.photo_id, created_at: f.created_at,
      filename: f.photos?.filename,
      event_id: f.photos?.event_id ?? null,
      event_name: f.photos?.album_events?.name || null,
    }));
    // group by event → then by email: [{ event_id, event_name, count, lists:[{email,count,photos}] }]
    const evMap = new Map();
    for (const r of rows) {
      const key = r.event_id == null ? 'none' : String(r.event_id);
      if (!evMap.has(key)) evMap.set(key, { event_id: r.event_id, event_name: r.event_name || 'Ungrouped', emails: new Map() });
      const ev = evMap.get(key);
      if (!ev.emails.has(r.email)) ev.emails.set(r.email, []);
      ev.emails.get(r.email).push({ photo_id: r.photo_id, filename: r.filename, created_at: r.created_at });
    }
    const events = [...evMap.values()].map(ev => {
      const lists = [...ev.emails.entries()].map(([email, photos]) => ({ email, count: photos.length, photos }));
      const count = lists.reduce((n, l) => n + l.count, 0);
      return { event_id: ev.event_id, event_name: ev.event_name, count, lists };
    });
    res.json({ total: rows.length, events });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📩 the selection the client's admin sent to the studio, grouped by event.
router.get('/:id/selection', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    const sels = await prisma.selections.findMany({
      where: { album_id: id },                   // album already proven to belong to this vendor
      include: { photos: { select: { filename: true, event_id: true, album_events: { select: { name: true } } } } },
    });
    const rows = sels.map(s => ({
      photo_id: s.photo_id, created_at: s.created_at,
      filename: s.photos?.filename,
      event_id: s.photos?.event_id ?? null,
      event_name: s.photos?.album_events?.name || null,
    }));
    // order by event name (ungrouped first), then filename — matches the previous SQL ordering
    rows.sort((a, b) =>
      (a.event_name || '').localeCompare(b.event_name || '') ||
      (a.filename || '').localeCompare(b.filename || ''));
    const evMap = new Map();
    for (const r of rows) {
      const key = r.event_id == null ? 'none' : String(r.event_id);
      if (!evMap.has(key)) evMap.set(key, { event_id: r.event_id, event_name: r.event_name || 'Ungrouped', photos: [] });
      evMap.get(key).photos.push({ photo_id: r.photo_id, filename: r.filename, created_at: r.created_at });
    }
    const events = [...evMap.values()].map(ev => ({ ...ev, count: ev.photos.length }));
    // the note the client typed when sending, if any
    const note = await prisma.selection_notes.findUnique({ where: { album_id: id } });
    res.json({
      total: rows.length,
      events,
      note: note?.note || '',
      sent_at: note?.updated_at || null,
      completed_at: note?.completed_at || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ mark the client's selection as handled (or clear that flag)
router.put('/:id/selection/complete', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    const done = req.body?.completed !== false;
    const stamp = done ? new Date() : null;
    await prisma.selection_notes.upsert({
      where: { album_id: id },
      update: { completed_at: stamp },
      create: { album_id: id, completed_at: stamp },
    });
    res.json({ ok: true, completed_at: stamp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🗑️ clear the sent selection and its note — the photos themselves are untouched
router.delete('/:id/selection', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    await prisma.selections.deleteMany({ where: { album_id: id } });
    await prisma.selection_notes.deleteMany({ where: { album_id: id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📦 download the client's selected photos as a zip (token via header or ?token= for links)
router.get('/:id/selection.zip', async (req, res) => {
  const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
  const tok = (req.headers.authorization?.split(' ')[1]) || req.query.token;
  let user;
  try { user = jwt.verify(tok, SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({
      where: { id, vendor_id: user.vendor_id },   // 🔒 tenancy
      select: { id: true, title: true },
    });
    if (!own) return res.status(404).json({ error: 'Not found' });
    const sels = await prisma.selections.findMany({
      where: { album_id: id },
      include: { photos: { select: { id: true, storage_path: true, filename: true } } },
    });
    const rows = sels
      .map(s => s.photos)
      .filter(Boolean)
      .sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
    if (!rows.length) return res.status(404).json({ error: 'Nothing selected' });
    const safe = `${own.title || 'gallery'}-selection`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.attachment(`${safe}.zip`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { try { res.status(500).end(); } catch { /* stream already closed */ } });
    archive.pipe(res);
    for (const p of rows) {
      const full = path.join(ROOT, p.storage_path);
      if (fs.existsSync(full)) archive.file(full, { name: p.filename || `photo-${p.id}.jpg` });
    }
    archive.finalize();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
