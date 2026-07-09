import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { query } from '../config/db.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

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
    res.json({ album: { title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: c[0].n, id: a.id, token: a.public_token } });
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

    const { rows: photos } = await query('SELECT id, filename FROM photos WHERE album_id=$1 ORDER BY id', [a.id]);
    const vt = makeViewToken(a.id, role);
    res.json({ role, vt, title: a.title, photos: photos.map(p => ({ id: p.id, name: p.filename })) });
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

// ⬇️ download ALL as zip
router.get('/:token/download-all', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).end();
    if (!checkViewToken(req.query.vt, a.id)) return res.status(401).end();
    const { rows: photos } = await query('SELECT * FROM photos WHERE album_id=$1 ORDER BY id', [a.id]);
    if (!photos.length) return res.status(404).json({ error: 'No photos' });

    const safe = (a.title || 'gallery').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
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

export default router;
