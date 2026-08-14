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
import * as objects from './objectStore.js';
import { withLocalFile, galleryKeyFromRel } from './localFile.js';

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
    return await prisma.photos.count({ where: { face_indexed: false, kind: 'photo' } });
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

/* 🕰️ Clustering waits until the uploading stops.

   Detection runs per batch, as it should — a photograph can be indexed the
   moment it lands. Grouping the faces into people is different: it throws away
   every cluster and rebuilds from scratch, so running it after each batch means
   a two hundred photograph upload rebuilds twenty times instead of once, on a
   four-core box shared with the API. A client opening the gallery mid-upload
   also watches the circles appear, vanish and rearrange.

   The server cannot tell which batch is the last — the browser simply sends N
   requests and stops. So this waits for quiet rather than for a signal: every
   upload pushes the timer out, and clustering runs once the album has been
   still for a while. A vendor who closes the tab half way still gets clustered,
   which a "done" button would not survive. */
/* Five minutes, not forty-five seconds.

   Forty-five was picked without measuring anything, and a real upload turned
   out to leave gaps of forty-four to fifty-two seconds between batches — so the
   window expired BETWEEN batches and grouping ran over and over mid-upload,
   which is the exact thing deferring it was meant to stop.
   
   This is a backstop, not the normal path: the panel says when it has finished
   and grouping happens then. The only job left for the timer is covering a tab
   that closed, and for that it can afford to be patient. */
const CLUSTER_QUIET_MS = 5 * 60_000;
const clusterTimers = new Map();

/* Albums whose uploader has said it is finished. The signal can arrive while
   photographs are still being indexed, so it is remembered rather than acted on
   once — the moment indexing drains, grouping runs without waiting out the
   window. Without this an album that took longer to index than to upload would
   still sit through the full forty-five seconds. */
const uploadsDone = new Set();

function scheduleClustering(albumId) {
  const id = String(albumId);
  clearTimeout(clusterTimers.get(id));
  clusterTimers.set(id, setTimeout(async () => {
    clusterTimers.delete(id);
    try { await groupAlbum(id); }
    catch (e) { console.error('face clustering failed:', e.message); }
  }, CLUSTER_QUIET_MS));
}

/** Group by whichever engine this album is locked to. The two keep their people
 *  in different tables, so the wrong one would silently produce no circles. */
async function groupAlbum(albumId) {
  const engine = await resolveAlbumEngine(albumId);
  return engine === 'aws' ? groupAlbumFacesAWS(albumId) : clusterAlbum(albumId);
}

/**
 * The uploader says it has finished.
 *
 * The debounce below cannot know which batch is the last, so it guesses by
 * waiting for quiet. The browser running the loop DOES know, so when it tells
 * us, group straight away instead of sitting out the remaining wait.
 *
 * If photographs are still being indexed the timer is simply reset — grouping
 * would otherwise run over a half-indexed album. It fires when that finishes.
 */
export async function uploadsFinished(albumId) {
  const id = String(albumId);
  const pending = await prisma.photos.count({
    where: { album_id: Number(albumId), face_indexed: false, kind: 'photo' },
  });
  if (pending > 0) {
    uploadsDone.add(id);              // remembered — indexing will group on the way out
    scheduleClustering(albumId);      // and the timer stays as the backstop
    return { grouped: false, pending };
  }
  uploadsDone.delete(id);
  await clusterNow(albumId);
  return { grouped: true, pending: 0 };
}

/** Group now rather than waiting — for the re-index button, which has no
 *  upload trailing it to go quiet. */
export async function clusterNow(albumId) {
  clearTimeout(clusterTimers.get(String(albumId)));
  clusterTimers.delete(String(albumId));
  return groupAlbum(albumId);
}

export function enqueueAlbum(albumId) {
  const id = String(albumId);
  /* Push the window out on every arrival. Waiting until indexing finished to
     reset it meant a batch that indexed quickly started the clock early, and
     the next batch arrived after it had already run. */
  if (clusterTimers.has(id)) scheduleClustering(id);
  if (queued.has(id)) return;
  queued.add(id);
  albumQueue.push(id);
  drain();
}

/* 🧵 Albums are worked on several at a time.

   This loop used to await each album start to finish, so a vendor uploading
   twenty photographs sat behind one uploading two thousand, no matter which
   engine either was using. On AWS that is pure waiting — the work happens on
   Rekognition's side and this process is idle between round trips — so running
   them one after another spent hours doing nothing.

   The CPU is still protected, and by the same amount: local detection now draws
   from ONE global budget rather than a per-album one, so four albums in flight
   share the same one or two workers that a single album had. What changes is
   that AWS albums no longer block the queue behind them, and a small local
   album is no longer stuck behind a huge one. */
const ALBUM_SLOTS = 4;

async function drain() {
  if (running) return;
  running = true;
  try {
    const inFlight = new Set();
    while (albumQueue.length || inFlight.size) {
      while (albumQueue.length && inFlight.size < ALBUM_SLOTS) {
        const albumId = albumQueue.shift();
        queued.delete(albumId);
        const job = indexOneAlbum(albumId)
          .catch(e => console.error('face indexing failed for album', albumId, e.message))
          .finally(() => inFlight.delete(job));
        inFlight.add(job);
      }
      if (inFlight.size) await Promise.race(inFlight);
    }
  } finally {
    running = false;
  }
}

/* 🚦 One budget for local detection across the whole platform.

   allowedConcurrency() already backed off from two workers to one when the box
   got busy, but it did that PER ALBUM — four albums each backing off to one
   would still be four photographs decoding at once on four cores, which is the
   API starved. Held globally, "one or two at a time" means what it says however
   many albums are running. */
let localBusy = 0;
const localWaiting = [];

async function takeLocalSlot() {
  while (localBusy >= allowedConcurrency()) {
    await new Promise(r => localWaiting.push(r));
  }
  localBusy++;
}
function freeLocalSlot() {
  localBusy--;
  const next = localWaiting.shift();
  if (next) next();
}

// index one image → store descriptors (engine already chosen for the album)
async function indexPhoto(p, engine) {
  /* The face engine wants a path, not a stream, so the file has to exist
     somewhere. Once storage stops keeping a local copy this pulls it from R2
     into a temp file and removes it afterwards. */
  const found = await withLocalFile(
    path.join(ROOT, p.preview_path),
    objects.PRIVATE,
    galleryKeyFromRel(p.preview_path),
    // local engine only — AWS albums are handled by faceAWSIndex.js before this runs
    (local) => getFaceDescriptors(local),
  );
  if (!found) return;                            // not on disk, not in R2
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
      // grouping is deferred for the same reason as the local path: it wipes
      // and rebuilds, and on AWS it also costs one API call per person each
      // time it runs
      scheduleClustering(albumId);
    } catch (e) { console.error('aws face indexing failed:', e.message); }
    return;
  }

  let photos;
  try {
    photos = await prisma.photos.findMany({
      // 🎬 photos only. A video row has a poster in preview_path, and handing
      // that to the face engine would index the same frame as if it were the
      // whole film — a face found once at second zero, and never again.
      where: { album_id: Number(albumId), face_indexed: false, kind: 'photo' },
      select: { id: true, preview_path: true },
      orderBy: { id: 'asc' },
    });
  } catch { return; }

  /* Each photograph waits for a slot in the global budget rather than the album
     taking a batch of its own. Same ceiling on the box, but albums interleave
     instead of queueing. */
  await Promise.all(photos.map(async (p) => {
    await takeLocalSlot();
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try { await indexPhoto(p, engine); return; }
        catch { if (attempt >= MAX_ATTEMPTS) { /* skip, leave for a later pass */ } }
      }
    } finally {
      freeLocalSlot();
      await new Promise(r => setTimeout(r, PAUSE_MS));   // breather, per photo
    }
  }));

  /* 🧑‍🤝‍🧑 Grouping is deferred, not skipped. If the uploader has already said
     it is finished, this was the last of the work and grouping runs now.
     Otherwise the timer waits for quiet, which is the only way to tell on an
     upload that simply stops. */
  if (uploadsDone.has(String(albumId))) {
    uploadsDone.delete(String(albumId));
    try { await clusterNow(albumId); }
    catch (e) { console.error('face clustering failed:', e.message); }
  } else {
    scheduleClustering(albumId);
  }
}

// manual full re-index (vendor/admin button) — still adaptive + throttled
export async function indexAlbumNow(albumId) {
  const where = { album_id: Number(albumId), face_indexed: false };
  const before = await prisma.photos.count({ where });
  await indexOneAlbum(albumId);
  // pressed by hand, with nothing following it — group straight away rather
  // than leaving the vendor watching an empty face bar for forty-five seconds
  try { await clusterNow(albumId); }
  catch (e) { console.error('face clustering failed:', e.message); }
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
