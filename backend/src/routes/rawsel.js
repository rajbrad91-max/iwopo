/**
 * ðŸŽžï¸ Raw Selector â€” RAW uploads and their status, per album.
 *
 * ðŸ”’ PRIVATE: mounted behind gate('rawsel'), a services.is_private feature that
 * is off for every vendor unless Super Admin switches it on. The vendor always
 * comes from the login token, an album is only ever one of theirs, and an
 * upload key is rebuilt from both before anything is recorded.
 */
import express from 'express';
import path from 'node:path';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import * as objects from '../lib/objectStore.js';
import { wouldExceed } from '../lib/storageQuota.js';
import { recordObject } from '../lib/storageLedger.js';
import { isRaw, stemOf, rawKey, pairAlbum, albumStatus, deleteRaws } from '../lib/rawFiles.js';
import sharp from 'sharp';
import { withLogo, LOGO_DEFAULTS } from '../lib/rawDelivery.js';
import { serverError } from '../lib/httpError.js';
import { quiet } from '../lib/quiet.js';
import jwt from 'jsonwebtoken';
import { tokenStillValid } from '../lib/tokenRevocation.js';
import { downloadFailed, downloadCrashed } from '../lib/downloadPage.js';
import { getFeatures } from '../lib/entitlements.js';
import { photoZip } from '../lib/photoZip.js';
import { shootFor, uploadBegin, uploadComplete, announceUpload } from '../lib/shoots.js';
import { notify } from './notifications.js';
import { sendAsVendor } from './email.js';
import { openPassword } from '../lib/sharePassword.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);
const MAX_FILES = 20;                         // per begin/complete, like gallery photos
const MAX_BYTES = 200 * 1024 * 1024;          // a camera RAW is 25â€“60 MB

async function ownAlbum(req, res) {
  const album = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: vid(req) }, select: { id: true } });
  if (!album) res.status(404).json({ error: 'Album not found' });
  return album;
}

/** How this album's RAWs stand (paired / waiting / missing). */
router.get('/albums/:albumId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    res.json(await albumStatus(a.id, vid(req)));
  } catch (e) { serverError(res, e); }
});

/** Upload addresses for RAW files â€” straight from the browser to the private bucket. */
router.post('/albums/:albumId/begin', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    if (!await objects.enabled(objects.PRIVATE)) return res.status(409).json({ error: 'Storage is not available' });
    const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, MAX_FILES) : [];
    if (!files.length) return res.status(400).json({ error: 'No files' });
    for (const f of files) {
      if (!isRaw(f?.name)) return res.status(400).json({ error: `${String(f?.name || 'A file').slice(0, 80)} is not a camera RAW file` });
      const size = Number(f?.size);
      if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Every file needs its size' });
      if (size > MAX_BYTES) return res.status(413).json({ error: `${String(f.name).slice(0, 80)} is over 200 MB` });
    }
    const over = await wouldExceed(vid(req), files.reduce((n, f) => n + Number(f.size), 0));
    if (over) return res.status(413).json(over);
    const items = [];
    for (const f of files) {
      const safe = path.basename(String(f.name)).replace(/[^\w.-]+/g, '_').slice(-120);
      const key = rawKey(vid(req), a.id, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
      items.push({ name: f.name, key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
    }
    res.json({ items });
  } catch (e) { serverError(res, e); }
});

/** Record RAWs that have landed, and pair them with their JPEGs. */
router.post('/albums/:albumId/complete', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    const v = vid(req);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_FILES) : [];
    let saved = 0; const errors = [];
    for (const it of items) {
      const leaf = path.basename(String(it?.key || ''));
      // ðŸ”’ rebuilt from the token's vendor and this album: anyone else's key is refused
      if (!leaf || it.key !== rawKey(v, a.id, leaf) || !isRaw(leaf)) { errors.push('Not your file'); continue; }
      const head = await objects.headObject(objects.PRIVATE, it.key);
      if (!head) { errors.push(`${String(it.name || leaf).slice(0, 80)} did not arrive`); continue; }
      const size = Number(head.size || 0);
      const over = await wouldExceed(v, size);
      if (over) { await objects.deleteObject(objects.PRIVATE, it.key).catch(quiet('rawsel · objects.deleteObject')); errors.push('over_quota'); continue; }
      await recordObject(objects.PRIVATE, it.key, size).catch(quiet('rawsel · recordObject'));
      const filename = path.basename(String(it.name || leaf)).slice(0, 200);
      const stem = stemOf(filename);
      // the same RAW uploaded again replaces the old copy rather than doubling it
      const old = await prisma.raw_files.findUnique({ where: { album_id_stem: { album_id: a.id, stem } } });
      if (old && old.object_key !== it.key) await deleteRaws({ id: old.id });
      await prisma.raw_files.upsert({
        where: { album_id_stem: { album_id: a.id, stem } },
        create: { vendor_id: v, album_id: a.id, filename, stem, object_key: it.key, size_bytes: BigInt(size) },
        update: { filename, object_key: it.key, size_bytes: BigInt(size) },
      });
      saved++;
    }
    await pairAlbum(a.id, v);
    res.json({ saved, errors });
  } catch (e) { serverError(res, e); }
});

/** Delete one RAW. */
router.delete('/albums/:albumId/raws/:rawId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    const n = await deleteRaws({ id: Number(req.params.rawId), album_id: a.id, vendor_id: vid(req) });
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: n });
  } catch (e) { serverError(res, e); }
});

/** Delete every RAW in the album (the panel asks first). */
router.delete('/albums/:albumId', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    res.json({ deleted: await deleteRaws({ album_id: a.id, vendor_id: vid(req) }) });
  } catch (e) { serverError(res, e); }
});

/* ── 👨‍💻 editors ────────────────────────────────────────────────────────
   The vendor lets an editor in by email; the editor signs up with it on
   /editor (routes/editor.js). Removing one ends their access immediately. */
const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 160);

router.get('/editors', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.raw_editors.findMany({ where: { vendor_id: vid(req) }, orderBy: { created_at: 'asc' } });
    res.json({ editors: rows.map(r => ({ id: r.id, email: r.email, name: r.name || '', joined: !!r.password_hash, joinedAt: r.joined_at, lastLoginAt: r.last_login_at })) });
  } catch (e) { serverError(res, e); }
});

/* ✉️ The invitation (Raj, 2026-11-09 — adding an editor used to send nothing, so "Invited" was only a label). It goes
   from the vendor's own email, as Send Instructions does (sendLeadEmail: their address, or "<Business> via iwopo"
   with replies to them), says who invited them and where to sign up, and the email log keeps it. */
async function sendEditorInvite(req, v, ed) {
  const vendor = await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true } });
  const biz = vendor?.business_name || 'Your photographer';
  const portal = `${process.env.APP_URL || 'https://iwopo.com'}/editor`;
  const body = [
    `Hi${ed.name ? ` ${ed.name}` : ''},`, '',
    `${biz} has invited you to edit their photos on iwopo.`, '',
    `Sign up at ${portal} with this email address (${ed.email}). You will see the RAW files of the photos their clients picked, ready to edit and deliver.`, '',
    'Thank you,', biz,
  ].join('\n');
  const { sendLeadEmail } = await import('./email.js');   // on demand, as albums.js does for Send Instructions
  await sendLeadEmail(req, { vendor_id: v, email: ed.email, name: ed.name }, `${biz} invited you to edit on iwopo`, body, { kind: 'editor_invite' });
}

router.post('/editors', requireAuth, async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look right' });
    const name = String(req.body?.name || '').trim().slice(0, 120) || null;
    const row = await prisma.raw_editors.upsert({
      where: { vendor_id_email: { vendor_id: vid(req), email } },
      create: { vendor_id: vid(req), email, name },
      update: { name, revoked_at: null },
    });
    if (row.joined_at) return res.json({ id: row.id, invited: false });   // already signed up — nothing to invite
    // the editor stays added even when the email cannot go; the reply says why, for the panel to show
    try { await sendEditorInvite(req, vid(req), row); res.json({ id: row.id, invited: true }); }
    catch (e) { res.json({ id: row.id, invited: false, inviteError: e.message }); }
  } catch (e) { serverError(res, e); }
});

// ✉️ send the invitation again — while the editor has not signed up
router.post('/editors/:id/invite', requireAuth, async (req, res) => {
  try {
    const ed = await prisma.raw_editors.findFirst({ where: { id: Number(req.params.id), vendor_id: vid(req), revoked_at: null } });   // 🔒
    if (!ed) return res.status(404).json({ error: 'Not found' });
    if (ed.joined_at) return res.status(409).json({ error: `${ed.email} has already signed up` });
    try { await sendEditorInvite(req, vid(req), ed); }
    catch (e) { return res.status(400).json({ error: `The invite could not be sent: ${e.message}` }); }
    res.json({ invited: true });
  } catch (e) { serverError(res, e); }
});

router.delete('/editors/:id', requireAuth, async (req, res) => {
  try {
    const { count } = await prisma.raw_editors.deleteMany({ where: { id: Number(req.params.id), vendor_id: vid(req) } });   // 🔒
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: count });
  } catch (e) { serverError(res, e); }
});

/** Every album with RAWs or a client selection: where each client stands. */
/* ── 🛤️ the rail (Raj, 2026-11-09) ──────────────────────────────────────
   One row per client: every shoot (lib/shoots.js), and any older album with RAWs or a selection. A row keeps its
   steps — uploaded, told, picked, delivered, RAWs removed — and stays as the client's record until the vendor
   removes it. */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v, OR: [{ kind: 'shoot' }, { raw_files: { some: {} } }, { selections: { some: {} } }] },
      select: {
        id: true, title: true, kind: true, uploaded_at: true, editor_note: true, raws_removed_at: true, raws_removed_scope: true,
        public_token: true, guest_password_enc: true, admin_password_enc: true,
        selection_notes: { select: { updated_at: true } },
        leads: { select: { id: true, event_type: true, event_date: true } },
        deliveries: { where: { kind: 'gallery' }, select: { id: true, created_at: true }, orderBy: { id: 'desc' }, take: 1 },
        _count: { select: { photos: true } },
      },
      orderBy: { id: 'desc' },
    });
    const out = [];
    for (const a of albums) {
      await pairAlbum(a.id, v);
      const [raws, picks] = await Promise.all([
        prisma.raw_files.findMany({ where: { album_id: a.id, vendor_id: v }, select: { photo_id: true, size_bytes: true } }),
        prisma.selections.findMany({ where: { album_id: a.id }, select: { photo_id: true } }),
      ]);
      const picked = new Set(picks.map(p => p.photo_id));
      out.push({
        id: a.id, name: a.title, shoot: a.kind === 'shoot', leadId: a.leads?.id || null,
        event: a.leads?.event_type || '', date: a.leads?.event_date || null,
        jpegs: a._count.photos,
        raws: raws.length,
        bytes: raws.reduce((t, r) => t + Number(r.size_bytes || 0), 0),
        selected: picked.size,
        selectedWithRaw: raws.filter(r => r.photo_id && picked.has(r.photo_id)).length,
        uploadedAt: a.uploaded_at,
        sentAt: a.selection_notes?.updated_at || null,
        delivered: a.deliveries[0] ? { id: a.deliveries[0].id, at: a.deliveries[0].created_at } : null,
        rawsRemoved: a.raws_removed_at ? { at: a.raws_removed_at, scope: a.raws_removed_scope } : null,
        note: a.editor_note || '',
        // 🔗 the client's page and both passwords — the vendor's own, to pick on the client's behalf
        client: a.kind === 'shoot' ? { link: `/g/${a.public_token}`, view: openPassword(a.guest_password_enc) || '', pick: openPassword(a.admin_password_enc) || '' } : null,
      });
    }
    res.json({ clients: out });
  } catch (e) { serverError(res, e); }
});

/** 📝 a note for the editor, shown with the client's RAWs */
router.put('/albums/:albumId/note', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    await prisma.albums.update({ where: { id: a.id }, data: { editor_note: String(req.body?.note || '').trim().slice(0, 2000) || null } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

/** 🗑️ remove RAWs — all of them, or only those the client did not pick — and keep the record on the row */
router.delete('/albums/:albumId/raws', requireAuth, async (req, res) => {
  try {
    const a = await ownAlbum(req, res); if (!a) return;
    const scope = req.query.scope === 'unpicked' ? 'unpicked' : 'all';
    const where = { album_id: a.id, vendor_id: vid(req) };
    if (scope === 'unpicked') {
      const picks = await prisma.selections.findMany({ where: { album_id: a.id }, select: { photo_id: true } });
      where.OR = [{ photo_id: null }, { photo_id: { notIn: picks.map(p => p.photo_id) } }];
    }
    const deleted = await deleteRaws(where);
    await prisma.albums.update({ where: { id: a.id }, data: { raws_removed_at: new Date(), raws_removed_scope: scope } });
    res.json({ deleted, scope });
  } catch (e) { serverError(res, e); }
});

/** ⬇️ the vendor's Zips: ?what= jpeg (the JPEGs) · raw (every RAW) · picked (RAWs of the client's picks) · both.
 *  A download is a page visit, so the login comes as ?token= — checked exactly as the selection Zip does. */
router.get('/albums/:albumId/zip', async (req, res) => {
  const tok = (req.headers.authorization?.split(' ')[1]) || req.query.token;
  let user;
  try { user = jwt.verify(tok, process.env.JWT_SECRET || 'dev-secret-change-me'); } catch { return downloadFailed(req, res, 401, 'Invalid token', 'Your sign-in has expired — open iwopo and try again.'); }
  if (!await tokenStillValid(user)) return downloadFailed(req, res, 401, 'Session ended', 'Your sign-in has expired — open iwopo and try again.');
  try {
    const feats = await getFeatures(user.vendor_id);
    if (!feats.has('*') && !feats.has('rawsel')) return downloadFailed(req, res, 402, 'Not enabled', 'The Raw Selector is not enabled on this account.');
    const a = await prisma.albums.findFirst({ where: { id: Number(req.params.albumId), vendor_id: user.vendor_id }, select: { id: true, title: true } });   // 🔒
    if (!a) return downloadFailed(req, res, 404, 'Not found', "This isn't available any more.");
    const what = ['jpeg', 'raw', 'picked', 'both'].includes(req.query.what) ? req.query.what : 'jpeg';
    const files = [];
    if (what === 'jpeg' || what === 'both') {
      const photos = await prisma.photos.findMany({ where: { album_id: a.id, vendor_id: user.vendor_id }, select: { id: true, filename: true, storage_path: true }, orderBy: { filename: 'asc' } });
      for (const p of photos) {
        const parts = String(p.storage_path || '').split('/').filter(Boolean);
        if (parts.length >= 3) files.push({ key: objects.keyFor(user.vendor_id, 'galleries', parts[1], parts[2]), name: `${what === 'both' ? 'JPEG/' : ''}${p.filename || `photo-${p.id}.jpg`}` });
      }
    }
    if (what !== 'jpeg') {
      const where = { album_id: a.id, vendor_id: user.vendor_id };
      if (what === 'picked') where.photo_id = { in: (await prisma.selections.findMany({ where: { album_id: a.id }, select: { photo_id: true } })).map(s => s.photo_id) };
      const raws = await prisma.raw_files.findMany({ where, select: { filename: true, object_key: true }, orderBy: { filename: 'asc' } });
      for (const r of raws) files.push({ key: r.object_key, name: `${what === 'both' ? 'RAW/' : ''}${r.filename}` });
    }
    if (!files.length) return downloadFailed(req, res, 404, 'Nothing to download', 'There is nothing to download here yet.');
    const label = { jpeg: 'jpegs', raw: 'raws', picked: 'picked-raws', both: 'jpegs-and-raws' }[what];
    res.attachment(`${`${a.title || 'shoot'}-${label}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.zip`);
    const archive = photoZip();   // stored: photographs and RAWs are already compressed (lib/photoZip.js)
    archive.on('error', () => { try { res.status(500).end(); } catch { /* stream already closed */ } });
    archive.pipe(res);
    for (const f of files) {
      try { archive.append((await objects.getStream(objects.PRIVATE, f.key)).stream, { name: f.name }); }
      catch { /* a missing file is left out rather than ending the Zip */ }
    }
    archive.finalize();
  } catch (e) { downloadCrashed(req, res, e); }
});

/* ── 📸 the vendor's own upload: a shoot for a booking nobody else uploads (lib/shoots.js, shared with
   routes/photographer.js) ── */
router.get('/bookings', requireAuth, async (req, res) => {
  try {
    const leads = await prisma.leads.findMany({
      where: { vendor_id: vid(req), status: 'booked' },
      select: { id: true, name: true, event_type: true, event_date: true, albums: { where: { kind: 'shoot' }, select: { id: true } } },
      orderBy: { event_date: 'desc' },
      take: 300,
    });
    res.json({ bookings: leads.map(l => ({ id: l.id, name: l.name || 'Client', event: l.event_type || '', date: l.event_date, hasShoot: l.albums.length > 0 })) });
  } catch (e) { serverError(res, e); }
});
const ownShoot = async (req, res) => {
  const a = await shootFor(vid(req), Number(req.params.leadId));
  if (!a) res.status(404).json({ error: 'Booking not found' });
  return a;
};
const answer = (res, out) => (out.status ? res.status(out.status).json(out) : res.json(out));
router.post('/shoots/:leadId/begin', requireAuth, async (req, res) => {
  try { const a = await ownShoot(req, res); if (!a) return; answer(res, await uploadBegin(vid(req), a, req.body?.files)); } catch (e) { serverError(res, e); }
});
router.post('/shoots/:leadId/complete', requireAuth, async (req, res) => {
  try { const a = await ownShoot(req, res); if (!a) return; res.json(await uploadComplete(vid(req), a, req.body?.items)); } catch (e) { serverError(res, e); }
});
router.post('/shoots/:leadId/notify', requireAuth, async (req, res) => {
  try {
    const a = await ownShoot(req, res); if (!a) return;
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    answer(res, await announceUpload({ v: vid(req), album: a, who: req.user?.name || 'You', client: !!req.body?.client, appUrl, notify, sendAsVendor }));
  } catch (e) { serverError(res, e); }
});

/* ── ®️ the logo printed on delivered photos ────────────────────────── */
const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const settingsOf = async (v) => (await prisma.rawsel_settings.findUnique({ where: { vendor_id: v } })) || { vendor_id: v, logo_key: null, ...LOGO_DEFAULTS };
const readAll = async (key) => { const { stream } = await objects.getStream(objects.PRIVATE, key); const parts = []; for await (const c of stream) parts.push(c); return Buffer.concat(parts); };

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const s = await settingsOf(vid(req));
    let logo = null;
    if (s.logo_key) logo = `data:image/png;base64,${(await sharp(await readAll(s.logo_key)).resize({ width: 240, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
    res.json({ pos: s.logo_pos, size: s.logo_size, opacity: s.logo_opacity, margin: s.logo_margin, logo });
  } catch (e) { serverError(res, e); }
});

router.put('/settings', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const data = {
      logo_pos: POSITIONS.includes(b.pos) ? b.pos : 'br',
      logo_size: clampInt(b.size, 3, 60, 14),
      logo_opacity: clampInt(b.opacity, 5, 100, 85),
      logo_margin: clampInt(b.margin, 0, 20, 3),
      updated_at: new Date(),
    };
    await prisma.rawsel_settings.upsert({ where: { vendor_id: vid(req) }, create: { vendor_id: vid(req), ...data }, update: data });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

/** The logo itself — sent as a data URL (PNG, JPEG or WebP, up to 3 MB), kept as a PNG. */
router.post('/settings/logo', requireAuth, async (req, res) => {
  try {
    const m = String(req.body?.dataUrl || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP image' });
    const raw = Buffer.from(m[2], 'base64');
    if (raw.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'The logo must be under 3 MB' });
    const png = await sharp(raw).resize({ width: 2000, withoutEnlargement: true }).png().toBuffer();
    const key = objects.keyFor(vid(req), 'rawsel', `logo-${Date.now()}.png`);
    await objects.putObject(objects.PRIVATE, key, png, 'image/png', png.length);
    const old = await prisma.rawsel_settings.findUnique({ where: { vendor_id: vid(req) } });
    await prisma.rawsel_settings.upsert({ where: { vendor_id: vid(req) }, create: { vendor_id: vid(req), logo_key: key, ...LOGO_DEFAULTS }, update: { logo_key: key, updated_at: new Date() } });
    if (old?.logo_key && old.logo_key !== key) await objects.deleteObject(objects.PRIVATE, old.logo_key).catch(quiet('rawsel · objects.deleteObject'));
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

/** How a delivered photo will look: the vendor's own latest photo with the logo as set (or as being tried). */
router.post('/settings/preview', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const s = await settingsOf(v);
    if (!s.logo_key) return res.status(400).json({ error: 'Upload a logo first' });
    const b = req.body || {};
    const trial = {
      logo_pos: POSITIONS.includes(b.pos) ? b.pos : s.logo_pos,
      logo_size: clampInt(b.size, 3, 60, s.logo_size),
      logo_opacity: clampInt(b.opacity, 5, 100, s.logo_opacity),
      logo_margin: clampInt(b.margin, 0, 20, s.logo_margin),
    };
    const sample = await prisma.photos.findFirst({ where: { vendor_id: v, ready: true, kind: 'photo' }, select: { preview_path: true }, orderBy: { id: 'desc' } });
    let base;
    try { base = sample ? await readAll(objects.keyFor(v, 'galleries', ...sample.preview_path.split('/').slice(1))) : null; } catch { base = null; }
    if (!base) base = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#b8b2a8' } }).jpeg().toBuffer();
    const out = await sharp(await withLogo(base, await readAll(s.logo_key), trial)).resize({ width: 900 }).jpeg({ quality: 80 }).toBuffer();
    res.json({ image: `data:image/jpeg;base64,${out.toString('base64')}` });
  } catch (e) { serverError(res, e); }
});

export default router;
