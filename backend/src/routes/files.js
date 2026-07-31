import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import archiver from 'archiver';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { FILES_DIR } from '../config/paths.js';
import { sendAsVendor } from './email.js';

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


/* ───────── 📧 SHARE BY EMAIL ───────── */

function esc(x) {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The email a client receives when a vendor shares files with them.
 *
 * Table-based with inline styles, because that is what mail clients render
 * predictably — Outlook in particular ignores most of a stylesheet. Every
 * colour is literal for the same reason: a CSS variable resolves to nothing
 * in an inbox.
 *
 * The vendor's name leads, because that is who the client is expecting to hear
 * from. iwopo signs off underneath rather than heading the message — the client
 * has a relationship with the vendor, not with the software.
 */
function shareEmailHtml({ vendorName, title, note, url, hasPassword, message }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e8ec;border-radius:14px;">
  <tr><td style="padding:32px 34px 8px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 6px;font-size:20px;font-weight:600;color:#1a2529;">
      ${esc(vendorName)} has shared files with you
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#64757d;">
      ${esc(title)}${note ? ' — ' + esc(note) : ''}
    </p>
    ${message ? `<p style="margin:0 0 20px;padding:12px 15px;background:#f7f9fa;border:1px solid #e8edf0;border-radius:9px;font-size:14.5px;line-height:1.65;color:#4a5560;">${esc(message)}</p>` : ''}
  </td></tr>
  <tr><td style="padding:0 34px 26px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#0f766e;">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
        Open and download
      </a>
    </td></tr></table>
    <p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#8a949c;word-break:break-all;">
      Or paste this into your browser:<br>${esc(url)}
    </p>
    ${hasPassword ? '<p style="margin:14px 0 0;font-size:13px;color:#64757d;">This link asks for a password. Whoever sent it to you will have it.</p>' : ''}
  </td></tr>
  <tr><td style="padding:16px 34px 26px;border-top:1px solid #eef2f4;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p style="margin:0;font-size:12px;color:#9aa4ab;">
      Sent with <strong style="color:#0f766e;">iwopo</strong> · File Flyer
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * POST /api/files/:id/email → send the share link to one or more addresses.
 *
 * The link is built from the request's own origin rather than a configured
 * domain, so a share sent from staging points at staging. A hard-coded live URL
 * here has already caused a staging feature to hand out live links once.
 */
router.post('/:id/email', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    const raw = Array.isArray(req.body?.to) ? req.body.to : String(req.body?.to || '').split(/[,;\s]+/);
    const to = raw.map(x => String(x).trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!to.length) return res.status(400).json({ error: 'Give at least one valid email address' });
    if (to.length > 20) return res.status(400).json({ error: 'Twenty addresses at a time is the limit' });

    const vendor = await prisma.vendors.findUnique({
      where: { id: own.vendor_id }, select: { business_name: true },
    });
    const vendorName = vendor?.business_name || 'Your photographer';
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const url = `${origin}/f/${own.token}`;
    const message = String(req.body?.message || '').trim().slice(0, 1000) || null;

    const html = shareEmailHtml({
      vendorName, title: own.title, note: own.note, url,
      hasPassword: !!own.password, message,
    });
    const text = `${vendorName} has shared files with you.\n\n${own.title}${own.note ? ' — ' + own.note : ''}`
      + `${message ? '\n\n' + message : ''}\n\nOpen and download: ${url}`
      + `${own.password ? '\n\nThis link asks for a password. Whoever sent it to you will have it.' : ''}`
      + `\n\nSent with iwopo · File Flyer`;

    const sent = await sendAsVendor(own.vendor_id, {
      to: to.join(', '),
      subject: `${vendorName} has shared files with you`,
      html, text,
    });
    // the share itself is fine either way — say which happened rather than
    // reporting a failure the vendor cannot act on
    if (!sent.ok) return res.status(502).json({ error: sent.error, message: sent.message });
    res.json({ ok: true, sent_to: to.length, via: sent.via });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────── 🗜️ ZIP ───────── */

/**
 * Stream a share or a folder as a zip, rebuilding the folder structure inside
 * the archive so what lands in Downloads looks like what was on screen.
 *
 * Streamed rather than written to a temp file and sent: a share can be several
 * gigabytes, and building it on disk first would need that space free and make
 * the client wait for the whole thing before the download even starts.
 */
async function zipInto(archive, shareId, vendorId, folderId, prefix) {
  const [folders, items] = await Promise.all([
    prisma.file_folders.findMany({ where: { share_id: shareId, parent_id: folderId } }),
    prisma.file_share_items.findMany({ where: { share_id: shareId, folder_id: folderId } }),
  ]);
  for (const it of items) {
    const full = path.join(shareDir(vendorId, shareId), it.stored_name);
    // a row whose file is missing shouldn't abort the whole download
    if (fs.existsSync(full)) archive.file(full, { name: prefix + it.filename });
  }
  for (const f of folders) {
    // an empty folder still appears, which is what makes the zip match the screen
    archive.append(null, { name: prefix + f.name + '/' });
    await zipInto(archive, shareId, vendorId, f.id, prefix + f.name + '/');
  }
}

/** Zip filenames come from user input, so strip what a filesystem would reject. */
function safeZipName(name) {
  return String(name || 'files').replace(/[^\w\d\-. ]+/g, '_').trim().slice(0, 80) || 'files';
}

// GET /api/files/:id/zip → the whole share
router.get('/:id/zip', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    res.attachment(safeZipName(own.title) + '.zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    await zipInto(archive, id, own.vendor_id, null, '');
    archive.finalize();
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// GET /api/files/folder/:folderId/zip → one folder and everything under it
router.get('/folder/:folderId/zip', requireAuth, async (req, res) => {
  try {
    const fid = Number(req.params.folderId);
    const f = await prisma.file_folders.findUnique({ where: { id: fid } });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });     // 🔒 tenancy

    res.attachment(safeZipName(f.name) + '.zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    await zipInto(archive, f.share_id, f.vendor_id, fid, '');
    archive.finalize();
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

/* ───────── 📁 FOLDERS ───────── */

/**
 * Walk up from a folder to prove it belongs to this vendor's share, and build
 * the breadcrumb on the way. Checking the folder's own vendor_id alone is not
 * enough — a folder could carry the right vendor while sitting under a parent
 * in another share, and the browse endpoint would then hand over its contents.
 */
async function folderTrail(folderId, vendorId) {
  const trail = [];
  let cur = folderId ? await prisma.file_folders.findUnique({ where: { id: Number(folderId) } }) : null;
  if (folderId && !cur) return null;
  let guard = 0;
  while (cur) {
    if (cur.vendor_id !== vendorId) return null;                 // 🔒 tenancy at every level
    trail.unshift({ id: cur.id, name: cur.name });
    if (!cur.parent_id) break;
    if (++guard > 50) break;      // a cycle should be impossible; don't hang if one exists
    cur = await prisma.file_folders.findUnique({ where: { id: cur.parent_id } });
  }
  return trail;
}

/**
 * GET /api/files/:id/browse?folder=<id> → one level of a share.
 *
 * Returns the folders and files directly inside the given folder, plus the
 * breadcrumb to it. Deliberately one level rather than the whole tree: a share
 * with thousands of files should not serialise all of them to draw a window
 * showing twenty.
 */
router.get('/:id/browse', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    const folderId = req.query.folder ? Number(req.query.folder) : null;
    const trail = await folderTrail(folderId, own.vendor_id);
    if (folderId && trail === null) return res.status(404).json({ error: 'Folder not found' });

    const [folders, items] = await Promise.all([
      prisma.file_folders.findMany({
        where: { share_id: id, parent_id: folderId },            // 🔒 scoped by the share
        orderBy: { name: 'asc' },
      }),
      prisma.file_share_items.findMany({
        where: { share_id: id, folder_id: folderId },
        orderBy: { filename: 'asc' },
      }),
    ]);

    // what each folder holds, so the list can say "3 items" without a second call
    const counts = folders.length ? await prisma.file_share_items.groupBy({
      by: ['folder_id'],
      where: { folder_id: { in: folders.map(f => f.id) } },
      _count: { _all: true }, _sum: { size_bytes: true },
    }) : [];
    const byFolder = Object.fromEntries(counts.map(c => [c.folder_id, c]));

    res.json({
      share: { ...own, password: undefined, has_password: !!own.password },
      trail,
      folders: folders.map(f => ({
        ...f,
        file_count: byFolder[f.id]?._count?._all || 0,
        size_bytes: Number(byFolder[f.id]?._sum?.size_bytes || 0),
      })),
      items: items.map(i => ({ ...i, size_bytes: Number(i.size_bytes) })),
      storage: await storageFor(own.vendor_id),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/files/:id/folders → create one
router.post('/:id/folders', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const own = await prisma.file_shares.findUnique({ where: { id } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (own.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });   // 🔒 tenancy

    const name = String(req.body?.name || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ error: 'Give the folder a name' });
    // a name with a separator in it would read as a path and confuse the zip
    if (/[\\/]/.test(name)) return res.status(400).json({ error: 'A folder name cannot contain / or \\' });

    const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;
    if (parentId && !(await folderTrail(parentId, own.vendor_id))) {
      return res.status(404).json({ error: 'Parent folder not found' });
    }
    const folder = await prisma.file_folders.create({
      data: { share_id: id, vendor_id: own.vendor_id, parent_id: parentId, name },  // 🔒 from the share
    });
    res.status(201).json({ folder });
  } catch (e) {
    // the unique index is what enforces "no two things with one name here"
    if (e.code === 'P2002') return res.status(409).json({ error: 'Something here already has that name' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/files/folder/:folderId → rename
router.put('/folder/:folderId', requireAuth, async (req, res) => {
  try {
    const fid = Number(req.params.folderId);
    const f = await prisma.file_folders.findUnique({ where: { id: fid } });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });     // 🔒 tenancy

    const name = String(req.body?.name || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ error: 'Give the folder a name' });
    if (/[\\/]/.test(name)) return res.status(400).json({ error: 'A folder name cannot contain / or \\' });

    const folder = await prisma.file_folders.update({
      where: { id: fid }, data: { name, updated_at: new Date() },
    });
    res.json({ folder });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Something here already has that name' });
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/files/folder/:folderId → the folder and everything under it.
 *
 * The rows cascade in the database, but the files on disk do not, so they are
 * collected first and removed after. A folder deleted from the database with
 * its bytes still on disk would count against the vendor's storage forever
 * with nothing in the interface to point at.
 */
router.delete('/folder/:folderId', requireAuth, async (req, res) => {
  try {
    const fid = Number(req.params.folderId);
    const f = await prisma.file_folders.findUnique({ where: { id: fid } });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });     // 🔒 tenancy

    const ids = await descendantFolderIds(fid);
    const doomed = await prisma.file_share_items.findMany({
      where: { folder_id: { in: ids } },
      select: { stored_name: true, share_id: true },
    });
    await prisma.file_folders.delete({ where: { id: fid } });     // children cascade
    for (const d of doomed) {
      try { fs.unlinkSync(path.join(shareDir(f.vendor_id, d.share_id), d.stored_name)); }
      catch { /* already gone from disk */ }
    }
    res.json({ ok: true, removed_files: doomed.length, storage: await storageFor(f.vendor_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** A folder and every folder beneath it, so a delete can find all the files. */
async function descendantFolderIds(rootId) {
  const out = [Number(rootId)];
  let frontier = [Number(rootId)];
  let guard = 0;
  while (frontier.length && guard++ < 50) {
    const kids = await prisma.file_folders.findMany({
      where: { parent_id: { in: frontier } }, select: { id: true },
    });
    frontier = kids.map(k => k.id).filter(id => !out.includes(id));
    out.push(...frontier);
  }
  return out;
}

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

    // which folder these are going into; null means the share's root
    const folderId = req.body?.folder_id ? Number(req.body.folder_id) : null;
    if (folderId && !(await folderTrail(folderId, own.vendor_id))) {
      cleanup(); return res.status(404).json({ error: 'Folder not found' });
    }

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
          folder_id: folderId,
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
