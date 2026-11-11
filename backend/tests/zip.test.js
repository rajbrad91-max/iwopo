/**
 * 🗜️ Zip downloads (gallery downloads, a client's selection, Raw Selector, File Flyer) all go through archiver.
 * Its glob and minimatch are pinned to fixed versions by package.json "overrides" (2026-11-11), so this checks the
 * zips it writes — stored (lib/photoZip.js) and compressed (routes/files.js) — are whole and their files unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import archiver from 'archiver';
import { staging, prisma } from './helpers.js';

staging();
const { photoZip } = await import('../src/lib/photoZip.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwopo-zip-'));
const photo = crypto.randomBytes(400_000);              // stands in for a photo: random bytes do not compress
fs.writeFileSync(path.join(dir, 'photo.jpg'), photo);

const write = (archive, out) => new Promise((ok, bad) => {
  const s = fs.createWriteStream(out);
  archive.on('error', bad); archive.on('warning', bad); s.on('close', ok);
  archive.pipe(s);
  archive.append(fs.createReadStream(path.join(dir, 'photo.jpg')), { name: 'Wedding/photo.jpg' });
  archive.file(path.join(dir, 'photo.jpg'), { name: 'photo-2.jpg' });
  archive.append('a note', { name: 'readme.txt' });
  archive.finalize();
});

for (const [label, make] of [['stored, as gallery downloads are', () => photoZip()], ['compressed, as File Flyer zips are', () => archiver('zip', { zlib: { level: 6 } })]]) {
  test(`a zip ${label} is whole and its photo unchanged`, async () => {
    const out = path.join(dir, `${label.split(',')[0]}.zip`);
    await write(make(), out);
    assert.match(execFileSync('unzip', ['-t', out]).toString(), /No errors detected/);
    assert.ok(execFileSync('unzip', ['-p', out, 'Wedding/photo.jpg'], { maxBuffer: 10_000_000 }).equals(photo), 'photo bytes identical');
  });
}

test.after(async () => { fs.rmSync(dir, { recursive: true, force: true }); await prisma.$disconnect(); });
