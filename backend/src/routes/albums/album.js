/**
 * 📸 One album: editing, passwords, the email to the client, cover, events, and deleting it.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import { renderEmail } from '../../lib/emailTemplates.js';   // ✉️ the vendor's "Gallery shared" email
import { clientBaseUrl } from '../../lib/vendorHosts.js';
import { sendLeadEmail } from '../email.js';   // 📤 a static import: a wrong path fails at start-up, not when a client is waiting
import express from 'express';
import * as objects from '../../lib/objectStore.js';
import { orderEvents } from '../../lib/albumEvents.js';
import { writeMaster, writeCrops, coverNames, coverCandidates, retiredCoverNames } from '../../lib/coverImage.js';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { deleteCollection } from '../../lib/faceAWS.js';
import { withLocalFile, dropLocal } from '../../lib/localFile.js';
import { naturalSort } from '../../lib/naturalSort.js';
import { hashSharePassword, sealPassword, openPassword } from '../../lib/sharePassword.js';
import { serverError } from '../../lib/httpError.js';
import { quiet } from '../../lib/quiet.js';
import { noteFailure } from '../../lib/noteFailure.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { ROOT, galleryKey, upload, cleanPw, cleanCategory, publicAlbum, checkGalleryPasswords } from './shared.js';

const router = express.Router();


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
      dropLocal(path.join(dir, f));
    } catch (e) { console.error('[cover] R2 upload failed for', f, e.message); }
  }));
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
  for (const f of [...coverNames(base), ...retiredCoverNames(base), `${base}_master.webp`]) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* already gone */ }
    if (await objects.enabled(objects.PRIVATE)) {
      try { await objects.deleteObject(objects.PRIVATE, galleryKey(vendorId, albumId, f)); } catch { /* fine */ }
    }
  }
}

/**
 * Remove a deleted album's objects from R2, after the response has gone.
 *
 * Deleted in batches rather than one at a time: three hundred sequential round
 * trips to Cloudflare is most of a minute, and there is no reason for them to
 * wait on each other. Twenty at a time is brisk without hammering the API.
 */
async function cleanupAlbumObjects(vendorId, albumId) {
  if (!await objects.enabled(objects.PRIVATE)) return;
  try {
    const prefix = objects.keyFor(vendorId, 'galleries', String(albumId)) + '/';
    const keys = await objects.listAll(objects.PRIVATE, prefix);
    for (let i = 0; i < keys.length; i += 20) {
      await Promise.all(keys.slice(i, i + 20).map(o =>
        objects.deleteObject(objects.PRIVATE, o.key).catch(quiet('albums · objects.deleteObject'))));
    }
    if (keys.length) console.log('[album] removed', keys.length, 'objects under', prefix);
  } catch (e) { console.error('[album] R2 cleanup failed:', e.message); }
}

router.put('/:id', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  const b = req.body || {};
  const guest_password = cleanPw(b.guest_password);
  const admin_password = cleanPw(b.admin_password);
  try {
    const pwErr = await checkGalleryPasswords(v, [guest_password, admin_password]);
    if (pwErr) return res.status(400).json({ error: pwErr });
    /* ⚠️ Only what was SENT is written. This used to write every column on
       every save — so the panel, which sends title, category, email and the
       passwords, silently switched face_ai off and wiped the expiry dates of
       any album it saved. */
    const data = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (b.title) data.title = String(b.title).slice(0, 160);   // blank keeps the existing title
    if (has('category')) data.category = cleanCategory(b.category);
    if (has('client_email')) data.client_email = b.client_email || null;
    if (has('guest_username')) data.guest_username = b.guest_username || null;
    if (has('admin_username')) data.admin_username = b.admin_username || null;
    if (has('exp_enabled')) data.exp_enabled = !!b.exp_enabled;
    if (has('exp_from_date')) data.exp_from_date = b.exp_from_date ? new Date(b.exp_from_date) : null;
    if (has('exp_date')) data.exp_date = b.exp_date ? new Date(b.exp_date) : null;
    if (has('exp_notes')) data.exp_notes = b.exp_notes || null;
    if (has('face_ai')) data.face_ai = !!b.face_ai;

    /* A blank password field means "leave it as it is", not "remove it" —
       treating it as a removal would silently unlock the gallery. */
    if (guest_password) {
      data.guest_password = await hashSharePassword(guest_password);
      data.guest_password_enc = sealPassword(guest_password);
    }
    if (admin_password) {
      data.admin_password = await hashSharePassword(admin_password);
      data.admin_password_enc = sealPassword(admin_password);
    }
    // 🔒 tenancy: scope the update itself by vendor, so it can't touch another vendor's album
    const { count } = await prisma.albums.updateMany({ where: { id, vendor_id: v }, data });
    if (!count) return res.status(404).json({ error: 'Not found' });
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album: publicAlbum(album) });
  } catch (e) { serverError(res, e); }
});

/**
 * 👁️ GET /api/albums/:id/passwords → the gallery's passwords, readable.
 *
 * For the eye button and the Send Instructions email. 🔒 The album must be
 * this vendor's. An album whose passwords were set before readable copies
 * existed comes back null with *_set: true — the vendor types a new one.
 */
router.get('/:id/passwords', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  try {
    const a = await prisma.albums.findFirst({
      where: { id: Number(req.params.id), vendor_id: v },        // 🔒 tenancy
      select: { guest_password: true, admin_password: true, guest_password_enc: true, admin_password_enc: true },
    });
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store');
    res.json({
      guest: openPassword(a.guest_password_enc), guest_set: !!a.guest_password,
      admin: openPassword(a.admin_password_enc), admin_set: !!a.admin_password,
    });
  } catch (e) { serverError(res, e); }
});

/**
 * 📧 The gallery email for one album: the vendor's "Gallery shared" email (Settings → Email templates) filled with
 * this album's name, its passwords and the vendor's client-section link — plain text, or their HTML design.
 * `pw` may carry passwords typed in the form and not saved yet; otherwise the stored readable copies. An album
 * set before those existed has none, so its placeholder stays visible — a blank line is worse than an obvious gap.
 */
async function galleryEmail(v, a, pw = {}) {
  const [ven, base] = await Promise.all([
    prisma.vendors.findUnique({ where: { id: v }, select: { gallery_token: true } }),
    clientBaseUrl(v),
  ]);
  return renderEmail(v, 'gallery_shared', {
    client_name: a.title || 'Client',
    link: ven?.gallery_token ? `${base}/gallery/${ven.gallery_token}` : base,
    admin_password: pw.admin || openPassword(a.admin_password_enc) || '(type the password here)',
    guest_password: pw.guest || openPassword(a.guest_password_enc) || '(type the password here)',
  });
}
const typedPasswords = (b) => ({ guest: typeof b?.guest === 'string' ? b.guest : undefined, admin: typeof b?.admin === 'string' ? b.admin : undefined });

// 📧 the gallery email as it will go — what the Send window shows
router.post('/:id/email-instructions/preview', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  try {
    const a = await prisma.albums.findFirst({ where: { id: Number(req.params.id), vendor_id: v } });   // 🔒 tenancy
    if (!a) return res.status(404).json({ error: 'Not found' });
    const m = await galleryEmail(v, a, typedPasswords(req.body));
    res.set('Cache-Control', 'no-store');   // it carries the passwords
    res.json({ to: a.client_email || '', subject: m.subject, body: m.body, html: m.html || null });
  } catch (e) { serverError(res, e); }
});

// 🔒 email the gallery to the client
router.post('/:id/email-instructions', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const a = await prisma.albums.findFirst({ where: { id, vendor_id: v } });   // 🔒 tenancy
    if (!a) return res.status(404).json({ error: 'Not found' });

    // recipient: explicit override from the Send window, else the album's stored client_email
    const to = (req.body.email || a.client_email || '').trim();
    if (!to) return res.status(400).json({ error: 'No recipient email' });

    // the vendor's email for this album — or, when they changed the words in the Send window, their text as typed
    const m = await galleryEmail(v, a, typedPasswords(req.body));
    const typed = typeof req.body.body === 'string' && req.body.body.trim() ? req.body.body : null;

    // remember the entered email on the album for next time
    if (req.body.email && req.body.email !== a.client_email) {
      await prisma.albums.updateMany({ where: { id: a.id, vendor_id: v }, data: { client_email: to } });
    }

    const lead = { vendor_id: v, email: to, name: a.title };
    await sendLeadEmail(req, lead, m.subject, typed || m.body, { html: typed ? undefined : m.html });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🔒 upload/replace cover photo → a WebP master and every rendition (lib/coverImage.js)
router.post('/:id/cover', requireAuth, upload.single('cover'), async (req, res) => {
  const v = ownVendorId(req);
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
    await coverToR2(v, id, dir, [master, ...coverNames(base)]);
    await removeOldCover(v, id, dir);            // whatever the previous cover was

    await prisma.albums.updateMany({
      where: { id, vendor_id: v },
      data: { cover_photo: `${base}.webp`, cover_focus: /^\d{1,3}%\s\d{1,3}%$/.test(focus) ? focus : '50% 50%' },
    });
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album: publicAlbum(album) });
  } catch (e) { serverError(res, e); }
});

// 🎯 save the cover focal point ("X% Y%") so covers frame well on any aspect ratio
router.put('/:id/cover-focus', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
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
        /* The master may only exist in R2, so it is fetched to a temp file to
           cut from. A cover uploaded before masters existed has none at all and
           simply keeps its old crop. */
        const done = await withLocalFile(
          path.join(dir, `${base}_master.webp`),
          objects.PRIVATE, galleryKey(v, id, `${base}_master.webp`),
          async (master) => {
            await writeCrops(master, dir, base, focus);
            await coverToR2(v, id, dir, coverNames(base));
            return true;
          },
        );
        if (!done) console.warn('[cover] no master for album', id, '— crop unchanged');
        // a cover uploaded before the master existed simply keeps its old crop;
        // the focal point still moves for anything uploaded since
      }
    } catch (e) { console.error('[cover] re-crop failed:', e.message); }
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });
    res.json({ album: publicAlbum(album) });
  } catch (e) { serverError(res, e); }
});

// 🌐 public cover image
router.get('/cover/:id', async (req, res) => {
  try {
    const a = await prisma.albums.findUnique({
      where: { id: Number(req.params.id) },
      select: { cover_photo: true, vendor_id: true },
    });
    if (!a?.cover_photo) return res.status(404).end();
    // "?v=tall" for the phone shape, "?s=1920|800|tiny" for a smaller size; the nearest that exists is served
    const files = coverCandidates(a.cover_photo, req.query.v, req.query.s);
    for (const f of files) if (await serveCoverFromR2(res, a.vendor_id, Number(req.params.id), f)) return;
    const disk = files.map(f => path.join(ROOT, String(req.params.id), f)).find(p => fs.existsSync(p));
    if (!disk) return res.status(404).end();
    res.sendFile(disk, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch { res.status(404).end(); }
});

// 🔒 album detail + photos (tenant-checked)
router.get('/:id', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    const album = await prisma.albums.findFirst({ where: { id, vendor_id: v } });   // 🔒 tenancy
    if (!album) return res.status(404).json({ error: 'Album not found' });
    /* By filename, not upload time. A vendor dragging in a folder does not
       control the order the browser hands the files over, so upload time is
       whatever the machine happened to do — and the client's page sorts by
       filename, so the two disagreed about the same album. */
    /* 📦 Without `faces`. That column holds 128 numbers per face — about 1.7 MB
       on a 500-photo album — and the panel never reads it. It was fetched and
       re-sent every few seconds during an upload, for every vendor uploading.
       The face data itself is untouched: circles, Find me and Live Shoot read
       it from the database on the server. */
    const photos = naturalSort(await prisma.photos.findMany({
      where: { album_id: id, vendor_id: v },        // 🔒 tenancy
      omit: { faces: true },
      orderBy: { id: 'asc' },
    }));
    const events = await prisma.album_events.findMany({
      where: { album_id: id, vendor_id: v },        // 🔒 tenancy
      select: { id: true, name: true, sort_order: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json({ album: publicAlbum(album), photos, events: orderEvents(events) });
  } catch (e) { serverError(res, e); }
});

// 🔒 events CRUD (per-client mode)
router.post('/:id/events', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

router.put('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
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
  } catch (e) { serverError(res, e); }
});

/**
 * 🗑️ Delete a folder AND everything in it.
 *
 * The foreign key is ON DELETE SET NULL, so removing the row left every
 * photograph in the album with no folder at all. They were not deleted, not
 * visible where they had been, and — once a Videos folder existed — turned up
 * under it, because that was the only folder left for them to fall into.
 *
 * Deleting a folder means deleting its contents. Anything else is a vendor
 * pressing delete and watching fifteen photographs move somewhere they do not
 * belong.
 */
router.delete('/:id/events/:eventId', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const albumId = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  try {
    const own = await prisma.album_events.findFirst({
      where: { id: eventId, album_id: albumId, vendor_id: v },   // 🔒 tenancy
      select: { id: true },
    });
    if (!own) return res.status(404).json({ error: 'Not found' });

    const doomed = await prisma.photos.findMany({
      where: { album_id: albumId, vendor_id: v, event_id: eventId },   // 🔒
      select: { id: true, storage_path: true, preview_path: true, thumb_path: true },
    });

    await prisma.photos.deleteMany({ where: { album_id: albumId, vendor_id: v, event_id: eventId } });
    await prisma.album_events.deleteMany({ where: { id: eventId, album_id: albumId, vendor_id: v } });

    // files after the rows, so a storage failure leaks an object rather than
    // leaving a photograph the vendor cannot remove
    const r2on = await objects.enabled(objects.PRIVATE);
    const dir = path.join(ROOT, String(v), String(albumId));
    for (const p of doomed) {
      for (const rel of [p.storage_path, p.preview_path, p.thumb_path].filter(Boolean)) {
        try { fs.unlinkSync(path.join(ROOT, rel)); } catch { /* already gone */ }
        if (r2on) {
          const parts = String(rel).split('/').filter(Boolean);
          if (parts.length >= 3) {
            try { await objects.deleteObject(objects.PRIVATE, objects.keyFor(v, 'galleries', parts[1], parts[2])); }
            catch (e) { console.error('[events] R2 delete failed for', rel, e.message); }
          }
        }
      }
    }
    void dir;
    res.json({ ok: true, deleted_photos: doomed.length });
  } catch (e) { serverError(res, e); }
});

// 🔒 delete album (tenant-checked, cascades photos)
router.delete('/:id', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const id = Number(req.params.id);
  try {
    /* 📁 a Raw Selector shoot takes its gallery-to-be with it — the editor's upload nobody has sent yet
       (lib/shoots.js). A delivered gallery stays: it is the client's now. */
    const ids = [id, ...(await prisma.albums.findMany({ where: { vendor_id: v, source_album_id: id, kind: 'delivery' }, select: { id: true } })).map(x => x.id)];
    const { count } = await prisma.albums.deleteMany({
      where: { id: { in: ids }, vendor_id: v },   // 🔒 tenancy
    });
    if (!count) return res.status(404).json({ error: 'Not found' });
    for (const x of ids) {
      // ☁️ tear down the album's Rekognition collection so AWS isn't left holding
      // face data (and billing for it) after the album is gone
      try { await deleteCollection(x); } catch (e) { noteFailure('remove an album’s AWS face collection', e); /* best effort */ }
      // remove the album's entire storage folder (all photos + tiers) from disk
      try { fs.rmSync(path.join(ROOT, String(v), String(x)), { recursive: true, force: true }); } catch { /* folder already gone — fine */ }
    }

    /* The album is gone as far as anyone can see, so answer now. Object storage
       has no folders — removing one means listing the prefix and deleting every
       key — and a wedding is hundreds of objects. Holding the response until
       that finished meant a vendor deleting two albums watched the first one
       hang for fourteen seconds, gave up, and the second was never attempted.
       Nothing waits on this: the row is deleted, the files are unreachable, and
       what is left is housekeeping. */
    res.json({ ok: true });
    for (const x of ids) cleanupAlbumObjects(v, x);
  } catch (e) { serverError(res, e); }
});

// 🔒 upload photos → 3-tier pipeline (thumb 800 / full 2200 webp / original)
/* 🔑 deviceOrAuth, not requireAuth: the watcher on Raj's editing machine
   posts here as itself. A person's token still works unchanged, and the
   tenancy check below needs no special case because a device is shaped like a
   user with a vendor_id. */

export default router;
