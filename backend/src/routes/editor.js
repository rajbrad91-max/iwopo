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
  } catch (e) { res.status(500).json({ error: e.message }); }
}

const authLimit = limit({ name: 'raw-editor-auth', max: 10, windowMs: 15 * 60_000 });

/** First time: set a password — only for an email a vendor has added. */
router.post('/signup', authLimit, async (req, res) => {
  try {
    const email = norm(req.body?.email);
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Use at least 8 characters for the password' });
    const invites = await prisma.raw_editors.findMany({ where: { email, revoked_at: null } });
    // the same answer whether the email is unknown or already joined — nobody can probe who is an editor
    const open = invites.filter(r => !r.password_hash);
    if (!open.length) return res.status(400).json({ error: 'This email cannot sign up here. If you already have a password, sign in instead.' });
    const hash = await bcrypt.hash(password, 10);
    await prisma.raw_editors.updateMany({ where: { id: { in: open.map(r => r.id) } }, data: { password_hash: hash, joined_at: new Date(), last_login_at: new Date() } });
    res.json({ token: sign(open[0]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    select: { id: true, filename: true, size_bytes: true },
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** One client's RAW files — only those of photos the client picked. */
router.get('/clients/:albumId', requireEditor, async (req, res) => {
  try {
    const v = req.editor.vendor_id;
    const album = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: v }, select: { id: true, title: true } });
    if (!album) return res.status(404).json({ error: 'Not found' });
    const { selected, raws } = await selectedRaws(album.id, v);
    res.json({ id: album.id, name: album.title, selected, files: raws.map(r => ({ id: r.id, name: r.filename, size: Number(r.size_bytes || 0) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** A 15-minute link that downloads one RAW straight from storage. */
router.get('/raws/:id/link', requireEditor, limit({ name: 'raw-editor-link', max: 600, windowMs: 60_000, key: (req) => String(req.editor?.id || '') }), async (req, res) => {
  try {
    const v = req.editor.vendor_id;
    const r = await prisma.raw_files.findFirst({ where: { id: Number(req.params.id), vendor_id: v, photo_id: { not: null } } });
    // 🔒 only a RAW whose photo the client actually picked
    const picked = r && await prisma.selections.findFirst({ where: { album_id: r.album_id, photo_id: r.photo_id } });
    if (!r || !picked) return res.status(404).json({ error: 'Not found' });
    res.json({ url: await objects.signGet(objects.PRIVATE, r.object_key, r.filename), name: r.filename });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ⬆️ delivering EDITED photos ────────────────────────────────────────
   The editor uploads finished JPEGs into named folders ("Photos",
   "Instagram", "Stories"); each folder becomes a TAB in the client's gallery
   (album_events.delivery = true: shown like any tab, never face-scanned).
   Every photo gets the vendor's logo printed on it first. */
const IMG = /\.(jpe?g|png)$/i;
const MAX_FILES = 20;
const MAX_BYTES = 100 * 1024 * 1024;
const galleryKey = (v, albumId, name) => objects.keyFor(v, 'galleries', String(albumId), name);
const tabName = (t) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, 60);

async function editorAlbum(req, res) {
  const a = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: req.editor.vendor_id }, select: { id: true, title: true, client_email: true, public_token: true } });
  if (!a) res.status(404).json({ error: 'Not found' });
  return a;
}

/** The delivery tabs already in this client's gallery. */
router.get('/clients/:albumId/tabs', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const tabs = await prisma.album_events.findMany({ where: { album_id: a.id, delivery: true }, select: { id: true, name: true, _count: { select: { photos: true } } }, orderBy: { sort_order: 'asc' } });
    res.json({ tabs: tabs.map(t => ({ id: t.id, name: t.name, photos: t._count.photos })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Upload addresses for edited photos — straight from the editor's browser to storage. */
router.post('/clients/:albumId/deliver/begin', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
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
      const key = galleryKey(v, a.id, name);
      items.push({ name: f.name, key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
    }
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Record edited photos that have landed: logo on, into the tab, previews made next. */
router.post('/clients/:albumId/deliver/complete', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
    const name = tabName(req.body?.tab);
    if (!name) return res.status(400).json({ error: 'Give the folder a name, e.g. Photos' });
    let tab = await prisma.album_events.findFirst({ where: { album_id: a.id, name, delivery: true } });
    if (!tab) {
      const last = await prisma.album_events.aggregate({ where: { album_id: a.id }, _max: { sort_order: true } });
      tab = await prisma.album_events.create({ data: { album_id: a.id, vendor_id: v, name, delivery: true, sort_order: (last._max.sort_order ?? 0) + 1 } });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_FILES) : [];
    const created = [], errors = [];
    for (const it of items) {
      const leaf = path.basename(String(it?.key || ''));
      // 🔒 rebuilt from the editor's vendor and this album: any other key is refused
      if (!/_orig\.(jpe?g|png)$/i.test(leaf) || it.key !== galleryKey(v, a.id, leaf)) { errors.push('Not your file'); continue; }
      const rel = `${v}/${a.id}/${leaf}`;
      const dup = await prisma.photos.findFirst({ where: { album_id: a.id, storage_path: rel }, select: { id: true } });
      if (dup) { created.push(dup.id); continue; }
      if (!await objects.headObject(objects.PRIVATE, it.key)) { errors.push(`${String(it.name || leaf).slice(0, 80)} did not arrive`); continue; }
      // ®️ the vendor's logo, printed before any preview is made from it
      const stamped = await stampLogo(v, it.key).catch(e => { console.error('[rawsel] logo', e.message); return false; });
      const size = Number(stamped || (await objects.headObject(objects.PRIVATE, it.key))?.size || 0);
      if (!stamped) await recordObject(objects.PRIVATE, it.key, size).catch(() => {});
      const base = leaf.replace(/_orig\.[^.]+$/, '');
      const row = await prisma.photos.create({
        data: {
          album_id: a.id, vendor_id: v,
          filename: path.basename(String(it.name || leaf)).slice(0, 200),
          storage_path: rel,
          preview_path: `${v}/${a.id}/${base}_full.webp`,
          thumb_path: `${v}/${a.id}/${base}_thumb.webp`,
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * A batch is done: tell the vendor and the client, start the 30-day clock on
 * the RAWs (first delivery only), and have Claude describe the new photos.
 */
router.post('/clients/:albumId/deliver/finish', requireEditor, async (req, res) => {
  try {
    const a = await editorAlbum(req, res); if (!a) return;
    const v = req.editor.vendor_id;
    const name = tabName(req.body?.tab);
    const count = Math.max(0, Math.min(5000, Number(req.body?.count) || 0));
    if (!count) return res.json({ ok: true });
    // ⏳ RAWs go 30 days after the edited photos first reach the client
    const now = new Date();
    await prisma.raw_files.updateMany({ where: { album_id: a.id, vendor_id: v, delivered_at: null }, data: { delivered_at: now, delete_after: new Date(now.getTime() + 30 * 86400e3) } });
    await notify(v, `🎞️ ${count} edited photo${count === 1 ? '' : 's'} delivered — ${a.title}`, `${req.editor.name || req.editor.email} added them to "${name}". RAW files will be deleted in 30 days.`, 'rawsel', { type: 'album', id: a.id });
    let emailed = false;
    if (a.client_email && a.public_token) {
      const studio = (await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true } }))?.business_name || 'Your photographer';
      const link = `${(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/g/${a.public_token}`;
      emailed = await sendAsVendor(v, {
        to: a.client_email,
        subject: `Your edited photos are ready — ${name}`,
        text: `Hi,\n\n${count} edited photo${count === 1 ? ' is' : 's are'} now in your gallery, in the "${name}" tab:\n${link}\n\n${studio}`,
      }).then(() => true).catch(() => false);
    }
    writeAltTexts().catch(() => {});
    res.json({ ok: true, emailed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
