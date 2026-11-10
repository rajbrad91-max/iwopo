/**
 * 👨‍💻 Raw Selector — the photo editor's side.
 *
 * Raj, 2026-10-10: his editor signs up with the email Raj added, then sees
 * client by client the RAWs of the photos each client picked — nothing else:
 * never a JPEG, never a gallery, never another part of the account.
 *
 * 🔒 An editor's login is signed with its OWN key (JWT_SECRET + ':raw-editor'),
 *    so requireAuth — every vendor route — rejects it outright, and this file
 *    accepts nothing else. Each request re-reads the editor's row, so removing
 *    an editor, or switching the vendor's Raw Selector off, locks them out at
 *    once. The vendor is always the editor's own row's vendor.
 */
import express from 'express';
import { checkPassword, weakAnswer } from '../lib/passwordPolicy.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import * as objects from '../lib/objectStore.js';
import { getFeatures } from '../lib/entitlements.js';
import { limit } from '../middleware/rateLimit.js';
import { pairAlbum } from '../lib/rawFiles.js';
import path from 'node:path';
import { wouldExceed } from '../lib/storageQuota.js';
import { recordObject } from '../lib/storageLedger.js';
import { enqueuePhotos } from '../lib/photoProcessor.js';
import { stampLogo, writeAltTexts } from '../lib/rawDelivery.js';
import { notify } from './notifications.js';
import { sendAsVendor } from './email.js';
import { resolveTimezone } from '../lib/timezones.js';
import { serverError } from '../lib/httpError.js';
import { quiet } from '../lib/quiet.js';
import { deliveryFor, findDelivery, DELIVERY_KIND, renameShoot, imageLink, markReceived } from '../lib/shoots.js';
import { openPassword } from '../lib/sharePassword.js';
import { tickStages } from '../lib/projectStages.js';

const router = express.Router();
const SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me') + ':raw-editor';
const norm = (e) => String(e || '').trim().toLowerCase().slice(0, 160);
const sign = (row) => jwt.sign({ typ: 'raw_editor', eid: row.id }, SECRET, { expiresIn: '12h' });

/** The editor behind the token — or a refusal. Always answers: an error in an
 *  async Express middleware is not caught for us, and the request would hang. */
async function requireEditor(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    let p;
    try { p = jwt.verify(h.replace(/^Bearer /, ''), SECRET); } catch { return res.status(401).json({ error: 'Please sign in' }); }
    if (p?.typ !== 'raw_editor') return res.status(401).json({ error: 'Please sign in' });
    const ed = await prisma.raw_editors.findUnique({ where: { id: Number(p.eid) } });
    if (!ed || ed.revoked_at || !ed.password_hash) return res.status(401).json({ error: 'Your access has ended' });
    // getFeatures returns a Set
    const feats = new Set(await getFeatures(ed.vendor_id));
    if (!feats.has('*') && !feats.has('rawsel')) return res.status(401).json({ error: 'Your access has ended' });
    req.editor = ed;
    next();
  } catch (e) { serverError(res, e); }
}

const authLimit = limit({ name: 'raw-editor-auth', max: 10, windowMs: 15 * 60_000 });

/** First time: set a password — only for an email a vendor has added. */
router.post('/signup', authLimit, async (req, res) => {
  try {
    const email = norm(req.body?.email);
    const password = String(req.body?.password || '');
    const weak = await checkPassword(password);   // 🔐 the shared password rules
    if (weak.length) return res.status(400).json(weakAnswer(weak));
    const invites = await prisma.raw_editors.findMany({ where: { email, revoked_at: null } });
    // the same answer whether the email is unknown or already joined — nobody can probe who is an editor
    const open = invites.filter(r => !r.password_hash);
    if (!open.length) return res.status(400).json({ error: 'This email cannot sign up here. If you already have a password, sign in instead.' });
    const hash = await bcrypt.hash(password, 10);
    await prisma.raw_editors.updateMany({ where: { id: { in: open.map(r => r.id) } }, data: { password_hash: hash, joined_at: new Date(), last_login_at: new Date() } });
    res.json({ token: sign(open[0]) });
  } catch (e) { serverError(res, e); }
});

router.post('/login', authLimit, async (req, res) => {
  try {
    const email = norm(req.body?.email);
    const rows = await prisma.raw_editors.findMany({ where: { email, revoked_at: null, password_hash: { not: null } } });
    for (const r of rows) {
      if (await bcrypt.compare(String(req.body?.password || ''), r.password_hash)) {
        await prisma.raw_editors.update({ where: { id: r.id }, data: { last_login_at: new Date() } });
        return res.json({ token: sign(r) });
      }
    }
    res.status(401).json({ error: 'Email or password is not right' });
  } catch (e) { serverError(res, e); }
});

router.get('/me', requireEditor, async (req, res) => {
  const [v, settings] = await Promise.all([
    prisma.vendors.findUnique({ where: { id: req.editor.vendor_id }, select: { business_name: true, country: true } }).catch(() => null),
    prisma.vendor_settings.findUnique({ where: { vendor_id: req.editor.vendor_id }, select: { timezone: true, time_format: true } }).catch(() => null),
  ]);
  const zone = resolveTimezone(settings?.timezone, v?.country);
  res.json({
    email: req.editor.email, name: req.editor.name, studio: v?.business_name || '',
    timezone: zone.tz || 'UTC',
    time_format: settings?.time_format === '24h' ? '24h' : '12h',
  });
});

/** The selected photos of one album that have a RAW: what the editor may download. */
async function selectedRaws(albumId, vendorId) {
  await pairAlbum(albumId, vendorId);
  const picks = await prisma.selections.findMany({ where: { album_id: albumId, albums: { vendor_id: vendorId } }, select: { photo_id: true } });
  const ids = picks.map(p => p.photo_id);
  const raws = ids.length ? await prisma.raw_files.findMany({
    where: { vendor_id: vendorId, album_id: albumId, photo_id: { in: ids } },
    select: { id: true, filename: true, size_bytes: true, photo_id: true },
    orderBy: { filename: 'asc' },
  }) : [];
  return { selected: ids.length, raws };
}

/** Clients who have sent their selection — newest first. */
router.get('/clients', requireEditor, async (req, res) => {
  try {
    const v = req.editor.vendor_id;
    const notes = await prisma.selection_notes.findMany({
      where: { albums: { vendor_id: v }, updated_at: { not: null } },
      select: { album_id: true, updated_at: true, note: true, albums: { select: { title: true } } },
      orderBy: { updated_at: 'desc' },
    });
    const out = [];
    for (const n of notes) {
      const { selected, raws } = await selectedRaws(n.album_id, v);
      // an album with no RAWs behind its picks is not editing work — a plain JPEG gallery never reaches the editor
      if (!selected || !raws.length) continue;
      out.push({
        id: n.album_id, name: n.albums.title, sentAt: n.updated_at, note: n.note || '',
        selected, ready: raws.length, missing: selected - raws.length,
        bytes: raws.reduce((t, r) => t + Number(r.size_bytes || 0), 0),
        isNew: !req.editor.last_login_at || n.updated_at > req.editor.last_login_at,
      });
    }
    res.json({ clients: out });
  } catch (e) { serverError(res, e); }
});

/** One client's RAW files — only those of photos the client picked. */
router.get('/clients/:albumId', requireEditor, async (req, res) => {
  try {
    const v = req.editor.vendor_id;
    const album = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: v }, select: { id: true, title: true, editor_note: true } });
    if (!album) return res.status(404).json({ error: 'Not found' });
    const { selected, raws } = await selectedRaws(album.id, v);
    /* 🖼️ what each RAW looks like: the photo's 2200px preview, a 15-minute link — to look at only; a download is the RAW */
    const photos = await prisma.photos.findMany({ where: { id: { in: raws.map(r => r.photo_id).filter(Boolean) }, album_id: album.id }, select: { id: true, preview_path: true } });
    const preview = new Map(await Promise.all(photos.map(async p => [p.id, await imageLink(v, p.preview_path, `${p.id}.webp`)])));
    res.json({
      id: album.id, name: album.title, selected, studioNote: album.editor_note || '',
      files: raws.map(r => ({ id: r.id, name: r.filename, size: Number(r.size_bytes || 0), preview: preview.get(r.photo_id) || null })),
    });
  } catch (e) { serverError(res, e); }
});

/** A 15-minute link that downloads one RAW straight from storage. */
router.get('/raws/:id/link', requireEditor, limit({ name: 'raw-editor-link', max: 600, windowMs: 60_000, key: (req) => String(req.editor?.id || '') }), async (req, res) => {
  try {
    const v = req.editor.vendor_id;
    const r = await prisma.raw_files.findFirst({ where: { id: Number(req.params.id), vendor_id: v, photo_id: { not: null } } });
    // 🔒 only a RAW whose photo the client actually picked
    const picked = r && await prisma.selections.findFirst({ where: { album_id: r.album_id, photo_id: r.photo_id } });
    if (!r || !picked) return res.status(404).json({ error: 'Not found' });
    await markReceived(v, r.album_id, req.editor.name || req.editor.email);   // 📥 the rail's "Editor received"
    res.json({ url: await objects.signGet(objects.PRIVATE, r.object_key, r.filename), name: r.filename });
  } catch (e) { serverError(res, e); }
});

/* ── ⬆️ delivering EDITED photos ────────────────────────────────────────
   The editor uploads finished JPEGs into named folders ("Photos",
   "Stories", "Posters"); each folder becomes a TAB in the client's gallery
   (album_events.delivery = true: shown like any tab, never face-scanned).
   Every photo gets the vendor's logo printed on it first. */
const IMG = /\.(jpe?g|png)$/i;
const MAX_FILES = 20;
const MAX_BYTES = 100 * 1024 * 1024;
const galleryKey = (v, albumId, name) => objects.keyFor(v, 'galleries', String(albumId), name);
const tabName = (t) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, 60);

async function editorAlbum(req, res) {
  const a = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: req.editor.vendor_id }, select: { id: true, title: true, kind: true, lead_id: true, client_email: true, public_token: true } });
  if (!a) res.status(404).json({ error: 'Not found' });
  return a;
}

/** The delivery tabs already in this client's gallery. */
router.get('/clients/:albumId/tabs', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const d = await findDelivery(req.editor.vendor_id, a);   // 📁 looked for only: made when he uploads (lib/shoots.js)
    if (!d) return res.json({ tabs: [] });
    const tabs = await prisma.album_events.findMany({ where: { album_id: d.id, delivery: true }, select: { id: true, name: true, _count: { select: { photos: true } } }, orderBy: { sort_order: 'asc' } });
    res.json({ tabs: tabs.map(t => ({ id: t.id, name: t.name, photos: t._count.photos })) });
  } catch (e) { serverError(res, e); }
});

/** Upload addresses for edited photos — straight from the editor's browser to storage. */
router.post('/clients/:albumId/deliver/begin', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
    const d = await deliveryFor(v, a);   // 📁 a shoot's gallery-to-be (lib/shoots.js)
    const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, MAX_FILES) : [];
    if (!files.length) return res.status(400).json({ error: 'No files' });
    for (const f of files) {
      if (!IMG.test(String(f?.name || ''))) return res.status(400).json({ error: `${String(f?.name || 'A file').slice(0, 80)} is not a JPEG or PNG` });
      const size = Number(f?.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return res.status(400).json({ error: `${String(f.name).slice(0, 80)} is too big` });
    }
    const over = await wouldExceed(v, files.reduce((n, f) => n + Number(f.size), 0));
    if (over) return res.status(413).json(over);
    const items = [];
    for (const f of files) {
      const ext = path.extname(String(f.name)).toLowerCase() || '.jpg';
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_orig${ext}`;
      const key = galleryKey(v, d.id, name);
      items.push({ name: f.name, key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
    }
    res.json({ items });
  } catch (e) { serverError(res, e); }
});

/** Record edited photos that have landed: logo on, into the tab, previews made next. */
router.post('/clients/:albumId/deliver/complete', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
    const d = await deliveryFor(v, a);   // 📁 a shoot's gallery-to-be (lib/shoots.js)
    const name = tabName(req.body?.tab);
    if (!name) return res.status(400).json({ error: 'Give the folder a name, e.g. Photos' });
    let tab = await prisma.album_events.findFirst({ where: { album_id: d.id, name, delivery: true } });
    if (!tab) {
      const last = await prisma.album_events.aggregate({ where: { album_id: d.id }, _max: { sort_order: true } });
      tab = await prisma.album_events.create({ data: { album_id: d.id, vendor_id: v, name, delivery: true, sort_order: (last._max.sort_order ?? 0) + 1 } });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_FILES) : [];
    const created = [], errors = [];
    for (const it of items) {
      const leaf = path.basename(String(it?.key || ''));
      // 🔒 rebuilt from the editor's vendor and this album: any other key is refused
      if (!/_orig\.(jpe?g|png)$/i.test(leaf) || it.key !== galleryKey(v, d.id, leaf)) { errors.push('Not your file'); continue; }
      const rel = `${v}/${d.id}/${leaf}`;
      const dup = await prisma.photos.findFirst({ where: { album_id: d.id, storage_path: rel }, select: { id: true } });
      if (dup) { created.push(dup.id); continue; }
      if (!await objects.headObject(objects.PRIVATE, it.key)) { errors.push(`${String(it.name || leaf).slice(0, 80)} did not arrive`); continue; }
      // ®️ the vendor's logo, printed before any preview is made from it
      const stamped = await stampLogo(v, it.key).catch(e => { console.error('[rawsel] logo', e.message); return false; });
      const size = Number(stamped || (await objects.headObject(objects.PRIVATE, it.key))?.size || 0);
      if (!stamped) await recordObject(objects.PRIVATE, it.key, size).catch(quiet('editor · recordObject'));
      const base = leaf.replace(/_orig\.[^.]+$/, '');
      const row = await prisma.photos.create({
        data: {
          album_id: d.id, vendor_id: v,
          filename: path.basename(String(it.name || leaf)).slice(0, 200),
          storage_path: rel,
          preview_path: `${v}/${d.id}/${base}_full.webp`,
          thumb_path: `${v}/${d.id}/${base}_thumb.webp`,
          size_bytes: BigInt(size),
          event_id: tab.id,
          ready: false,
        },
        select: { id: true },
      });
      created.push(row.id);
    }
    enqueuePhotos(created);
    res.status(created.length ? 201 : 400).json({ created: created.length, errors, tab: { id: tab.id, name: tab.name } });
  } catch (e) { serverError(res, e); }
});

/**
 * 📣 The editor sends (Raj, 2026-11-09): the shoot's gallery-to-be becomes a gallery like any other — in Galleries,
 * named after the shoot, opened with the booking's passwords — and the vendor is told (bell + email), and the client
 * too when the editor chooses "Notify owner + client". The RAWs are marked delivered (a record; they are deleted only
 * when the vendor says so). An older gallery that is not a shoot is told about the same way.
 */
/** 🏷️ rename the client's shoot (the name travels to its gallery) */
router.put('/clients/:albumId/name', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const title = await renameShoot(req.editor.vendor_id, a, req.body?.name);
    if (!title) return res.status(400).json({ error: 'A name is needed' });
    res.json({ name: title });
  } catch (e) { serverError(res, e); }
});

router.post('/clients/:albumId/deliver/finish', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
    const d = await findDelivery(v, a);
    if (!d) return res.status(400).json({ error: 'Upload the edited photos first' });
    const tabs = await prisma.album_events.findMany({ where: { album_id: d.id, delivery: true }, select: { id: true } });
    const count = tabs.length ? await prisma.photos.count({ where: { album_id: d.id, event_id: { in: tabs.map(t => t.id) } } }) : 0;
    if (!count) return res.status(400).json({ error: 'Upload the edited photos first' });
    const gallery = d.kind === DELIVERY_KIND ? await prisma.albums.update({ where: { id: d.id }, data: { kind: 'gallery' } }) : d;
    await prisma.raw_files.updateMany({ where: { album_id: a.id, vendor_id: v, delivered_at: null }, data: { delivered_at: new Date() } });
    const who = req.editor.name || req.editor.email;
    const client = !!req.body?.client;
    await notify(v, `🎞️ ${a.title}: ${count} edited photo${count === 1 ? '' : 's'} delivered`, `${who} sent them${client ? ' and told the client' : ''}. The gallery is in Galleries.`, 'info', '/panel/galleries');
    const ven = await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true, email: true } });
    const studio = ven?.business_name || 'Your photographer';
    const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const ownerEmailed = ven?.email
      ? (await sendAsVendor(v, { to: ven.email, subject: `🎞️ ${a.title}: edited photos delivered`, text: `${who} sent ${count} edited photo${count === 1 ? '' : 's'} for ${a.title}${client ? ', and the client has been told' : ''}.\n\nGalleries: ${base}/panel/galleries` })).ok
      : false;
    let clientEmailed = false;
    if (client && gallery.client_email && gallery.public_token) {
      clientEmailed = (await sendAsVendor(v, {
        to: gallery.client_email,
        subject: `Your edited photos are ready — ${gallery.title}`,
        text: `Hi ${gallery.title},\n\nYour edited photos are ready:\n${base}/g/${gallery.public_token}\n\nPassword: ${openPassword(gallery.guest_password_enc) || '(ask us)'}\n\n${studio}`,
      })).ok;
    }
    // 📊 the PPM board: "Edited" — and "Delivered" when the client was told
    await tickStages(v, a.lead_id ?? gallery.lead_id, client ? ['editing_photos_done_at', 'delivered_at'] : ['editing_photos_done_at']);
    writeAltTexts().catch(quiet('editor · writeAltTexts'));
    res.json({ ok: true, count, gallery: gallery.id, ownerEmailed, clientEmailed });
  } catch (e) { serverError(res, e); }
});

export default router;
