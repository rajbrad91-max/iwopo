import { GALLERIES_ROOT } from '../config/paths.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { createRequire } from 'module';
import prisma from '../config/prisma.js';
import { getFaceDescriptors, findMatches } from '../lib/faceEngine.js';
import { getFaceDescriptorsAWS, findMatchesAWS } from '../lib/faceAWS.js';
import { getSetting } from '../lib/settings.js';
import { albumClusters, clusterPhotoIds } from '../lib/faceCluster.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const upload = multer({ dest: '/tmp/iwopo-selfie' });

// 📶 photos read in filename order, case-insensitive, with digit runs zero-padded
// so they compare numerically (IMG_2 before IMG_10). This ordering is a Postgres
// regexp expression that Prisma's orderBy can't express, so these reads use
// $queryRawUnsafe with bound parameters — the only raw SQL in the app.
// NOTE: the regex backslashes must survive JS string escaping, hence \\d / \\1.
const NAT_SORT = `ORDER BY regexp_replace(lower(filename), '(\\d+)', lpad('\\1', 10, '0'), 'g') ASC, id ASC`;

async function photosInAlbum(albumId) {
  return prisma.$queryRawUnsafe(
    `SELECT id, filename, event_id, face_count FROM photos WHERE album_id = $1 ${NAT_SORT}`,
    albumId
  );
}
async function photosInEvent(albumId, eventId) {
  return prisma.$queryRawUnsafe(
    `SELECT * FROM photos WHERE album_id = $1 AND event_id = $2 ${NAT_SORT}`,
    albumId, eventId
  );
}
async function allPhotoRowsInAlbum(albumId) {
  return prisma.$queryRawUnsafe(
    `SELECT * FROM photos WHERE album_id = $1 ${NAT_SORT}`,
    albumId
  );
}

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f',
  title_text: 'Private gallery', subtitle_text: 'Your photos, ready to view and download',
  tagline_text: '',
};
async function getTheme(vendorId) {
  const t = await prisma.gallery_theme.findUnique({ where: { vendor_id: vendorId } });
  return t || { ...THEME_DEFAULTS };
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
  return prisma.albums.findFirst({ where: { public_token: token } });
}

// 🌐 whole-gallery index: list all albums for a vendor (covers + names + album tokens)
router.get('/vendor/:token', async (req, res) => {
  try {
    const v = await prisma.vendors.findFirst({
      where: { gallery_token: req.params.token },
      select: { id: true, business_name: true },
    });
    if (!v) return res.status(404).json({ error: 'Gallery not found' });
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v.id },                 // 🔒 only this vendor's galleries
      orderBy: [{ created_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      select: {
        public_token: true, title: true, category: true, cover_photo: true,
        _count: { select: { photos: true } },
      },
    });
    res.json({
      vendor: { name: v.business_name },
      theme: await getTheme(v.id),
      albums: albums.map(a => ({ token: a.public_token, title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: a._count.photos })),
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
    const n = await prisma.photos.count({ where: { album_id: a.id } });
    const theme = await getTheme(a.vendor_id);
    res.json({ album: { title: a.title, category: a.category, cover: !!a.cover_photo, photo_count: n, id: a.id, token: a.public_token, mode: 'per_client', cover_focus: a.cover_focus || '50% 50%' }, theme });
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

    const photos = await photosInAlbum(a.id);     // natural filename order
    const theme = await getTheme(a.vendor_id);
    // per-client: photos are always grouped under events
    const events = await prisma.album_events.findMany({
      where: { album_id: a.id },
      select: { id: true, name: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
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
    const p = await prisma.photos.findFirst({
      where: { id: Number(req.params.photoId), album_id: a.id },   // 🔒 photo must be in THIS album
    });
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
    const p = await prisma.photos.findFirst({
      where: { id: Number(req.params.photoId), album_id: a.id },   // 🔒 tenancy
    });
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
      photos = await photosInEvent(a.id, eventId);
      const ev = await prisma.album_events.findFirst({
        where: { id: eventId, album_id: a.id },    // 🔒 event must belong to this album
        select: { name: true },
      });
      if (ev) zipLabel = `${a.title}-${ev.name}`;
    } else {
      photos = await allPhotoRowsInAlbum(a.id);
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
    const eng = await prisma.photos.findFirst({
      where: { album_id: a.id, face_indexed: true, face_engine: { not: null } },
      select: { face_engine: true },
    });
    const engine = eng?.face_engine || await getSetting('face_engine', 'vladmandic');
    const photos = await prisma.photos.findMany({
      where: { album_id: a.id, face_indexed: true, face_count: { gt: 0 } },
      select: { id: true, faces: true },
    });

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
      const grouped = await prisma.photo_faces.groupBy({
        by: ['cluster_id'],
        where: {
          face_clusters: { album_id: a.id },      // 🔒 clusters of THIS album
          photos: { event_id: eventId },
        },
        _count: { photo_id: true },
      });
      const faces = grouped
        .filter(g => g.cluster_id != null && g._count.photo_id > 0)   // HAVING COUNT > 0
        .map(g => ({ id: g.cluster_id, count: g._count.photo_id }))
        .sort((x, y) => y.count - x.count || x.id - y.id);
      return res.json({ faces });
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

    // NOTE: face_clusters.cover_photo_id has no FK, so Prisma generates no
    // relation for it — the cover photo must be fetched as a second query.
    const cluster = await prisma.face_clusters.findFirst({
      where: { id: Number(req.params.clusterId), album_id: a.id },   // 🔒 cluster must be in THIS album
      select: { cover_box: true, cover_photo_id: true },
    });
    if (!cluster?.cover_photo_id) return res.status(404).end();
    const coverPhoto = await prisma.photos.findFirst({
      where: { id: cluster.cover_photo_id, album_id: a.id },         // 🔒 still scoped to this album
      select: { preview_path: true },
    });
    if (!coverPhoto?.preview_path) return res.status(404).end();
    const c = { cover_box: cluster.cover_box, preview_path: coverPhoto.preview_path };

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

// 📩 admin-only: save the admin's selection to the studio, and delete photos.
// These require the view token to have role 'admin' (admin gallery password).
function requireAdmin(vt, albumId) {
  const rec = checkViewToken(vt, albumId);
  return rec && rec.role === 'admin' ? rec : null;
}

// admin sends their selection → replace this album's saved selection
router.post('/:token/selection', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!requireAdmin(req.query.vt, a.id)) return res.status(403).json({ error: 'Admin access required' });
    const ids = Array.isArray(req.body?.photo_ids) ? req.body.photo_ids.map(n => parseInt(n, 10)).filter(Boolean) : [];
    // only keep ids that actually belong to this album 🔒
    const valid = await prisma.photos.findMany({
      where: { album_id: a.id, id: { in: ids } },
      select: { id: true },
    });
    const keep = valid.map(r => r.id);
    // replace the album's selection with the new set
    await prisma.selections.deleteMany({ where: { album_id: a.id } });
    if (keep.length) {
      await prisma.selections.createMany({
        data: keep.map(id => ({ album_id: a.id, photo_id: id })),
        skipDuplicates: true,                      // ON CONFLICT DO NOTHING
      });
    }
    // save the note the client sent along with the selection (blank clears it)
    const note = String(req.body?.note || '').trim().slice(0, 4000);
    await prisma.selection_notes.upsert({
      where: { album_id: a.id },
      update: { note, updated_at: new Date() },
      create: { album_id: a.id, note, updated_at: new Date() },
    });
    res.json({ ok: true, count: keep.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// admin deletes a photo (all 3 file tiers + DB row; cascades favorites/selections)
router.delete('/:token/photo/:photoId', async (req, res) => {
  try {
    const a = await findAlbum(req.params.token);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!requireAdmin(req.query.vt, a.id)) return res.status(403).json({ error: 'Admin access required' });
    const where = { id: Number(req.params.photoId), album_id: a.id };   // 🔒 tenancy
    const p = await prisma.photos.findFirst({
      where,
      select: { storage_path: true, preview_path: true, thumb_path: true },
    });
    if (!p) return res.status(404).json({ error: 'Not found' });
    await prisma.photos.deleteMany({ where });
    for (const rel of [p.storage_path, p.preview_path, p.thumb_path]) {
      if (!rel) continue;
      try { fs.unlinkSync(path.join(ROOT, rel)); } catch { /* already gone — fine */ }
    }
    res.json({ ok: true });
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
    const rows = await prisma.favorites.findMany({
      where: { album_id: a.id, email },            // 🔒 scoped to this album + this person
      select: { photo_id: true },
    });
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
    // make sure the photo really belongs to this album 🔒
    const pr = await prisma.photos.findFirst({ where: { id: photoId, album_id: a.id }, select: { id: true } });
    if (!pr) return res.status(404).json({ error: 'Photo not found' });
    await prisma.favorites.createMany({
      data: [{ album_id: a.id, photo_id: photoId, email }],
      skipDuplicates: true,                        // ON CONFLICT DO NOTHING
    });
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
    await prisma.favorites.deleteMany({ where: { album_id: a.id, photo_id: photoId, email } }); // 🔒 tenancy
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
