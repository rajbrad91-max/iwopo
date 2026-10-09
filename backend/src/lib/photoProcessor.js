/**
 * 🖼️ Making the screen sizes AFTER a photo is already safe in R2.
 *
 * Raj, 2026-10-09: "uploading should happen first — the photo goes to R2, and
 * then the system makes the thumbnails after, so our VPS is not blocking the
 * upload speed." The panel now sends each original straight to Cloudflare; this
 * server only signs the permission and records the row. Here, in the
 * background, each new original is fetched back and its 2200px preview and
 * 800px thumb are made.
 *
 * ⚖️ This is also the GLOBAL limit on resizing: at most RESIZE_SLOTS photos are
 * decoded at once, however many vendors are uploading. Fifty vendors sending at
 * once queue here rather than swamping the four cores that also serve every
 * client's gallery — their uploads still run at the speed of their internet.
 *
 * 🔁 Survives restarts: a row stays ready=false until its sizes exist, and
 * resumePending() picks every such row up again at boot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { withLocalFile, galleryKeyFromRel } from './localFile.js';
import { renderTiers } from './photoSizes.js';
import { enqueueAlbum, uploadActive } from './faceQueue.js';

const RESIZE_SLOTS = 2;                     // decodes at once, box-wide — 4 cores, the API needs the rest
const TMP = path.join(os.tmpdir(), 'iwopo-proc');

const queue = [];
const queued = new Set();
let running = 0;

/** Add photo ids to be processed. Duplicates are ignored. */
export function enqueuePhotos(ids) {
  for (const id of ids) {
    const n = Number(id);
    if (!n || queued.has(n)) continue;
    queued.add(n); queue.push(n);
  }
  pump();
}

function pump() {
  while (running < RESIZE_SLOTS && queue.length) {
    const id = queue.shift();
    running++;
    processOne(id)
      .catch(e => console.error('[photos] processing failed for', id, e.message))
      .finally(() => { running--; queued.delete(id); pump(); });
  }
}

async function processOne(id) {
  const p = await prisma.photos.findUnique({
    where: { id },
    select: { id: true, album_id: true, vendor_id: true, ready: true, storage_path: true,
      preview_path: true, thumb_path: true, size_bytes: true, albums: { select: { kind: true } } },
  });
  if (!p || p.ready) return;                         // deleted meanwhile, or already done

  const full = path.basename(p.preview_path), thumb = path.basename(p.thumb_path);
  fs.mkdirSync(TMP, { recursive: true });
  const done = await withLocalFile(null, objects.PRIVATE, galleryKeyFromRel(p.storage_path), async (orig) => {
    const sizes = await renderTiers(orig, TMP, { full, thumb }, p.albums?.kind);
    try {
      // 🔒 the vendor id comes from the ROW, which was checked against the token when it was made
      await Promise.all([
        objects.putObject(objects.PRIVATE, objects.keyFor(p.vendor_id, 'galleries', String(p.album_id), full),
          fs.createReadStream(path.join(TMP, full)), undefined, sizes.fullSize),
        objects.putObject(objects.PRIVATE, objects.keyFor(p.vendor_id, 'galleries', String(p.album_id), thumb),
          fs.createReadStream(path.join(TMP, thumb)), undefined, sizes.thumbSize),
      ]);
    } finally {
      for (const f of [full, thumb]) fs.rm(path.join(TMP, f), { force: true }, () => {});
    }
    return sizes;
  });
  if (!done) { console.error('[photos] original not found in R2 for photo', id); return; }

  /* updateMany, scoped by id AND ready:false — a photo deleted while it was
     being processed simply matches nothing (its files are then orphans, which
     the hourly sweep removes). */
  await prisma.photos.updateMany({
    where: { id, ready: false },
    data: { ready: true, size_bytes: BigInt(Number(p.size_bytes || 0) + done.fullSize + done.thumbSize) },
  });

  /* 🤳 When the album's last photo is ready, faces may start — unless the
     vendor is still uploading (the upload's own end will start them), and a
     live shoot always starts at once because its guests are waiting. */
  const left = await prisma.photos.count({ where: { album_id: p.album_id, ready: false } });
  if (!left && (p.albums?.kind === 'liveshoot' || !uploadActive(p.album_id))) enqueueAlbum(p.album_id);
}

/** At boot: anything left half-made by a restart is picked up again. */
export async function resumePending() {
  try {
    const rows = await prisma.photos.findMany({ where: { ready: false }, select: { id: true }, orderBy: { id: 'asc' } });
    if (rows.length) console.log('[photos] resuming', rows.length, 'unprocessed photos');
    enqueuePhotos(rows.map(r => r.id));
  } catch (e) { console.error('[photos] resume failed:', e.message); }
}
