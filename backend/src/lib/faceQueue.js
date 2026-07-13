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
import { query } from '../config/db.js';
import { getFaceDescriptors } from './faceEngine.js';
import { getFaceDescriptorsAWS } from './faceAWS.js';
import { getSetting } from './settings.js';
import { clusterAlbum } from './faceCluster.js';

const ROOT = '/var/www/vowflo/storage/galleries';

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
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM photos WHERE face_indexed=false');
    return rows[0]?.n || 0;
  } catch { return 0; }
}

// current 1-minute load average (trailing, but fine for a gentle 1↔2 choice)
function currentLoad() { return os.loadavg()[0]; }

// how many local workers are we allowed to run right now?
function allowedConcurrency() {
  return currentLoad() < LOAD_LINE ? MAX_CONCURRENCY : 1;
}

// decide the engine for a WHOLE album (locked once, never mixed)
async function pickEngineForAlbum() {
  let mode;
  try { mode = await getSetting('aws_mode', 'aws_off'); } catch { mode = 'aws_off'; }
  if (mode === 'aws_on') return 'aws';
  if (mode === 'aws_off') return 'local';
  // safety_net: overflow to AWS only when backlog is deep
  const depth = await backlogDepth();
  return depth > BACKLOG_AWS_LINE ? 'aws' : 'local';
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
  const found = engine === 'aws'
    ? await getFaceDescriptorsAWS(full)
    : await getFaceDescriptors(full);
  await query('UPDATE photos SET faces=$1, face_count=$2, face_indexed=true, face_engine=$3 WHERE id=$4',
    [JSON.stringify(found), found.length, engine, p.id]);
}

async function indexOneAlbum(albumId) {
  const engine = await pickEngineForAlbum();   // 🔒 locked for this whole album

  let photos;
  try {
    ({ rows: photos } = await query(
      'SELECT id, preview_path FROM photos WHERE album_id=$1 AND face_indexed=false ORDER BY id', [albumId]));
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
  const before = await query('SELECT COUNT(*)::int AS n FROM photos WHERE album_id=$1 AND face_indexed=false', [albumId]);
  await indexOneAlbum(albumId);
  const after = await query('SELECT COUNT(*)::int AS n FROM photos WHERE album_id=$1 AND face_indexed=false', [albumId]);
  return { requested: before.rows[0]?.n || 0, remaining: after.rows[0]?.n || 0 };
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
