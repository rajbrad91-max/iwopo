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
  const v = await prisma.vendors.findUnique({ where: { id: req.editor.vendor_id }, select: { business_name: true } }).catch(() => null);
  res.json({ email: req.editor.email, name: req.editor.name, studio: v?.business_name || '' });
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

export default router;
