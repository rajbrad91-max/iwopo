import express from 'express';
import multer from 'multer';
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
  const { title, category, guest_username, guest_password, admin_username, admin_password } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    const { rows } = await query(
      `INSERT INTO albums (vendor_id, title, category, guest_username, guest_password, admin_username, admin_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [v, title, category || null, guest_username || null, guest_password || null, admin_username || null, admin_password || null]);
    res.status(201).json({ album: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 album detail + photos (tenant-checked)
router.get('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows: a } = await query('SELECT * FROM albums WHERE id=$1 AND vendor_id=$2', [req.params.id, v]);
    if (!a[0]) return res.status(404).json({ error: 'Album not found' });
    const { rows: photos } = await query('SELECT * FROM photos WHERE album_id=$1 ORDER BY created_at', [req.params.id]);
    res.json({ album: a[0], photos });
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
      const { rows } = await query(
        `INSERT INTO photos (album_id, vendor_id, filename, storage_path, thumb_path, preview_path)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, v, f.originalname, rel(origName), rel(thumbName), rel(prevName)]);
      saved.push(rows[0]);
    }
    res.status(201).json({ uploaded: saved.length, photos: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
