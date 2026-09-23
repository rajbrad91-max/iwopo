import express from 'express';
import { limit } from '../middleware/rateLimit.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../config/prisma.js';
import archiver from 'archiver';
import { thumbPathFor } from './files.js';
import { storageFor, vendorDir, fileStream } from './files.js';
import { checkSharePassword } from '../lib/sharePassword.js';
import * as objects from '../lib/objectStore.js';
import { recordEvent } from '../lib/siteEvents.js';

/**
 * Is `folderId` the shared folder, or somewhere beneath it?
 *
 * Walks upward and stops at the share's root. A client holding a link to one
 * folder must not be able to name a sibling's id and read it, and the id is
 * supplied by whoever holds the link so it cannot be trusted.
 *
 * A null root means the whole drive is shared, in which case any folder of that
 * vendor is fair game.
 */
async function withinShare(folderId, rootFolderId, vendorId) {
  if (!folderId) return true;                       // the root of what was shared
  let cur = await prisma.file_folders.findUnique({ where: { id: Number(folderId) } });
  if (!cur || cur.vendor_id !== vendorId) return false;
  if (!rootFolderId) return true;                   // whole drive shared
  let guard = 0;
  while (cur && guard++ < 50) {
    if (cur.id === rootFolderId) return true;
    if (!cur.parent_id) return false;               // reached the top without meeting it
    cur = await prisma.file_folders.findUnique({ where: { id: cur.parent_id } });
  }
  return false;
}

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
      where: { vendor_id: share.vendor_id, folder_id: share.folder_id },
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

/**
 * GET /api/f/:token/browse?folder=<id> → one level of the share, for the client.
 *
 * Mirrors the vendor's browse but scopes every lookup to the share the token
 * resolves to. A folder id is supplied by whoever holds the link, so it is
 * checked against this share rather than trusted — otherwise a valid token
 * plus a guessed id would read another vendor's folder.
 */
router.get('/:token/browse', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired', message: 'This link has expired.' });
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
      return res.status(403).json({ error: 'Locked' });
    }

    const raw = req.query.folder;
    const folderId = raw ? Number(raw) : null;
    if (raw && !Number.isInteger(folderId)) return res.status(404).json({ error: 'Folder not found' });

    // 🔒 inside what was shared, not merely owned by the same vendor —
    // otherwise one link reads every folder that vendor has
    if (folderId && !(await withinShare(folderId, share.folder_id, share.vendor_id))) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // the breadcrumb stops at the shared folder; walking to the drive root
    // would name the folders above it, which the client was never given
    let trail = [];
    if (folderId) {
      let cur = await prisma.file_folders.findUnique({ where: { id: folderId } });
      let guard = 0;
      while (cur && guard++ < 50) {
        trail.unshift({ id: cur.id, name: cur.name });
        if (!cur.parent_id || cur.id === share.folder_id) break;
        cur = await prisma.file_folders.findUnique({ where: { id: cur.parent_id } });
      }
    }

    const [folders, items] = await Promise.all([
      prisma.file_folders.findMany({
        // null folderId means the root OF THE SHARE, which is the shared folder
        where: { vendor_id: share.vendor_id, parent_id: folderId ?? share.folder_id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, created_at: true },
      }),
      prisma.file_share_items.findMany({
        where: { vendor_id: share.vendor_id, folder_id: folderId ?? share.folder_id },
        orderBy: { filename: 'asc' },
        select: { id: true, filename: true, size_bytes: true, mime: true,
          uploaded_by: true, uploader_name: true, created_at: true },
      }),
    ]);

    const counts = folders.length ? await prisma.file_share_items.groupBy({
      by: ['folder_id'],
      where: { folder_id: { in: folders.map(f => f.id) } },
      _count: { _all: true },
    }) : [];
    const byFolder = Object.fromEntries(counts.map(c => [c.folder_id, c._count._all]));

    res.json({
      trail,
      folders: folders.map(f => ({ ...f, file_count: byFolder[f.id] || 0 })),
      items: items.map(i => ({ ...i, size_bytes: Number(i.size_bytes) })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Everything under a folder, rebuilt inside the archive. */
async function zipInto(archive, vendorId, folderId, prefix) {
  const [folders, items] = await Promise.all([
    prisma.file_folders.findMany({ where: { vendor_id: vendorId, parent_id: folderId } }),
    prisma.file_share_items.findMany({ where: { vendor_id: vendorId, folder_id: folderId } }),
  ]);
  for (const it of items) {
    const full = path.join(vendorDir(vendorId), it.stored_name);
    // a generated .thumb.webp / .lg.webp sits beside the original; only the
    // original is the vendor's file and only that belongs in the archive
    //
    // R2 first, disk second, and a STREAM either way — archiver pulls each
    // entry as it writes, so a multi-gigabyte share never needs that much
    // scratch space and the first byte reaches the client straight away.
    const o = await fileStream(vendorId, it.stored_name);
    if (o) { archive.append(o.stream, { name: prefix + it.filename }); }
    else if (fs.existsSync(full)) archive.file(full, { name: prefix + it.filename });
  }
  for (const f of folders) {
    archive.append(null, { name: prefix + f.name + '/' });
    await zipInto(archive, vendorId, f.id, prefix + f.name + '/');
  }
}

function safeZipName(name) {
  return String(name || 'files').replace(/[^\w\d\-. ]+/g, '_').trim().slice(0, 80) || 'files';
}

// GET /api/f/:token/zip[?folder=<id>] → the share, or one folder in it
router.get('/:token/zip', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired' });
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
      return res.status(403).json({ error: 'Locked' });
    }

    /* 🔒 Default to the share's OWN folder, not null.
       null means "everything this vendor has" in zipInto, so a share of one
       wedding folder was handing the client every other client's folder too —
       proven by a zip of three files arriving with seventeen entries in it,
       including another couple's. The browse route was already scoped; this one
       was not. */
    let rootId = share.folder_id ?? null, label = share.title;
    if (req.query.folder) {
      const f = await prisma.file_folders.findUnique({ where: { id: Number(req.query.folder) } });
      if (!f || !(await withinShare(f.id, share.folder_id, share.vendor_id))) return res.status(404).json({ error: 'Folder not found' });
      rootId = f.id; label = f.name;
    }

    recordEvent(req, share.vendor_id, 'zip_download', { targetId: share.id, label });

    res.attachment(safeZipName(label) + '.zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    await zipInto(archive, share.vendor_id, rootId, '');
    archive.finalize();
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// GET /api/f/:token/thumb/:itemId → preview for a client browsing in grid view
router.get('/:token/thumb/:itemId', async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).end();
    const { share, expired } = found;
    if (expired) return res.status(410).end();
    if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') return res.status(403).end();

    const it = await prisma.file_share_items.findUnique({ where: { id: Number(req.params.itemId) } });
    // 🔒 the item must belong to THIS share — an id alone proves nothing
    if (!it || it.vendor_id !== share.vendor_id
      || !(await withinShare(it.folder_id, share.folder_id, share.vendor_id))) return res.status(404).end();

    const t = await thumbPathFor(share.vendor_id, it, req.query.size === 'lg' ? 'lg' : 'thumb');
    if (!t) return res.status(404).end();
    res.type('webp');
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(t, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  } catch { res.status(500).end(); }
});

// POST /api/f/:token/unlock → check the share password
router.post('/:token/unlock', limit({ name: 'share-unlock', max: 12, windowMs: 15 * 60_000, key: r => r.params.token }), async (req, res) => {
  try {
    const found = await shareByToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'This link is not valid' });
    const { share, expired } = found;
    if (expired) return res.status(410).json({ error: 'expired' });
    if (!share.password) return res.json({ ok: true });     // nothing to unlock
    if (!await checkSharePassword(req.body?.password, share.password)) {
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
    const itemId = Number(req.params.itemId);
    // anything that is not a plain integer is refused before it reaches Prisma,
    // which throws on NaN rather than returning nothing
    if (!Number.isInteger(itemId)) return res.status(404).json({ error: 'Not found' });
    const item = await prisma.file_share_items.findFirst({
      where: { id: itemId, vendor_id: share.vendor_id },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    // 🔒 and it must sit inside what this link actually shared
    if (!(await withinShare(item.folder_id, share.folder_id, share.vendor_id))) {
      return res.status(404).json({ error: 'Not found' });
    }

    recordEvent(req, share.vendor_id, 'file_download', { targetId: item.id, label: item.filename });
    // the client's own download — the one most likely to be resumed
    const o = await fileStream(share.vendor_id, item.stored_name, req.headers.range);
    if (o) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
      if (o.contentType) res.setHeader('Content-Type', o.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      if (o.contentRange) { res.status(206); res.setHeader('Content-Range', o.contentRange); }
      if (o.size) res.setHeader('Content-Length', o.size);
      return o.stream.pipe(res);                  // streamed, never buffered
    }
    const full = path.join(vendorDir(share.vendor_id), item.stored_name);
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
/* ═══════════════════════════════════════════════════════════════════════════
   📦 A client sending back something enormous.

   Same shape as the vendor's own large upload, with one difference that matters:
   there is no login here. Every permission is read from the share token — the
   vendor id is STAMPED from the share and never accepted from the request, the
   link must still allow uploads, and a password-protected link must already
   have been unlocked. A caller who guesses a key cannot use it, because the key
   is rebuilt from the share's own vendor id and compared.
   ═══════════════════════════════════════════════════════════════════════════ */

const BIG_PART_SIZE = 64 * 1024 * 1024;
const BIG_MIN_PART_SIZE = 5 * 1024 * 1024;

/** Everything these routes need, or a reason to refuse. */
async function shareForUpload(req, res) {
  const found = await shareByToken(req.params.token);
  if (!found) { res.status(404).json({ error: 'This link is not valid' }); return null; }
  const { share, expired } = found;
  if (expired) { res.status(410).json({ error: 'expired' }); return null; }
  if (share.password && cookieOf(req, 'ff_' + share.id) !== '1') {
    res.status(403).json({ error: 'Locked' }); return null;
  }
  if (!share.allow_upload) {
    res.status(403).json({ error: 'This link is download-only' }); return null;
  }
  return share;
}

router.post('/:token/big/begin', async (req, res) => {
  try {
    const share = await shareForUpload(req, res);
    if (!share) return;
    if (!await objects.enabled(objects.PRIVATE)) {
      return res.status(400).json({ error: 'Large uploads are not available on this link' });
    }

    let folderId = req.body?.folder_id ? Number(req.body.folder_id) : null;
    if (folderId) {
      const f = await prisma.file_folders.findUnique({ where: { id: folderId } });
      if (!f || !(await withinShare(f.id, share.folder_id, share.vendor_id))) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    const size = Number(req.body?.size_bytes);
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'size_bytes required' });

    /* The vendor's plan pays for this, not the client's, so it is their
       remaining space that decides — and the message says so without naming
       figures a client has no business seeing. */
    const st = await storageFor(share.vendor_id);
    if (size > st.remaining_bytes) {
      return res.status(413).json({ error: 'storage_full',
        message: 'There is not enough space left on this link. Please let them know.' });
    }

    const stored = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${path.extname(String(req.body?.filename || '')).slice(0, 12)}`;
    const key = objects.keyFor(share.vendor_id, 'files', stored);   // 🔒 vendor from the SHARE
    const uploadId = await objects.beginMultipart(objects.PRIVATE, key, req.body?.content_type || undefined);

    res.json({ upload_id: uploadId, key, stored_name: stored,
      part_size: BIG_PART_SIZE, min_part_size: BIG_MIN_PART_SIZE });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:token/big/sign', async (req, res) => {
  try {
    const share = await shareForUpload(req, res);
    if (!share) return;
    const { key, upload_id: uploadId } = req.body || {};
    const part = Number(req.body?.part_number);
    if (!key || !uploadId || !Number.isInteger(part) || part < 1) {
      return res.status(400).json({ error: 'key, upload_id and part_number required' });
    }
    /* 🔒 Rebuilt from the share's vendor id, so a key belonging to anyone else
       cannot be signed however it was obtained. */
    if (key !== objects.keyFor(share.vendor_id, 'files', path.basename(key))) {
      return res.status(403).json({ error: 'Not your key' });
    }
    res.json({ url: await objects.signPart(objects.PRIVATE, key, uploadId, part) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:token/big/complete', async (req, res) => {
  try {
    const share = await shareForUpload(req, res);
    if (!share) return;
    const { key, upload_id: uploadId } = req.body || {};
    if (!key || !uploadId) return res.status(400).json({ error: 'key and upload_id required' });
    if (key !== objects.keyFor(share.vendor_id, 'files', path.basename(key))) {
      return res.status(403).json({ error: 'Not your key' });
    }

    let folderId = req.body?.folder_id ? Number(req.body.folder_id) : null;
    if (folderId) {
      const f = await prisma.file_folders.findUnique({ where: { id: folderId } });
      if (!f || !(await withinShare(f.id, share.folder_id, share.vendor_id))) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    await objects.completeMultipart(objects.PRIVATE, key, uploadId);
    const head = await objects.headObject(objects.PRIVATE, key);
    const realSize = Number(head?.size || 0);

    // measured, not claimed — see the vendor route for why
    const st = await storageFor(share.vendor_id);
    if (realSize > st.remaining_bytes) {
      try { await objects.deleteObject(objects.PRIVATE, key); } catch { /* best effort */ }
      return res.status(413).json({ error: 'storage_full',
        message: 'There is not enough space left on this link. Please let them know.' });
    }

    const row = await prisma.file_share_items.create({
      data: {
        vendor_id: share.vendor_id,                    // 🔒 stamped from the share
        folder_id: folderId,
        filename: String(req.body?.filename || 'file').slice(0, 300),
        stored_name: path.basename(key),
        size_bytes: BigInt(realSize),
        mime: req.body?.content_type ? String(req.body.content_type).slice(0, 150) : null,
        uploaded_by: 'client',
        uploader_name: String(req.body?.uploader_name || '').trim().slice(0, 120) || null,
      },
    });
    res.status(201).json({ added: 1, id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:token/big/abort', async (req, res) => {
  try {
    const share = await shareForUpload(req, res);
    if (!share) return;
    const { key, upload_id: uploadId } = req.body || {};
    if (!key || !uploadId) return res.status(400).json({ error: 'key and upload_id required' });
    if (key !== objects.keyFor(share.vendor_id, 'files', path.basename(key))) {
      return res.status(403).json({ error: 'Not your key' });
    }
    await objects.abortMultipart(objects.PRIVATE, key, uploadId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

    // whichever folder they were browsing; checked against this share
    let folderId = req.body?.folder_id ? Number(req.body.folder_id) : null;
    if (folderId) {
      const f = await prisma.file_folders.findUnique({ where: { id: folderId } });
      if (!f || !(await withinShare(f.id, share.folder_id, share.vendor_id))) { cleanup(); return res.status(404).json({ error: 'Folder not found' }); }
    }

    const dir = vendorDir(share.vendor_id);
    fs.mkdirSync(dir, { recursive: true });
    const who = String(req.body?.uploader_name || '').trim().slice(0, 120) || null;
    let n = 0;
    for (const f of req.files) {
      const ext = path.extname(f.originalname || '').slice(0, 12);
      const stored = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      fs.renameSync(f.path, path.join(dir, stored));

      /* ☁️ And to R2. This route never did — a file a couple sent back was
         written to the VPS disk and left there, while the vendor's own uploads
         went to the bucket. Storage is R2-only now, so the disk copy is dropped
         once the object is safely across, exactly as the vendor path does. */
      if (await objects.enabled(objects.PRIVATE)) {
        try {
          await objects.putObject(objects.PRIVATE, objects.keyFor(share.vendor_id, 'files', stored),
            fs.createReadStream(path.join(dir, stored)), f.mimetype || undefined);
          try { fs.unlinkSync(path.join(dir, stored)); } catch { /* already gone */ }
        } catch (e) { console.error('[files] R2 upload failed for', stored, e.message); }
      }
      await prisma.file_share_items.create({
        data: {
          vendor_id: share.vendor_id,                     // 🔒 stamped from the share
          filename: String(f.originalname || 'file').slice(0, 300),
          stored_name: stored,
          size_bytes: f.size,
          mime: f.mimetype ? String(f.mimetype).slice(0, 150) : null,
          uploaded_by: 'client',
          uploader_name: who,
          folder_id: folderId,
        },
      });
      n++;
    }
    res.status(201).json({ ok: true, added: n });
  } catch (e) { cleanup(); res.status(500).json({ error: e.message }); }
});

export default router;
