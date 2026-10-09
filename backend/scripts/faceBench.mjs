/**
 * 🧪 Face bench — how good are the circles, on EVERY album at once?
 *
 * Raj, 2026-10-09: a fix for one album must not quietly break another. Run
 * this before and after any change to finding, fingerprinting or grouping
 * faces, and compare. It changes nothing.
 *
 *   node scripts/faceBench.mjs [--json out.json] [--time N]
 *
 * Per album and tab: circles, their sizes, faces found, faces placed in a
 * circle, and the quality of the covers (smallest, blurriest, most turned).
 * Then the KNOWN CASES — real mistakes Raj pointed out, which must stay fixed
 * (scripts/faceBench.cases.json). --time N measures the engine on N photos.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/config/prisma.js';
import { GALLERIES_ROOT } from '../src/config/paths.js';
import * as objects from '../src/lib/objectStore.js';
import { withLocalFile, galleryKeyFromRel } from '../src/lib/localFile.js';
import { boxSize, PRESENTABLE, COVER } from '../src/lib/portraitScore.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const q = (arr, p) => { const v = arr.filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(p * (v.length - 1))] : null; };
const out = { at: new Date().toISOString(), albums: [], cases: [] };

const albums = await prisma.albums.findMany({ where: { kind: 'gallery', photos: { some: { face_indexed: true } } }, select: { id: true, title: true }, orderBy: { id: 'asc' } });
for (const a of albums) {
  const tabs = await prisma.$queryRawUnsafe(`select distinct coalesce(event_id, 0) as e from photos where album_id = $1`, a.id);
  for (const { e } of tabs) {
    const evName = e ? (await prisma.album_events.findUnique({ where: { id: e }, select: { name: true } }))?.name : '(no tab)';
    const photos = await prisma.photos.findMany({ where: { album_id: a.id, event_id: e || null, face_indexed: true }, select: { id: true, faces: true } });
    const facesFound = photos.reduce((n, p) => n + (p.faces || []).length, 0);
    const circles = await prisma.face_clusters.findMany({ where: { album_id: a.id, event_id: e || null }, select: { id: true, photo_count: true, cover_photo_id: true, cover_box: true } });
    const inCircles = await prisma.photo_faces.count({ where: { cluster_id: { in: circles.map(c => c.id) } } });
    const cov = [];
    for (const c of circles) {
      const p = photos.find(x => x.id === c.cover_photo_id); if (!p) continue;
      const f = (p.faces || []).find(x => Math.abs((x.box?._x ?? 0) - (c.cover_box?._x ?? -1)) < 1) || {};
      const { w, h } = boxSize(c.cover_box || {});
      cov.push({ px: Math.min(w, h), blur: f.blur, yaw: Math.abs(f.yaw ?? 0), score: f.score, eyeOpen: f.eyeOpen, pitch: f.pitch, roll: f.roll });
    }
    const sizes = { 2: 0, '3-5': 0, '6-19': 0, '20+': 0 };
    for (const c of circles) { const n = c.photo_count; sizes[n >= 20 ? '20+' : n >= 6 ? '6-19' : n >= 3 ? '3-5' : 2]++; }
    out.albums.push({
      album: a.title, tab: evName, photos: photos.length, facesFound, circles: circles.length, sizes, facesInCircles: inCircles,
      cover: { pxP10: q(cov.map(x => x.px), 0.1), blurP90: q(cov.map(x => x.blur), 0.9), yawP90: q(cov.map(x => x.yaw), 0.9) },
      // 🥛 a cover the finder was not sure is a face (a glass, a hand) — must be 0
      unsureCovers: cov.filter(x => typeof x.score === 'number' && x.score < PRESENTABLE.minScore).length,
      // 👁️ covers with eyes closed / looking down / tilted — as few as the photos allow
      eyesClosed: cov.filter(x => typeof x.eyeOpen === 'number' && x.eyeOpen < COVER.shutEye).length,
      lookingDown: cov.filter(x => typeof x.pitch === 'number' && typeof x.eyeOpen === 'number' && x.pitch > COVER.maxPitchDown).length,
      tilted: cov.filter(x => typeof x.roll === 'number' && Math.abs(x.roll) > COVER.maxRoll).length,
    });
  }
}

/* 🧷 Known cases: "these photos are the same person, in ONE circle, and the
   cover is the right one". Each entry: { name, album, file, with:[files],
   coverIsKey?, coverNot? } — coverNot: a photo that must never be the cover. In a group photo the person meant is the face whose circle
   holds the most of the "with" photos — no face numbers to keep up to date. */
const casesFile = path.join(path.dirname(new URL(import.meta.url).pathname), 'faceBench.cases.json');
const cases = fs.existsSync(casesFile) ? JSON.parse(fs.readFileSync(casesFile, 'utf8')) : [];
for (const k of cases) {
  const key = await prisma.photos.findFirst({ where: { album_id: k.album, filename: { contains: k.file } } });
  if (!key) { out.cases.push({ name: k.name, ok: false, together: '-', cover: 'photo not found' }); continue; }
  const others = await prisma.photos.findMany({ where: { album_id: k.album, OR: k.with.map(w => ({ filename: { contains: w } })) }, select: { id: true } });
  let link = null, together = 0;
  for (const l of await prisma.photo_faces.findMany({ where: { photo_id: key.id } })) {
    const n = await prisma.photo_faces.count({ where: { cluster_id: l.cluster_id, photo_id: { in: others.map(o => o.id) } } });
    if (n > together || !link) { link = l; together = n; }
  }
  const c = link && await prisma.face_clusters.findUnique({ where: { id: link.cluster_id } });
  const bad = k.coverNot ? await prisma.photos.findFirst({ where: { album_id: k.album, filename: { contains: k.coverNot } }, select: { id: true } }) : null;
  const coverPhoto = c ? await prisma.photos.findUnique({ where: { id: c.cover_photo_id }, select: { filename: true } }) : null;
  const ok = !!link && together === others.length && (!k.coverIsKey || c.cover_photo_id === key.id) && (!bad || c.cover_photo_id !== bad.id);
  out.cases.push({ name: k.name, ok, together: `${together}/${others.length}`, cover: coverPhoto?.filename || '-' });
}

// ⏱️ engine speed on N real photos
const N = Number(arg('--time') || 0);
if (N) {
  const { getFaceDescriptors } = await import('../src/lib/faceEngine.js');
  const sample = await prisma.photos.findMany({ where: { album_id: { in: albums.map(a => a.id) }, face_indexed: true }, select: { preview_path: true }, take: N, orderBy: { id: 'asc' } });
  const run = (s) => withLocalFile(path.join(GALLERIES_ROOT, s.preview_path), objects.PRIVATE, galleryKeyFromRel(s.preview_path), f => getFaceDescriptors(f));
  await run(sample[0]);                                    // warm-up: models load
  const t0 = process.cpuUsage(), w0 = Date.now(); let faces = 0;
  for (const s of sample) faces += (await run(s)).length;
  const cpu = process.cpuUsage(t0);
  out.speed = { photos: N, faces, msPerPhoto: Math.round((Date.now() - w0) / N), cpuMsPerPhoto: Math.round((cpu.user + cpu.system) / 1000 / N) };
}

for (const r of out.albums) console.log(`${r.album} / ${r.tab}: ${r.photos} photos · ${r.facesFound} faces found · ${r.circles} circles ${JSON.stringify(r.sizes)} · ${r.facesInCircles} in circles · covers p10 ${Math.round(r.cover.pxP10 ?? 0)}px, blur p90 ${r.cover.blurP90?.toFixed(2)}, turn p90 ${Math.round(r.cover.yawP90 ?? 0)}° · ${r.unsureCovers ? '❌' : '✅'} unsure covers ${r.unsureCovers} · covers with eyes closed ${r.eyesClosed}, looking down ${r.lookingDown}, tilted ${r.tilted}`);
for (const c of out.cases) console.log(`${c.ok ? '✅' : '❌'} case: ${c.name} · together ${c.together} · cover ${c.cover}`);
if (out.speed) console.log(`⏱️ ${out.speed.msPerPhoto} ms per photo (CPU ${out.speed.cpuMsPerPhoto} ms) over ${out.speed.photos} photos, ${out.speed.faces} faces`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(0);
