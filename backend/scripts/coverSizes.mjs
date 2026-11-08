/**
 * 🖼️ Cover sizes for covers made before them (Raj, 2026-11-08: speed first). Safe to run again: a cover that already
 * has every size is left alone.
 *
 * For each album with a cover, the missing renditions (lib/coverImage.js coverNames — 1920, 800 and tiny, in both
 * shapes) are cut from the cover's master, around its saved focus point, exactly as an upload or a focus change makes
 * them. A cover older than masters has none, so its own full-size crops are the source instead: each shape's smaller
 * sizes are shrunk from that shape's full crop. Existing files are never rewritten.
 *
 * Run from the backend directory:  node scripts/coverSizes.mjs   (add --dry to only report)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import prisma from '../src/config/prisma.js';
import * as objects from '../src/lib/objectStore.js';
import { withLocalFile } from '../src/lib/localFile.js';
import { GALLERIES_ROOT } from '../src/config/paths.js';
import { coverName, coverNames, writeCrops, COVER_SIZES } from '../src/lib/coverImage.js';

const DRY = process.argv.includes('--dry');
const key = (vendorId, albumId, file) => objects.keyFor(vendorId, 'galleries', String(albumId), file);
const r2 = await objects.enabled(objects.PRIVATE);

/** Is this file of the cover already stored (R2, or the disk for an environment without R2)? */
async function has(a, file) {
  if (r2) return !!(await objects.headObject(objects.PRIVATE, key(a.vendor_id, a.id, file)));   // null when it is not there
  return fs.existsSync(path.join(GALLERIES_ROOT, String(a.id), file));
}
async function store(a, dir, file) {
  if (!r2) return;                                                // the disk copy is the stored one
  await objects.putObject(objects.PRIVATE, key(a.vendor_id, a.id, file), fs.createReadStream(path.join(dir, file)));
  fs.unlinkSync(path.join(dir, file));
}

const albums = await prisma.albums.findMany({ where: { cover_photo: { not: null } }, select: { id: true, vendor_id: true, title: true, cover_photo: true, cover_focus: true }, orderBy: { id: 'asc' } });
let made = 0, skipped = 0, failed = 0;
for (const a of albums) {
  const base = a.cover_photo.replace(/\.webp$/, '');
  const missing = [];
  for (const f of coverNames(base)) if (!await has(a, f)) missing.push(f);
  if (!missing.length) { skipped++; continue; }
  if (DRY) { console.log(`#${a.id} ${a.title}: would make ${missing.length}`); continue; }
  const dir = r2 ? fs.mkdtempSync(path.join(os.tmpdir(), 'cover-')) : path.join(GALLERIES_ROOT, String(a.id));
  try {
    // the master, cut exactly as an upload would
    const fromMaster = await withLocalFile(path.join(GALLERIES_ROOT, String(a.id), `${base}_master.webp`),
      objects.PRIVATE, key(a.vendor_id, a.id, `${base}_master.webp`),
      (master) => writeCrops(master, dir, base, a.cover_focus || '50% 50%', { only: missing }));
    let written = fromMaster || [];
    if (!fromMaster) {
      // older than masters: each shape's full crop is the source of its smaller sizes
      for (const shape of ['wide', 'tall']) {
        const full = coverName(base, shape, 'full');
        const want = missing.filter(f => Object.keys(COVER_SIZES).some(s => s !== 'full' && f === coverName(base, shape, s)));
        if (!want.length) continue;
        const done = await withLocalFile(path.join(GALLERIES_ROOT, String(a.id), full), objects.PRIVATE, key(a.vendor_id, a.id, full), async (src) => {
          for (const [size, spec] of Object.entries(COVER_SIZES)) {
            const out = coverName(base, shape, size);
            if (!want.includes(out)) continue;
            await sharp(src).resize(spec.edge, spec.edge, { fit: 'inside', withoutEnlargement: true }).webp({ quality: spec.q }).toFile(path.join(dir, out));
            written.push(out);
          }
          return true;
        });
        if (!done) console.log(`  #${a.id}: no ${shape} cover to shrink from — it keeps falling back to the nearest it has`);
      }
    }
    for (const f of written) await store(a, dir, f);
    made += written.length;
    console.log(`#${a.id} ${a.title}: ${written.length} made${fromMaster ? ' (from the master)' : ' (from its full crops)'}`);
  } catch (e) { failed++; console.log(`#${a.id} ${a.title}: failed — ${e.message}`); }
  finally { if (r2) fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(`done: ${made} files made · ${skipped} covers already complete · ${failed} failed`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
