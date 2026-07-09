import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { getFaceDescriptors, findMatches } from '../lib/faceEngine.js';
import { getFaceDescriptorsAWS, findMatchesAWS } from '../lib/faceAWS.js';
import { getSetting } from '../lib/settings.js';

const router = express.Router();
const ROOT = '/var/www/vowflo/storage/galleries';
const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 60 * 1024 * 1024 } });

// which vendor am I?
function vid(req) { return req.user.vendor_id; }

// 🔒 list my albums
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const { rows } = await query(
      `SELECT a.*,
        (SELECT count(*)::int FROM photos p WHERE p.album_id=a.id) AS photo_count,
        (SELECT count(*)::int FROM photos p WHERE p.album_id=a.id AND p.is_selected) AS selected_count
       FROM albums a WHERE a.vendor_id=$1 ORDER BY a.created_at DESC`, [v]);
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
    const { rows } = await query(
      `INSERT INTO albums (vendor_id, title, category, guest_username, guest_password, admin_username, admin_password,
        client_email, exp_enabled, exp_from_date, exp_date, exp_notes, face_ai, public_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [v, title, category || null, guest_username || null, guest_password || null, admin_username || null, admin_password || null,
       client_email || null, !!exp_enabled, exp_from_date || null, exp_date || null, exp_notes || null, !!face_ai, token]);
    res.status(201).json({ album: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 confirmed bookings (for auto-fill name + phone) — status 'booked'
router.get('/booking-options', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const { rows } = await query(
      `SELECT id, name, phone, email FROM leads
       WHERE vendor_id=$1 AND status='booked' AND archived_at IS NULL AND name IS NOT NULL
       ORDER BY name`, [v]);
    res.json({ bookings: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 update album
router.put('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  const { pw_prefix, spw_prefix, instructions_template } = req.body;
  try {
    await query(
      `INSERT INTO album_settings (vendor_id, pw_prefix, spw_prefix, instructions_template)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vendor_id) DO UPDATE SET pw_prefix=$2, spw_prefix=$3, instructions_template=$4`,
      [v, pw_prefix || '', spw_prefix || '', instructions_template || null]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 album settings GET — per vendor
router.get('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows } = await query('SELECT pw_prefix, spw_prefix, instructions_template FROM album_settings WHERE vendor_id=$1', [v]);
    const { rows: vt } = await query('SELECT gallery_token FROM vendors WHERE id=$1', [v]);
    const settings = rows[0] || { pw_prefix: '', spw_prefix: '', instructions_template: null };
    settings.gallery_token = vt[0]?.gallery_token || null;
    res.json({ settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#0f1115', heading_color: '#f3f4f6', accent_color: '#2dd4bf', sub_color: '#9ca3af',
  title_text: 'Client Galleries', subtitle_text: 'Secure, Password-Protected Memories',
  tagline_text: 'Ready to view, share and download.', default_mode: 'per_event',
};

// 🎨 gallery theme GET — per vendor
router.get('/theme', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows } = await query('SELECT * FROM gallery_theme WHERE vendor_id=$1', [v]);
    res.json({ theme: rows[0] || { ...THEME_DEFAULTS } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🎨 gallery theme PUT — per vendor
router.put('/theme', requireAuth, async (req, res) => {
  const v = vid(req);
  const t = { ...THEME_DEFAULTS, ...req.body };
  try {
    await query(
      `INSERT INTO gallery_theme (vendor_id, heading_font, body_font, bg_color, heading_color, accent_color, sub_color, title_text, subtitle_text, tagline_text, default_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (vendor_id) DO UPDATE SET
         heading_font=$2, body_font=$3, bg_color=$4, heading_color=$5, accent_color=$6, sub_color=$7,
         title_text=$8, subtitle_text=$9, tagline_text=$10, default_mode=$11`,
      [v, t.heading_font, t.body_font, t.bg_color, t.heading_color, t.accent_color, t.sub_color, t.title_text, t.subtitle_text, t.tagline_text, t.default_mode]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const { title, category, guest_username, guest_password, admin_username, admin_password,
    client_email, exp_enabled, exp_from_date, exp_date, exp_notes, face_ai, gallery_mode } = req.body;
  try {
    const { rows: own } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(
      `UPDATE albums SET
        title=COALESCE($1,title), category=$2,
        guest_username=$3, guest_password=$4, admin_username=$5, admin_password=$6,
        client_email=$7, exp_enabled=$8, exp_from_date=$9, exp_date=$10, exp_notes=$11, face_ai=$12,
        gallery_mode=$13
       WHERE id=$14 RETURNING *`,
      [title || null, category || null, guest_username || null, guest_password || null,
       admin_username || null, admin_password || null, client_email || null,
       !!exp_enabled, exp_from_date || null, exp_date || null, exp_notes || null, !!face_ai,
       gallery_mode || null, req.params.id]);
    res.json({ album: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 email gallery instructions to client
router.post('/:id/email-instructions', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows } = await query('SELECT * FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Not found' });

    // recipient: explicit override from popup, else album's stored client_email
    const to = (req.body.email || a.client_email || '').trim();
    if (!to) return res.status(400).json({ error: 'No recipient email' });

    // body: popup sends already-filled text; otherwise fall back to template + fill
    let body = req.body.body;
    if (!body) {
      const { rows: st } = await query('SELECT instructions_template FROM album_settings WHERE vendor_id=$1', [v]);
      body = (st[0]?.instructions_template || DEFAULT_INSTRUCTIONS)
        .replaceAll('{client_name}', a.title || 'Client')
        .replaceAll('{admin_password}', a.admin_password || '')
        .replaceAll('{guest_password}', a.guest_password || '');
    }

    // remember the entered email on the album for next time
    if (req.body.email && req.body.email !== a.client_email) {
      await query('UPDATE albums SET client_email=$1 WHERE id=$2', [to, a.id]);
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
  try {
    const { rows: own } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const dir = path.join(ROOT, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    const fname = `cover_${Date.now()}.webp`;
    await sharp(req.file.path).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, fname));
    fs.unlink(req.file.path, () => {});
    const { rows } = await query('UPDATE albums SET cover_photo=$1 WHERE id=$2 RETURNING *', [fname, req.params.id]);
    res.json({ album: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 public cover image
router.get('/cover/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT cover_photo FROM albums WHERE id=$1', [req.params.id]);
    if (!rows[0] || !rows[0].cover_photo) return res.status(404).end();
    res.sendFile(path.join(ROOT, String(req.params.id), rows[0].cover_photo));
  } catch { res.status(404).end(); }
});

// 🔒 album detail + photos (tenant-checked)
router.get('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: a } = await query('SELECT * FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!a[0]) return res.status(404).json({ error: 'Album not found' });
    const { rows: photos } = await query('SELECT * FROM photos WHERE album_id=$1 ORDER BY created_at', [req.params.id]);
    const { rows: events } = await query('SELECT id, name, sort_order FROM album_events WHERE album_id=$1 ORDER BY sort_order, id', [req.params.id]);
    res.json({ album: a[0], photos, events });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 events CRUD (per-client mode)
router.post('/:id/events', requireAuth, async (req, res) => {
  const v = vid(req);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows: own } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!own[0]) return res.status(404).json({ error: 'Album not found' });
    const { rows: mx } = await query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM album_events WHERE album_id=$1', [req.params.id]);
    const { rows } = await query(
      'INSERT INTO album_events (album_id, vendor_id, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING id, name, sort_order',
      [req.params.id, v, name, mx[0].n]);
    res.status(201).json({ event: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = vid(req);
  const { name } = req.body;
  try {
    const { rows } = await query(
      'UPDATE album_events SET name=COALESCE($1,name) WHERE id=$2 AND album_id=$3 AND vendor_id=$4 RETURNING id, name',
      [name || null, req.params.eventId, req.params.id, v]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ event: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const r = await query('DELETE FROM album_events WHERE id=$1 AND album_id=$2 AND vendor_id=$3', [req.params.eventId, req.params.id, v]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 delete album (tenant-checked, cascades photos)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const r = await query('DELETE FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 upload photos → 3-tier WebP pipeline (thumb 800 / preview 2500 / original)
router.post('/:id/photos', requireAuth, upload.array('photos', 50), async (req, res) => {
  const v = vid(req);
  try {
    const { rows: a } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!a[0]) return res.status(404).json({ error: 'Album not found' });

    const dir = path.join(ROOT, String(v), String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });

    const saved = [];
    for (const f of req.files || []) {
      const base = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const origName = `${base}_orig${path.extname(f.originalname) || '.jpg'}`;
      const thumbName = `${base}_thumb.webp`;
      const prevName = `${base}_preview.webp`;

      // original (as-is, for download)
      fs.copyFileSync(f.path, path.join(dir, origName));
      // preview 2500px webp
      await sharp(f.path).rotate().resize(2500, 2500, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, prevName));
      // thumb 800px webp
      await sharp(f.path).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, thumbName));
      fs.unlinkSync(f.path);

      const rel = (n) => `${v}/${req.params.id}/${n}`;
      const eventId = req.body.event_id ? parseInt(req.body.event_id, 10) : null;
      const { rows } = await query(
        `INSERT INTO photos (album_id, vendor_id, filename, storage_path, thumb_path, preview_path, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, v, f.originalname, rel(origName), rel(thumbName), rel(prevName), eventId]);
      saved.push(rows[0]);
    }
    res.status(201).json({ uploaded: saved.length, photos: saved });
    // 🤳 auto-index faces in the background (non-blocking) right after upload
    indexAlbumFaces(req.params.id).catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🤳 shared face-indexing worker (used by upload auto-index + manual endpoint)
async function indexAlbumFaces(albumId) {
  const { rows: photos } = await query(
    'SELECT id, preview_path FROM photos WHERE album_id=$1 AND face_indexed=false', [albumId]);
  if (!photos.length) return { indexed: 0, faces: 0 };
  const engine = await getSetting('face_engine', 'vladmandic');
  let done = 0, faces = 0;
  for (const p of photos) {
    try {
      const full = path.join(ROOT, p.preview_path);
      if (!fs.existsSync(full)) continue;
      const found = engine === 'aws' ? await getFaceDescriptorsAWS(full) : await getFaceDescriptors(full);
      await query('UPDATE photos SET faces=$1, face_count=$2, face_indexed=true WHERE id=$3',
        [JSON.stringify(found), found.length, p.id]);
      done++; faces += found.length;
    } catch (e) { /* skip bad image */ }
  }
  return { indexed: done, faces, engine };
}

// 🔒 delete a photo (tenant-checked)
router.delete('/:id/photos/:photoId', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const r = await query('DELETE FROM photos WHERE id=$1 AND album_id=$2 AND vendor_id=$3', [req.params.photoId, req.params.id, v]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
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
    const { rows } = await query('SELECT * FROM photos WHERE id=$1 AND vendor_id=$2', [req.params.photoId, v]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const p = rows[0];
    const rel = req.params.type === 'orig' ? p.storage_path : req.params.type === 'preview' ? p.preview_path : p.thumb_path;
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(full);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🧠 index faces for an album (runs detection on all un-indexed photos)
router.post('/:id/index-faces', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: a } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!a[0]) return res.status(404).json({ error: 'Album not found' });

    const { rows: photos } = await query(
      'SELECT id, preview_path FROM photos WHERE album_id=$1 AND face_indexed=false', [req.params.id]);

    const engine = await getSetting('face_engine', 'vladmandic');
    let done = 0, faces = 0;
    for (const p of photos) {
      try {
        const full = path.join(ROOT, p.preview_path);
        if (!fs.existsSync(full)) continue;
        const found = engine === 'aws' ? await getFaceDescriptorsAWS(full) : await getFaceDescriptors(full);
        await query('UPDATE photos SET faces=$1, face_count=$2, face_indexed=true WHERE id=$3',
          [JSON.stringify(found), found.length, p.id]);
        done++; faces += found.length;
      } catch (e) { /* skip bad image */ }
    }
    res.json({ indexed: done, faces, remaining: photos.length - done, engine });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔍 search album by selfie → returns matching photo IDs (vendor preview/testing)
router.post('/:id/face-search', requireAuth, upload.single('selfie'), async (req, res) => {
  const v = vid(req);
  try {
    const { rows: a } = await query('SELECT id FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!a[0]) return res.status(404).json({ error: 'Album not found' });
    if (!req.file) return res.status(400).json({ error: 'No selfie uploaded' });

    const engine = await getSetting('face_engine', 'vladmandic');
    const { rows: photos } = await query(
      'SELECT id, faces FROM photos WHERE album_id=$1 AND face_indexed=true AND face_count>0', [req.params.id]);

    let ids = [];
    if (engine === 'aws') {
      // AWS: candidates carry stored jpeg bytes (imgB64) from indexing
      const candidates = [];
      for (const p of photos) {
        for (const f of (p.faces || [])) { if (f.imgB64) { candidates.push({ photo_id: p.id, imgB64: f.imgB64 }); break; } }
      }
      const matches = await findMatchesAWS(req.file.path, candidates, 90);
      fs.unlinkSync(req.file.path);
      const seen = new Set();
      for (const m of matches) { if (!seen.has(m.photo_id)) { seen.add(m.photo_id); ids.push(m.photo_id); } }
    } else {
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

export default router;
