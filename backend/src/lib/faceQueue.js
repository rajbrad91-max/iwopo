import { GALLERIES_ROOT } from '../config/paths.js';
// 🧵 Face-indexing queue — adaptive worker, per-album engine lock, AWS overflow.
//
// Traffic speed is non-negotiable, so:
//   • Concurrency adapts to CPU load: quiet box → 2 photos at once, busy box → 1.
//   • A 250ms breather between photos keeps the event loop responsive.
//   • Each ALBUM is locked to ONE engine (never mix local + AWS in one album,
//     because their face data is incompatible).
//   • AWS is chosen per-album based on the admin's aws_mode setting + backlog:
//        aws_off        → always local
//        aws_on         → always AWS
//        aws_safety_net → local normally; overflow NEW albums to AWS only when
//                         the backlog is deep (local can't keep up).

import os from 'os';
import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma.js';
import { getFaceDescriptors } from './faceEngine.js';
import { getSetting } from './settings.js';
import { clusterAlbum } from './faceCluster.js';
import { indexAlbumAWS, groupAlbumFacesAWS } from './faceAWSIndex.js';

const ROOT = GALLERIES_ROOT;

// ── tunables ────────────────────────────────────────────────
const PAUSE_MS = 250;            // 0.25s breather between photos
const CORES = os.cpus().length;  // 4 on this box
const LOAD_LINE = 1.5;           // load < 1.5 → allow 2 workers; else 1 (traffic-first)
const MAX_CONCURRENCY = 2;       // never more than 2 local at once
const BACKLOG_AWS_LINE = 200;    // safety_net: overflow NEW albums to AWS above this
const MAX_ATTEMPTS = 2;          // retry a failed photo before skipping

const albumQueue = [];
const queued = new Set();
let running = false;

// how many photos are still un-indexed system-wide (backlog depth)
export async function backlogDepth() {
  try {
    return await prisma.photos.count({ where: { face_indexed: false } });
  } catch { return 0; }
}

// current 1-minute load average (trailing, but fine for a gentle 1↔2 choice)
function currentLoad() { return os.loadavg()[0]; }

// how many local workers are we allowed to run right now?
function allowedConcurrency() {
  return currentLoad() < LOAD_LINE ? MAX_CONCURRENCY : 1;
}

// decide the engine for a WHOLE album and LOCK it (persisted on the album row).
// Once an album has indexed its first photo with an engine, that engine is reused
// forever — even if more photos are added later when the backlog/mode differs.
// This is what prevents mixing incompatible local + AWS face data in one album.
async function resolveAlbumEngine(albumId) {
  // already locked? reuse it, no matter the current mode/backlog
  try {
    const a = await prisma.albums.findUnique({
      where: { id: Number(albumId) },
      select: { face_engine_lock: true },
    });
    if (a?.face_engine_lock) return a.face_engine_lock;
  } catch { /* fall through to pick */ }

  // not locked yet → pick per the admin's mode, then persist the choice
  let mode;
  try { mode = await getSetting('aws_mode', 'aws_off'); } catch { mode = 'aws_off'; }
  let engine;
  if (mode === 'aws_on') engine = 'aws';
  else if (mode === 'aws_off') engine = 'local';
  else {
    // safety_net: overflow to AWS only when backlog is deep — decided ONCE, then locked
    const depth = await backlogDepth();
    engine = depth > BACKLOG_AWS_LINE ? 'aws' : 'local';
  }
  // the WHERE face_engine_lock IS NULL guard keeps the first writer's choice
  try {
    await prisma.albums.updateMany({
      where: { id: Number(albumId), face_engine_lock: null },
      data: { face_engine_lock: engine },
    });
  } catch { /* best effort */ }
  return engine;
}

export function enqueueAlbum(albumId) {
  const id = String(albumId);
  if (queued.has(id)) return;
  queued.add(id);
  albumQueue.push(id);
  drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (albumQueue.length) {
      const albumId = albumQueue.shift();
      queued.delete(albumId);
      await indexOneAlbum(albumId);
    }
  } finally {
    running = false;
  }
}

// index one image → store descriptors (engine already chosen for the album)
async function indexPhoto(p, engine) {
  const full = path.join(ROOT, p.preview_path);
  if (!fs.existsSync(full)) return;
  // local engine only — AWS albums are handled by faceAWSIndex.js before this runs
  const found = await getFaceDescriptors(full);
  await prisma.photos.update({
    where: { id: p.id },
    data: { faces: found, face_count: found.length, face_indexed: true, face_engine: engine },
  });
}

async function indexOneAlbum(albumId) {
  const engine = await resolveAlbumEngine(albumId);   // 🔒 locked & persisted for this whole album

  // ☁️ AWS uses Rekognition Collections: AWS holds the face signatures and we
  // keep only the returned FaceId. Indexing and grouping both live in
  // faceAWSIndex.js, so the local descriptor path below never runs for AWS.
  if (engine === 'aws') {
    try {
      await indexAlbumAWS(albumId);
      await groupAlbumFacesAWS(albumId);
    } catch (e) { console.error('aws face indexing failed:', e.message); }
    return;
  }

  let photos;
  try {
    photos = await prisma.photos.findMany({
      where: { album_id: Number(albumId), face_indexed: false },
      select: { id: true, preview_path: true },
      orderBy: { id: 'asc' },
    });
  } catch { return; }

  let i = 0;
  while (i < photos.length) {
    const conc = allowedConcurrency();          // re-check load every batch → adapts to traffic
    const batch = photos.slice(i, i + conc);
    await Promise.all(batch.map(async (p) => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try { await indexPhoto(p, engine); return; }
        catch (e) { if (attempt >= MAX_ATTEMPTS) { /* skip, leave for a later pass */ } }
      }
    }));
    i += batch.length;
    await new Promise(r => setTimeout(r, PAUSE_MS));   // breather
  }

  // 🧑‍🤝‍🧑 group the faces into people so the gallery can show face circles
  try { await clusterAlbum(albumId); }
  catch (e) { console.error('face clustering failed:', e.message); }
}

// manual full re-index (vendor/admin button) — still adaptive + throttled
export async function indexAlbumNow(albumId) {
  const where = { album_id: Number(albumId), face_indexed: false };
  const before = await prisma.photos.count({ where });
  await indexOneAlbum(albumId);
  const after = await prisma.photos.count({ where });
  return { requested: before, remaining: after };
}

// live status for the super-panel dashboard
export async function queueStatus() {
  const depth = await backlogDepth();
  let mode; try { mode = await getSetting('aws_mode', 'aws_off'); } catch { mode = 'aws_off'; }
  return {
    backlog: depth,
    load: Number(currentLoad().toFixed(2)),
    cores: CORES,
    concurrency: allowedConcurrency(),
    aws_mode: mode,
    overflowing: mode === 'aws_safety_net' && depth > BACKLOG_AWS_LINE,
  };
}
