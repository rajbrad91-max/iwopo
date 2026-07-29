import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { FILES_DIR } from '../config/paths.js';

const router = express.Router();

// 2GB per file. The real ceiling is the vendor's own storage allowance, which
// is checked below against what they've actually used — this is only here so a
// single absurd upload can't fill the disk before that check runs.
const upload = multer({ dest: '/tmp/iwopo_files', limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

const vid = (req) => Number(req.user.vendor_id);

/**
 * 💾 What this vendor has stored, and what they're allowed.
 *
 * Summed from the rows rather than tracked in a counter, because a counter and
 * the actual files drift the moment anything fails halfway — a delete that
 * errored, a half-finished upload — and then the number a vendor is judged by
 * is quietly wrong. Summing is slower and always right.
 */
async function storageFor(vendorId) {
  const agg = await prisma.file_share_items.aggregate({
    where: { vendor_id: vendorId },                       // 🔒 tenancy
    _sum: { size_bytes: true },
  });
  const settings = await prisma.vendor_settings.findUnique({
    where: { vendor_id: vendorId },
    select: { storage_limit_mb: true },
  });
  const usedBytes = Number(agg._sum.size_bytes || 0);
  const limitMb = settings?.storage_limit_mb ?? 1024;
  return {
    used_bytes: usedBytes,
    limit_bytes: limitMb * 1024 * 1024,
    limit_mb: limitMb,
    remaining_bytes: Math.max(limitMb * 1024 * 1024 - usedBytes, 0),
  };
}

/** Where one share's files live. Vendor id is in the path so a stray id can't
 *  reach another vendor's folder even if a share id were guessed. */
function shareDir(vendorId, shareId) {
  return path.join(FILES_DIR, String(vendorId), String(shareId));
}

/* ───────── 📤 SHARES ───────── */

// GET /api/files → this vendor's shares + their storage position
router.get('/', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const shares = await prisma.file_shares.findMany({
      where: { vendor_id: v },                            // 🔒 tenancy
      orderBy: { id: 'desc' },
      include: { _count: { select: { file_share_items: true } } },
    });
    const sums = await prisma.file_share_items.groupBy({
      by: ['share_id'],
      where: { vendor_id: v },                            // 🔒 tenancy
      _sum: { size_bytes: true },
    });
    const bytesByShare = Object.fromEntries(sums.map(s => [s.share_id, Number(s._sum.size_bytes || 0)]));
    res.json({
      shares: shares.map(s => ({
        ...s,
        password: undefined,                              // never leave the server
        has_password: !!s.password,
        file_count: s._count.file_share_items,
        size_bytes: bytesByShare[s.id] || 0,
      })),
      storage: await storageFor(v),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/files → create a share
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, note, password, allow_upload, expires_at } = req.body;
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Give it a title' });
    const share = await prisma.file_shares.create({
      data: {
        vendor_id: vid(req),                              // 🔒 stamped from the token
        title: String(title).trim().slice(0, 200),
        note: note ? String(note).slice(0, 2000) : null,
        password: password ? String(password).slice(0, 120) : null,
        allow_upload: allow_upload !== false,
        expires_at: expires_at ? new Date(expires_at) : null,
        token: crypto.randomBytes(24).toString('hex'),
      },
    });
    res.status(201).json({ share: { ...share, password: undefined, has_password: !!share.password } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/files/:id → rename, re-note, change the gate
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    const { title, note, password, allow_upload, expires_at } = req.body;
    const data = { updated_at: new Date() };
    if (title !== undefined) data.title = String(title).trim().slice(0, 200);
    if (note !== undefined) data.note = note ? String(note).slice(0, 2000) : null;
    // an empty string clears the gate; undefined leaves it alone
    if (password !== undefined) data.password = password ? String(password).slice(0, 120) : null;
    if (allow_upload !== undefined) data.allow_upload = !!allow_upload;
    if (expires_at !== undefined) data.expires_at = expires_at ? new Date(expires_at) : null;

    const share = await prisma.file_shares.update({ where: { id }, data });
    res.json({ share: { ...share, password: undefined, has_password: !!share.password } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/files/:id → the share and everything in it
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    // files off the disk first: a row with no file is recoverable noise, but a
    // file with no row is invisible and counts against nobody's quota forever
    fs.rmSync(shareDir(own.vendor_id, id), { recursive: true, force: true });
    await prisma.file_shares.delete({ where: { id } });   // items cascade
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ───────── 📎 FILES ───────── */

// GET /api/files/:id/items → what's in one share
router.get('/:id/items', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy
    const items = await prisma.file_share_items.findMany({
      where: { share_id: id },                            // 🔒 tenancy via the share
      orderBy: { id: 'desc' },
    });
    res.json({
      share: { ...own, password: undefined, has_password: !!own.password },
      items: items.map(i => ({ ...i, size_bytes: Number(i.size_bytes) })),
      storage: await storageFor(own.vendor_id),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/files/:id/upload → the vendor adds files to a share.
 *
 * The quota is checked against what is ALREADY stored plus what is arriving,
 * before anything is moved out of /tmp — accepting a file and then discovering
 * there was no room for it leaves the vendor over their limit with no way back
 * except deleting something they just sent.
 */
router.post('/:id/upload', requireAuth, upload.array('files', 30), async (req, res) => {
  const tmp = (req.files || []).map(f => f.path);
  const cleanup = () => tmp.forEach(p => { try { fs.unlinkSync(p); } catch { /* already gone */ } });
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) { cleanup(); return res.status(404).json({ error: 'Not found' }); }
    if (own.vendor_id !== vid(req)) { cleanup(); return res.status(403).json({ error: 'Forbidden' }); }  // 🔒 tenancy
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });

    const incoming = req.files.reduce((n, f) => n + f.size, 0);
    const st = await storageFor(own.vendor_id);
    if (incoming > st.remaining_bytes) {
      cleanup();
      return res.status(413).json({
        error: 'storage_full',
        message: `That would exceed your ${st.limit_mb} MB of storage. Free some space or ask for more.`,
        storage: st,
      });
    }

    const dir = shareDir(own.vendor_id, id);
    fs.mkdirSync(dir, { recursive: true });
    const made = [];
    for (const f of req.files) {
      // stored name is generated, never the client's — a filename is untrusted
      // input and "../../etc/passwd" is a filename
      const ext = path.extname(f.originalname || '').slice(0, 12);
      const stored = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      fs.renameSync(f.path, path.join(dir, stored));
      made.push(await prisma.file_share_items.create({
        data: {
          share_id: id,
          vendor_id: own.vendor_id,                       // 🔒 stamped from the share
          filename: String(f.originalname || 'file').slice(0, 300),
          stored_name: stored,
          size_bytes: f.size,
          mime: f.mimetype ? String(f.mimetype).slice(0, 150) : null,
          uploaded_by: 'vendor',
        },
      }));
    }
    res.status(201).json({
      items: made.map(i => ({ ...i, size_bytes: Number(i.size_bytes) })),
      storage: await storageFor(own.vendor_id),
    });
  } catch (e) { cleanup(); res.status(500).json({ error: e.message }); }
});

// DELETE /api/files/item/:itemId → remove one file
router.delete('/item/:itemId', requireAuth, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const item = await prisma.file_share_items.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    try { fs.unlinkSync(path.join(shareDir(item.vendor_id, item.share_id), item.stored_name)); }
    catch { /* already gone from disk — still drop the row */ }
    await prisma.file_share_items.delete({ where: { id: itemId } });
    res.json({ ok: true, storage: await storageFor(item.vendor_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/files/item/:itemId/download → the vendor's own copy
router.get('/item/:itemId/download', requireAuth, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const item = await prisma.file_share_items.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy
    const full = path.join(shareDir(item.vendor_id, item.share_id), item.stored_name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing from storage' });
    res.download(full, item.filename);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
export { storageFor, shareDir };
