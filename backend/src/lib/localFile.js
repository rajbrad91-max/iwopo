/**
 * 📂 A real file on disk, for the things that need one.
 *
 * Most of the app streams bytes and never cares where they came from. Four
 * things do care, because they hand a PATH to sharp or to the face engine
 * rather than a stream: face indexing, File Flyer thumbnails, re-cropping a
 * cover when its focal point moves, and cutting a face out of a photograph.
 *
 * Once storage stops keeping a local copy, those four have nothing to open. So
 * they ask here instead: if the file happens to be on disk it is used where it
 * lies, and if it is not it is fetched from R2 into a temp file and removed
 * afterwards. Neither caller needs to know which happened.
 *
 * The callback shape is deliberate — a temp file that is not deleted is a disk
 * leak, and leaving that to each caller is how leaks happen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import * as objects from './objectStore.js';

const TMP = path.join(os.tmpdir(), 'iwopo-fetch');

/**
 * Run `fn(localPath)` with a real file, wherever it has to come from.
 *
 * `diskPath` is where a local copy would live; `cls` and `key` say where to
 * find it in object storage. Returns whatever `fn` returns, or null when the
 * file cannot be found in either place.
 */
export async function withLocalFile(diskPath, cls, key, fn) {
  if (diskPath && fs.existsSync(diskPath)) return fn(diskPath);       // already here
  if (!key || !await objects.enabled(cls)) return null;

  fs.mkdirSync(TMP, { recursive: true });
  const tmp = path.join(TMP, crypto.randomBytes(12).toString('hex') + path.extname(key));
  try {
    const o = await objects.getStream(cls, key);
    await pipeline(o.stream, fs.createWriteStream(tmp));
    return await fn(tmp);
  } catch {
    return null;                                   // not in R2 either
  } finally {
    fs.unlink(tmp, () => {});                      // never leave it behind
  }
}

/**
 * The R2 key for a gallery path stored as "<vendor>/<album>/<name>".
 * Returns null for anything that is not that shape, so a malformed row cannot
 * be turned into a key pointing somewhere else.
 */
export function galleryKeyFromRel(rel) {
  const p = String(rel || '').split('/').filter(Boolean);
  if (p.length < 3) return null;
  try { return objects.keyFor(p[0], 'galleries', p[1], p[2]); } catch { return null; }
}

/**
 * 🧹 Drop a local copy once object storage has it.
 *
 * Every upload wrote to the disk AND to R2, which is what let R2 arrive one
 * prefix at a time without a cutover. It has done that job. Keeping both now
 * means the VPS holds a second full copy of every wedding — one vendor on a
 * 200GB plan would fill a 193GB disk while every byte sat safely in R2.
 *
 * Called only after putObject has resolved, so a failed upload leaves the local
 * file exactly where it was. Nothing here throws: a file that cannot be removed
 * is wasted space, not a broken upload.
 */
export function dropLocal(...paths) {
  for (const p of paths.flat().filter(Boolean)) {
    try { fs.unlinkSync(p); } catch { /* already gone, or in use — harmless */ }
  }
}
