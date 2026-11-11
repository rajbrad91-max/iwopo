/**
 * 🖨️ Print requests clients sent from their galleries.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { serverError } from '../../lib/httpError.js';
import { ownVendorId } from '../../lib/vendorScope.js';

const router = express.Router();

// which vendor am I?

// 🔒 list my albums
/**
 * 🖨️ GET /api/albums/requests → what clients have sent in, per gallery.
 *
 * Every gallery with a live selection, kept SEPARATE. One pile of everybody's
 * photographs mixed together is unusable — the whole point is knowing which
 * couple asked for what.
 *
 * 🔒 Scoped to the vendor on the token throughout: the albums, and the photos
 * read back through them.
 */
router.get('/requests', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v, selections: { some: {} } },     // 🔒 tenancy
      select: { id: true, title: true, client_email: true, cover_photo: true },
      orderBy: { id: 'desc' },
    });
    if (!albums.length) return res.json({ requests: [] });

    const ids = albums.map(a => a.id);
    const [sel, notes] = await Promise.all([
      prisma.selections.findMany({
        where: { album_id: { in: ids } },
        select: { album_id: true, photo_id: true, created_at: true },
        orderBy: { id: 'asc' },
      }),
      prisma.selection_notes.findMany({
        where: { album_id: { in: ids } },
        select: { album_id: true, note: true, updated_at: true, completed_at: true },
      }),
    ]);

    /* Filenames, so a request can be read without opening every thumbnail —
       and so it can be matched against what is on the editing machine. */
    const photos = await prisma.photos.findMany({
      where: { id: { in: sel.map(x => x.photo_id) }, album_id: { in: ids } },  // 🔒 belt and braces
      select: { id: true, filename: true },
    });
    const byPhoto = Object.fromEntries(photos.map(p => [p.id, p.filename]));
    const noteBy = Object.fromEntries(notes.map(n => [n.album_id, n]));

    const requests = albums.map(a => {
      const mine = sel.filter(x => x.album_id === a.id);
      const n = noteBy[a.id] || {};
      return {
        album_id: a.id,
        title: a.title,
        client_email: a.client_email || null,
        cover_photo: a.cover_photo || null,
        count: mine.length,
        sent_at: n.updated_at || mine[0]?.created_at || null,
        note: n.note || null,
        completed_at: n.completed_at || null,
        photos: mine.map(x => ({ id: x.photo_id, filename: byPhoto[x.photo_id] || null })),
      };
    }).filter(r => r.count > 0);

    /* Outstanding first — a done request is a record, an outstanding one is
       work waiting. */
    requests.sort((a, b) =>
      (a.completed_at ? 1 : 0) - (b.completed_at ? 1 : 0) ||
      new Date(b.sent_at || 0) - new Date(a.sent_at || 0));

    res.json({ requests });
  } catch (e) { serverError(res, e); }
});

/**
 * 🗑️ DELETE /api/albums/requests/:albumId → throw the whole order away.
 *
 * The client's selection, and the note that came with it. Used when an order
 * has been fulfilled and printed, or when a client sends a second selection
 * replacing the first.
 *
 * ⚠️ The PHOTOGRAPHS are untouched. Only the selection rows go — deleting a
 * client's choices must never delete their gallery, and those two live one
 * foreign key apart.
 */
router.delete('/requests/:albumId', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.albumId);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } });  // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });

    const { count } = await prisma.selections.deleteMany({ where: { album_id: id } });
    await prisma.selection_notes.deleteMany({ where: { album_id: id } });

    res.json({ ok: true, removed: count });
  } catch (e) { serverError(res, e); }
});

/**
 * 🖨️ PUT /api/albums/requests/:albumId → mark done, or put it back.
 */
router.put('/requests/:albumId', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.albumId);
  try {
    const own = await prisma.albums.findFirst({ where: { id, vendor_id: v }, select: { id: true } });  // 🔒 tenancy
    if (!own) return res.status(404).json({ error: 'Not found' });

    const done = !!req.body?.done;
    await prisma.selection_notes.upsert({
      where: { album_id: id },
      update: { completed_at: done ? new Date() : null },
      create: { album_id: id, note: '', updated_at: new Date(), completed_at: done ? new Date() : null },
    });
    res.json({ ok: true, done });
  } catch (e) { serverError(res, e); }
});

export default router;
