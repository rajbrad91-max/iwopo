import { GALLERIES_ROOT } from '../config/paths.js';
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
const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 200 * 1024 * 1024 } });

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
    const rows = albums.map(({ _count, ...a }) => ({
      ...a,
      photo_count: _count.photos,
      selected_count: pickedBy.get(a.id) || 0,
    }));
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
    const token = crypto.randomBytes(6).toString('hex'); // 12-char public share token
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
    const fname = `cover_${Date.now()}.webp`;
    await sharp(req.file.path).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, fname));
    fs.unlink(req.file.path, () => {});
    await prisma.albums.updateMany({ where: { id, vendor_id: v }, data: { cover_photo: fname } });
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 public cover image
router.get('/cover/:id', async (req, res) => {
  try {
    const a = await prisma.albums.findUnique({
      where: { id: Number(req.params.id) },
      select: { cover_photo: true },
    });
    if (!a?.cover_photo) return res.status(404).end();
    res.sendFile(path.join(ROOT, String(req.params.id), a.cover_photo));
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
    res.json({ album, photos, events });
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
          event_id: eventId,
        },
      });
      saved.push(photo);
    }
    res.status(201).json({ uploaded: saved.length, photos: saved });
    // 🤳 queue face indexing (throttled single worker — never blocks the API)
    enqueueAlbum(id);
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

    // remove all 3 tiers from disk (original + 2200px full + thumb); ignore if already gone
    for (const rel of [p.storage_path, p.preview_path, p.thumb_path]) {
      if (!rel) continue;
      try { fs.unlinkSync(path.join(ROOT, rel)); } catch { /* file already missing — fine */ }
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
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(full);
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
