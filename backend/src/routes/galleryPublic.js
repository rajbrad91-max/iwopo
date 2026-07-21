import { GALLERIES_ROOT } from '../config/paths.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { createRequire } from 'module';
import { query } from '../config/db.js';
import { getFaceDescriptors, findMatches } from '../lib/faceEngine.js';
import { getFaceDescriptorsAWS, findMatchesAWS } from '../lib/faceAWS.js';
import { getSetting } from '../lib/settings.js';
import { albumClusters, clusterPhotoIds } from '../lib/faceCluster.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const upload = multer({ dest: '/tmp/iwopo-selfie' });

// 📶 photos read in filename order, case-insensitive, with digit runs zero-padded
// so they compare numerically (IMG_2 before IMG_10).
const NAT_ORDER = `
  regexp_replace(lower(filename), '(\\d+)', lpad('\\1', 10, '0'), 'g') ASC,
  id ASC`;

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f',
  title_text: 'Private gallery', subtitle_text: 'Your photos, ready to view and download',
  tagline_text: '',
};
async function getTheme(vendorId) {
  const { rows } = await query('SELECT * FROM gallery_theme WHERE vendor_id=$1', [vendorId]);
  return rows[0] || { ...THEME_DEFAULTS };
}

const router = express.Router();
const ROOT = GALLERIES_ROOT;

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
    res.json({ album: { title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: c[0].n, id: a.id, token: a.public_token, mode: 'per_client', cover_focus: a.cover_focus || '50% 50%' }, theme });
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

    const { rows: photos } = await query(
      `SELECT id, filename, event_id, face_count FROM photos
       WHERE album_id=$1 ORDER BY ${NAT_ORDER}`, [a.id]);
    const theme = await getTheme(a.vendor_id);
    // per-client: photos are always grouped under events
    const { rows: events } = await query('SELECT id, name FROM album_events WHERE album_id=$1 ORDER BY sort_order, id', [a.id]);
    const faceReady = photos.some(p => (p.face_count || 0) > 0);
    const vt = makeViewToken(a.id, role);
    res.json({
      role, vt, title: a.title, mode: 'per_client', theme, events, faceReady,
      photos: photos.map(p => ({ id: p.id, name: p.filename, event_id: p.event_id, faces: p.face_count || 0 })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🖼️ serve a photo (thumb|full|orig) — needs valid view token
router.get('/:token/photo/:photoId/:type', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();
    const { rows } = await query('SELECT * FROM photos WHERE id=$1 AND album_id=$2', [req.params.photoId, a.id]);
    const p = rows[0];
    if (!p) return res.status(404).end();
    // 3 tiers: orig (download/zoom 1:1) · full 2200px (preview_path, default display) · thumb (grid)
    let rel;
    if (req.params.type === 'orig') rel = p.storage_path;
    else if (req.params.type === 'thumb') rel = p.thumb_path;
    else rel = p.preview_path; // 'full' → the 2200px display file (preview_path column)
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
      const r = await query(`SELECT * FROM photos WHERE album_id=$1 AND event_id=$2 ORDER BY ${NAT_ORDER}`, [a.id, eventId]);
      photos = r.rows;
      const ev = await query('SELECT name FROM album_events WHERE id=$1 AND album_id=$2', [eventId, a.id]);
      if (ev.rows[0]) zipLabel = `${a.title}-${ev.rows[0].name}`;
    } else {
      const r = await query(`SELECT * FROM photos WHERE album_id=$1 ORDER BY ${NAT_ORDER}`, [a.id]);
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

// 🧑‍🤝‍🧑 face circles for this album — one per person, most photos first
router.get('/:token/faces', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).json({ error: 'Unauthorized' });

    const eventId = req.query.event ? parseInt(req.query.event, 10) : null;
    if (eventId) {
      // event-scoped: count each person's photos WITHIN this event only, hide anyone with none
      const { rows } = await query(
        `SELECT c.id, COUNT(pf.photo_id)::int AS count
         FROM face_clusters c
         JOIN photo_faces pf ON pf.cluster_id = c.id
         JOIN photos p ON p.id = pf.photo_id AND p.event_id = $2
         WHERE c.album_id = $1
         GROUP BY c.id
         HAVING COUNT(pf.photo_id) > 0
         ORDER BY COUNT(pf.photo_id) DESC, c.id ASC`, [a.id, eventId]);
      return res.json({ faces: rows.map(r => ({ id: r.id, count: r.count })) });
    }

    const clusters = await albumClusters(a.id);
    res.json({
      faces: clusters.map(c => ({ id: c.id, count: c.photo_count })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🖼️ the circular thumbnail for one person — the face cropped out of its photo
router.get('/:token/face/:clusterId', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();

    const { rows } = await query(
      `SELECT c.cover_box, p.preview_path
       FROM face_clusters c JOIN photos p ON p.id = c.cover_photo_id
       WHERE c.id=$1 AND c.album_id=$2`, [req.params.clusterId, a.id]);
    const c = rows[0];
    if (!c) return res.status(404).end();

    const full = path.join(ROOT, c.preview_path);
    if (!fs.existsSync(full)) return res.status(404).end();

    const box = c.cover_box || {};
    const bx = box._x ?? box.x, by = box._y ?? box.y;
    const bw = box._width ?? box.width, bh = box._height ?? box.height;

    // no box (AWS crops) → just serve the photo and let the browser round it
    if (bw == null) { res.type('webp'); return res.sendFile(full); }

    const meta = await sharp(full).metadata();
    // pad the crop out so it's a head-and-shoulders circle, not a tight face
    const pad = Math.round(Math.max(bw, bh) * 0.45);
    const left = Math.max(0, Math.round(bx - pad));
    const top = Math.max(0, Math.round(by - pad));
    const size = Math.round(Math.max(bw, bh) + pad * 2);
    const width = Math.min(size, meta.width - left);
    const height = Math.min(size, meta.height - top);

    const buf = await sharp(full)
      .extract({ left, top, width, height })
      .resize(160, 160, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    res.type('webp');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch { res.status(404).end(); }
});

// 📸 which photos a given person appears in
router.get('/:token/face/:clusterId/photos', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).json({ error: 'Unauthorized' });
    const ids = await clusterPhotoIds(a.id, req.params.clusterId);
    res.json({ photo_ids: ids });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⭐ favorites — clients mark photos, saved server-side keyed by album + email.
// Email is normalized (trim + lowercase) so the same person's list follows them
// across devices when they re-enter the same address.
const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 160);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// list this email's favorited photo ids for the album
router.get('/:token/favorites', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).json({ error: 'Unauthorized' });
    const email = normEmail(req.query.email);
    if (!validEmail(email)) return res.json({ photo_ids: [] });
    const { rows } = await query(
      'SELECT photo_id FROM favorites WHERE album_id=$1 AND email=$2',
      [a.id, email]
    );
    res.json({ photo_ids: rows.map(r => r.photo_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// add a favorite (idempotent via the unique constraint)
router.post('/:token/favorites', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).json({ error: 'Unauthorized' });
    const email = normEmail(req.body?.email);
    const photoId = parseInt(req.body?.photo_id, 10);
    if (!validEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (!photoId) return res.status(400).json({ error: 'photo_id required' });
    // make sure the photo really belongs to this album
    const { rows: pr } = await query('SELECT id FROM photos WHERE id=$1 AND album_id=$2', [photoId, a.id]);
    if (!pr[0]) return res.status(404).json({ error: 'Photo not found' });
    await query(
      `INSERT INTO favorites (album_id, photo_id, email)
       VALUES ($1,$2,$3) ON CONFLICT (album_id, photo_id, email) DO NOTHING`,
      [a.id, photoId, email]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// remove a favorite
router.delete('/:token/favorites/:photoId', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).json({ error: 'Unauthorized' });
    const email = normEmail(req.query.email);
    const photoId = parseInt(req.params.photoId, 10);
    if (!validEmail(email) || !photoId) return res.status(400).json({ error: 'email and photo_id required' });
    await query('DELETE FROM favorites WHERE album_id=$1 AND photo_id=$2 AND email=$3', [a.id, photoId, email]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
