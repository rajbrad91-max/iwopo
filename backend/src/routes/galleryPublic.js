import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';
import { query } from '../config/db.js';
import { getFaceDescriptors, findMatches } from '../lib/faceEngine.js';
import { getFaceDescriptorsAWS, findMatchesAWS } from '../lib/faceAWS.js';
import { getSetting } from '../lib/settings.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const upload = multer({ dest: '/tmp/vowflo-selfie' });

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f',
  title_text: 'Private gallery', subtitle_text: 'Your photos, ready to view and download',
  tagline_text: '', default_mode: 'per_event',
};
async function getTheme(vendorId) {
  const { rows } = await query('SELECT * FROM gallery_theme WHERE vendor_id=$1', [vendorId]);
  return rows[0] || { ...THEME_DEFAULTS };
}

const router = express.Router();
const ROOT = '/var/www/vowflo/storage/galleries';

// short-lived signed view tokens (in-memory; fine for single-node)
const viewTokens = new Map(); // vt -> { albumId, role, exp }
function makeViewToken(albumId, role) {
  const vt = crypto.randomBytes(16).toString('hex');
  viewTokens.set(vt, { albumId, role, exp: Date.now() + 6 * 3600 * 1000 }); // 6h
  return vt;
}
function checkViewToken(vt, albumId) {
  const rec = viewTokens.get(vt);
  if (!rec) return null;
  if (rec.exp < Date.now()) { viewTokens.delete(vt); return null; }
  if (String(rec.albumId) !== String(albumId)) return null;
  return rec;
}
// prune expired hourly
setInterval(() => { const now = Date.now(); for (const [k, v] of viewTokens) if (v.exp < now) viewTokens.delete(k); }, 3600 * 1000);

async function findAlbum(token) {
  const { rows } = await query('SELECT * FROM albums WHERE public_token=$1', [token]);
  return rows[0] || null;
}

// 🌐 whole-gallery index: list all albums for a vendor (covers + names + album tokens)
router.get('/vendor/:token', async (req, res) => {
  try {
    const { rows: v } = await query('SELECT id, business_name FROM vendors WHERE gallery_token=$1', [req.params.token]);
    if (!v[0]) return res.status(404).json({ error: 'Gallery not found' });
    const { rows: albums } = await query(
      `SELECT a.public_token, a.title, a.category, a.cover_photo,
              (SELECT COUNT(*)::int FROM photos p WHERE p.album_id=a.id) AS photo_count
       FROM albums a WHERE a.vendor_id=$1 ORDER BY a.created_at DESC NULLS LAST, a.id DESC`, [v[0].id]);
    res.json({
      vendor: { name: v[0].business_name },
      theme: await getTheme(v[0].id),
      albums: albums.map(a => ({ token: a.public_token, title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: a.photo_count })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 cover for an album in the index (by album token, public — no password)
router.get('/vendor-cover/:albumToken', async (req, res) => {
  try {
    const a = await findAlbum(req.params.albumToken);
    if (!a || !a.cover_photo) return res.status(404).end();
    res.sendFile(path.join(ROOT, String(a.id), a.cover_photo));
  } catch { res.status(404).end(); }
});

// 🌐 album meta (no photos) — for the login gate
router.get('/:token', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Gallery not found' });
    const { rows: c } = await query('SELECT COUNT(*)::int AS n FROM photos WHERE album_id=$1', [a.id]);
    const theme = await getTheme(a.vendor_id);
    const mode = a.gallery_mode || theme.default_mode || 'per_event';
    res.json({ album: { title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: c[0].n, id: a.id, token: a.public_token, mode }, theme });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 public cover image
router.get('/:token/cover', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a || !a.cover_photo) return res.status(404).end();
    res.sendFile(path.join(ROOT, String(a.id), a.cover_photo));
  } catch { res.status(404).end(); }
});

// 🔑 authenticate with guest/admin password → returns photo list + view token
router.post('/:token/auth', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Gallery not found' });
    const pw = (req.body.password || '').trim();
    if (!pw) return res.status(400).json({ error: 'Password required' });

    let role = null;
    if (a.admin_password && pw === a.admin_password) role = 'admin';
    else if (a.guest_password && pw === a.guest_password) role = 'guest';
    if (!role) return res.status(401).json({ error: 'Wrong password' });

    const { rows: photos } = await query('SELECT id, filename, event_id, face_count FROM photos WHERE album_id=$1 ORDER BY id', [a.id]);
    const theme = await getTheme(a.vendor_id);
    const mode = a.gallery_mode || theme.default_mode || 'per_event';
    // per-client mode: group photos under events
    let events = [];
    if (mode === 'per_client') {
      const { rows: ev } = await query('SELECT id, name FROM album_events WHERE album_id=$1 ORDER BY sort_order, id', [a.id]);
      events = ev;
    }
    const faceReady = photos.some(p => (p.face_count || 0) > 0);
    const vt = makeViewToken(a.id, role);
    res.json({
      role, vt, title: a.title, mode, theme, events, faceReady,
      photos: photos.map(p => ({ id: p.id, name: p.filename, event_id: p.event_id, faces: p.face_count || 0 })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🖼️ serve a photo (thumb|preview|orig) — needs valid view token
router.get('/:token/photo/:photoId/:type', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();
    const { rows } = await query('SELECT * FROM photos WHERE id=$1 AND album_id=$2', [req.params.photoId, a.id]);
    const p = rows[0];
    if (!p) return res.status(404).end();
    const rel = req.params.type === 'orig' ? p.storage_path : req.params.type === 'preview' ? p.preview_path : p.thumb_path;
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return res.status(404).end();
    res.sendFile(full);
  } catch { res.status(404).end(); }
});

// ⬇️ download one original
router.get('/:token/download/:photoId', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();
    const { rows } = await query('SELECT * FROM photos WHERE id=$1 AND album_id=$2', [req.params.photoId, a.id]);
    const p = rows[0];
    if (!p) return res.status(404).end();
    const full = path.join(ROOT, p.storage_path);
    if (!fs.existsSync(full)) return res.status(404).end();
    res.download(full, p.filename || `photo-${p.id}.jpg`);
  } catch { res.status(404).end(); }
});

// ⬇️ download ALL as zip (optionally one event via ?event=ID)
router.get('/:token/download-all', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();

    const eventId = req.query.event ? parseInt(req.query.event, 10) : null;
    let photos, zipLabel = a.title || 'gallery';
    if (eventId) {
      const r = await query('SELECT * FROM photos WHERE album_id=$1 AND event_id=$2 ORDER BY id', [a.id, eventId]);
      photos = r.rows;
      const ev = await query('SELECT name FROM album_events WHERE id=$1 AND album_id=$2', [eventId, a.id]);
      if (ev.rows[0]) zipLabel = `${a.title}-${ev.rows[0].name}`;
    } else {
      const r = await query('SELECT * FROM photos WHERE album_id=$1 ORDER BY id', [a.id]);
      photos = r.rows;
    }
    if (!photos.length) return res.status(404).json({ error: 'No photos' });

    const safe = zipLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.attachment(`${safe}.zip`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { try { res.status(500).end(); } catch {} });
    archive.pipe(res);
    for (const p of photos) {
      const full = path.join(ROOT, p.storage_path);
      if (fs.existsSync(full)) archive.file(full, { name: p.filename || `photo-${p.id}.jpg` });
    }
    archive.finalize();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🤳 selfie search → returns matching photo IDs (public, needs view token)
router.post('/:token/selfie', upload.single('selfie'), async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(401).json({ error: 'Unauthorized' }); }
    if (!req.file) return res.status(400).json({ error: 'No selfie' });

    // 🔒 use the engine this album was actually indexed with (per-album lock).
    // Fall back to the global default if older photos have no engine recorded.
    const { rows: eng } = await query(
      "SELECT face_engine FROM photos WHERE album_id=$1 AND face_indexed=true AND face_engine IS NOT NULL LIMIT 1", [a.id]);
    const engine = eng[0]?.face_engine || await getSetting('face_engine', 'vladmandic');
    const { rows: photos } = await query('SELECT id, faces FROM photos WHERE album_id=$1 AND face_indexed=true AND face_count>0', [a.id]);

    let ids = [];
    if (engine === 'aws') {
      const candidates = [];
      for (const p of photos) for (const f of (p.faces || [])) { if (f.imgB64) { candidates.push({ photo_id: p.id, imgB64: f.imgB64 }); break; } }
      const matches = await findMatchesAWS(req.file.path, candidates, 90);
      fs.unlink(req.file.path, () => {});
      const seen = new Set();
      for (const m of matches) if (!seen.has(m.photo_id)) { seen.add(m.photo_id); ids.push(m.photo_id); }
    } else {
      const q = await getFaceDescriptors(req.file.path);
      fs.unlink(req.file.path, () => {});
      if (!q.length) return res.status(400).json({ error: 'No face detected in your selfie — try another photo' });
      const candidates = [];
      for (const p of photos) for (const f of (p.faces || [])) if (f.descriptor) candidates.push({ photo_id: p.id, descriptor: f.descriptor });
      const matches = findMatches(q[0].descriptor, candidates, 0.5);
      const seen = new Set();
      for (const m of matches) if (!seen.has(m.photo_id)) { seen.add(m.photo_id); ids.push(m.photo_id); }
    }
    res.json({ matches: ids.length, photo_ids: ids });
  } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); res.status(500).json({ error: e.message }); }
});

export default router;
