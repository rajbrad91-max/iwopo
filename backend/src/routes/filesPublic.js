import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { storageFor, shareDir } from './files.js';

const router = express.Router();
const upload = multer({ dest: '/tmp/iwopo_files', limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

/**
 * 🌐 The client's side of File Flyer — no login, the token IS the key.
 *
 * Deliberately a separate router from the vendor's own: everything here is
 * reachable by anyone holding a link, so each handler has to re-establish what
 * that link actually grants rather than inheriting a logged-in vendor's rights.
 * Mixing the two in one file is how a public route quietly ends up behind an
 * auth check that was written for a different endpoint.
 */

/** Resolve a share by token, or null. Also decides whether it's still usable. */
async function shareByToken(token) {
  const share = await prisma.file_shares.findFirst({ where: { token: String(token || '') } });
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return { share, expired: true };
  return { share, expired: false };
}

function cookieOf(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

/** The public shape of a share — never the password, never the vendor id. */
function publicShare(share, vendor) {
  return {
    title: share.title,
    note: share.note,
    allow_upload: share.allow_upload,
    business_name: vendor?.business_name || null,
    logo_path: vendor?.logo_path || null,
  };
}

// GET /api/f/:token → the share, if the link is good and any gate is passed
router.get('/:token', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired', message: 'This link has expired.' });

    const vendor = await prisma.vendors.findUnique({
      where: { id: share.vendor_id }, select: { business_name: true, logo_path: true },
    });

    // password gate: nothing about the contents leaves until it's passed
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
      return res.json({ gated: true, title: share.title, business_name: vendor?.business_name || null,
        logo_path: vendor?.logo_path || null });
    }

    const items = await prisma.file_share_items.findMany({
      where: { share_id: share.id },
      orderBy: { id: 'desc' },
      select: { id: true, filename: true, size_bytes: true, mime: true, uploaded_by: true,
        uploader_name: true, created_at: true },
    });
    res.json({
      ...publicShare(share, vendor),
      items: items.map(i => ({ ...i, size_bytes: Number(i.size_bytes) })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/f/:token/unlock → check the share password
router.post('/:token/unlock', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired' });
    if (!share.password) return res.json({ ok: true });     // nothing to unlock
    if (String(req.body?.password || '') !== share.password) {
      return res.status(403).json({ error: "That password doesn't match" });
    }
    res.cookie('ff_' + share.id, '1', { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/f/:token/download/:itemId → one file
router.get('/:token/download/:itemId', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired' });
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
      return res.status(403).json({ error: 'Locked' });
    }
    // the item must belong to THIS share — an id from another share is not
    // reachable just because this token happens to be valid
    const item = await prisma.file_share_items.findFirst({
      where: { id: Number(req.params.itemId), share_id: share.id },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    const full = path.join(shareDir(share.vendor_id, share.id), item.stored_name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
    res.download(full, item.filename);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/f/:token/upload → the client sends files back.
 *
 * Charged against the VENDOR's allowance, not the client's — the vendor owns
 * the storage and chose to open this share for uploads, so a client filling it
 * is the vendor's problem to manage, and they can turn uploads off.
 */
router.post('/:token/upload', upload.array('files', 30), async (req, res) => {
  const tmp = (req.files || []).map(f => f.path);
  const cleanup = () => tmp.forEach(p => { try { fs.unlinkSync(p); } catch { /* already gone */ } });
  try {
    const found = await shareByToken(req.params.token);
    if (!found) { cleanup(); return res.status(404).json({ error: 'This link is not valid' }); }
    const { share, expired } = found;
    if (expired) { cleanup(); return res.status(410).json({ error: 'expired' }); }
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
      cleanup(); return res.status(403).json({ error: 'Locked' });
    }
    if (!share.allow_upload) {
      cleanup(); return res.status(403).json({ error: 'This link is download-only' });
    }
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });

    const incoming = req.files.reduce((n, f) => n + f.size, 0);
    const st = await storageFor(share.vendor_id);
    if (incoming > st.remaining_bytes) {
      cleanup();
      return res.status(413).json({ error: 'storage_full',
        message: 'There is not enough space left on this link. Please let them know.' });
    }

    const dir = shareDir(share.vendor_id, share.id);
    fs.mkdirSync(dir, { recursive: true });
    const who = String(req.body?.uploader_name || '').trim().slice(0, 120) || null;
    let n = 0;
    for (const f of req.files) {
      const ext = path.extname(f.originalname || '').slice(0, 12);
      const stored = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      fs.renameSync(f.path, path.join(dir, stored));
      await prisma.file_share_items.create({
        data: {
          share_id: share.id,
          vendor_id: share.vendor_id,                     // 🔒 stamped from the share
          filename: String(f.originalname || 'file').slice(0, 300),
          stored_name: stored,
          size_bytes: f.size,
          mime: f.mimetype ? String(f.mimetype).slice(0, 150) : null,
          uploaded_by: 'client',
          uploader_name: who,
        },
      });
      n++;
    }
    res.status(201).json({ ok: true, added: n });
  } catch (e) { cleanup(); res.status(500).json({ error: e.message }); }
});

export default router;
