/**
 * ❤️ Favourites, the client’s selection, downloads and the selection zip.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import * as objects from '../../lib/objectStore.js';
import fs from 'fs';
import path from 'path';
import { photoZip } from '../../lib/photoZip.js';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { byFilename } from '../../lib/naturalSort.js';
import { tokenStillValid } from '../../lib/tokenRevocation.js';
import { gate } from '../../lib/entitlements.js';
import { serverError } from '../../lib/httpError.js';
import { downloadFailed, downloadCrashed } from '../../lib/downloadPage.js';
import { downloadLog } from '../../lib/galleryDownloads.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { ROOT } from './shared.js';
import { JWT_SECRET } from '../../config/secrets.js';   // 🔑 one secret, no fallback

const router = express.Router();

// ⭐ favorites a vendor received for one of their albums, grouped by client email.
// Ownership enforced: the album must belong to the requesting vendor.
router.get('/:id/favorites', requireAuth, async (req, res) => {
  try {
    const v = ownVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

// 📩 the selection the client's admin sent to the studio, grouped by event.
router.get('/:id/selection', requireAuth, async (req, res) => {
  try {
    const v = ownVendorId(req);
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
      byFilename(a.filename, b.filename));          // 2 before 10
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
  } catch (e) { serverError(res, e); }
});

// ✅ mark the client's selection as handled (or clear that flag)
router.put('/:id/selection/complete', requireAuth, async (req, res) => {
  try {
    const v = ownVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

// 🗑️ clear the sent selection and its note — the photos themselves are untouched
router.delete('/:id/selection', requireAuth, async (req, res) => {
  try {
    const v = ownVendorId(req);
    const id = Number(req.params.id);
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } }); // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });
    await prisma.selections.deleteMany({ where: { album_id: id } });
    await prisma.selection_notes.deleteMany({ where: { album_id: id } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 📦 download the client's selected photos as a zip (token via header or ?token= for links)
// 📊 a gallery's download log — the Studio feature gallery_insights (lib/galleryDownloads.js). Owner only.
router.get('/:id/downloads', requireAuth, gate('gallery_insights'), async (req, res) => {
  try {
    const album = await prisma.albums.findFirst({
      where: { id: Number(req.params.id), vendor_id: req.user.vendor_id },   // 🔒 tenancy — the vendor from the token
      select: { id: true },
    });
    if (!album) return res.status(404).json({ error: 'Gallery not found' });
    res.json(await downloadLog(album.id));
  } catch (e) { serverError(res, e); }
});

router.get('/:id/selection.zip', async (req, res) => {
  const SECRET = JWT_SECRET;
  const tok = (req.headers.authorization?.split(' ')[1]) || req.query.token;
  let user;
  try { user = jwt.verify(tok, SECRET); } catch { return downloadFailed(req, res, 401, 'Invalid token', 'Your sign-in has expired — open iwopo and try again.'); }
  // 🎟️ the signature is fine, but the token may have been cancelled since
  if (!await tokenStillValid(user)) return downloadFailed(req, res, 401, 'Session ended', 'Your sign-in has expired — open iwopo and try again.');
  const id = Number(req.params.id);
  try {
    const own = await prisma.albums.findFirst({
      where: { id, vendor_id: user.vendor_id },   // 🔒 tenancy
      select: { id: true, title: true },
    });
    if (!own) return downloadFailed(req, res, 404, 'Not found', "This isn't available any more.");
    const sels = await prisma.selections.findMany({
      where: { album_id: id },
      include: { photos: { select: { id: true, vendor_id: true, storage_path: true, filename: true } } },
    });
    const rows = sels
      .map(s => s.photos)
      .filter(Boolean)
      .sort((a, b) => byFilename(a.filename, b.filename));   // 2 before 10
    if (!rows.length) return downloadFailed(req, res, 404, 'Nothing selected', "The client hasn't picked any photos yet.");
    const safe = `${own.title || 'gallery'}-selection`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.attachment(`${safe}.zip`);
    const archive = photoZip();   // stored: photographs are already compressed (lib/photoZip.js)
    archive.on('error', () => { try { res.status(500).end(); } catch { /* stream already closed */ } });
    archive.pipe(res);
    /* The vendor's zip of what a couple chose. It was reading the disk alone,
       so once storage stopped keeping local copies it would have produced an
       empty archive — with no error, which is the worst way for it to fail. */
    for (const p of rows) {
      const name = p.filename || `photo-${p.id}.jpg`;
      const parts = String(p.storage_path || '').split('/').filter(Boolean);
      if (parts.length >= 3 && await objects.enabled(objects.PRIVATE)) {
        try {
          const o = await objects.getStream(objects.PRIVATE,
            objects.keyFor(p.vendor_id, 'galleries', parts[1], parts[2]));
          archive.append(o.stream, { name });        // streamed, never buffered
          continue;
        } catch { /* not in R2 — try the disk */ }
      }
      const full = path.join(ROOT, p.storage_path);
      if (fs.existsSync(full)) archive.file(full, { name });
    }
    archive.finalize();
  } catch (e) { downloadCrashed(req, res, e); }
});

export default router;
