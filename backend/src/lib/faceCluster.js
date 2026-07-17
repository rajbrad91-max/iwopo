import { GALLERIES_ROOT } from '../config/paths.js';
// 🧑‍🤝‍🧑 Face clustering — group the same person across an album's photos.
//
// Runs AFTER indexing, using whatever engine the album was locked to.
//   local (vladmandic) → 128-float descriptors, compared by euclidean distance
//   aws (rekognition)  → stored face crops, compared with CompareFaces
//
// The output feeds the gallery's face circles: one cluster per person, sorted
// by how many photos they appear in.

import fs from 'fs';
import path from 'path';
import { query } from '../config/db.js';
import { findMatchesAWS } from './faceAWS.js';

const ROOT = GALLERIES_ROOT;

// A face must be at least this confident to be clustered — weak detections
// (blurry background heads) would otherwise create junk circles. 0.87 keeps most
// real faces while still dropping obvious garbage.
const MIN_SCORE = 0.87;
// Two local descriptors within this euclidean distance are the same person.
// 0.48 balances two failure modes: too high (0.52+) merges different people; too
// low (0.45) splits one person's varied angles/lighting into fragments that then
// fall below MIN_PHOTOS and vanish. Nearest-member matching (below) is what keeps
// this safe from drift, so we can afford a slightly looser distance here.
const MATCH_DIST = 0.48;
// A face box must cover at least this fraction of the image's smaller side to be
// clustered. 0.03 skips only very distant background heads — medium-distance faces
// (a guest across a room) still count, so people don't lose photos they're clearly in.
const MIN_FACE_FRAC = 0.03;
// Ignore anyone who only shows up in a single photo — usually a stranger in the
// background, not a guest worth putting on the bar.
const MIN_PHOTOS = 2;

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function meanDescriptor(list) {
  const n = list.length;
  const out = new Array(list[0].length).fill(0);
  for (const d of list) for (let i = 0; i < d.length; i++) out[i] += d[i];
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

/** Pull every usable face in the album, flattened to one row per face. */
async function collectFaces(albumId) {
  const { rows } = await query(
    `SELECT id, faces, face_engine FROM photos
     WHERE album_id=$1 AND face_indexed=true AND face_count > 0`, [albumId]);

  const faces = [];
  for (const p of rows) {
    for (const f of (p.faces || [])) {
      if ((f.score ?? 1) < MIN_SCORE) continue;
      // skip tiny faces — a box whose smaller side is under MIN_FACE_FRAC of the
      // image is a distant background head; its descriptor is too noisy to trust.
      const b = f.box || null;
      if (b) {
        const w = b.width ?? b.w ?? 0;
        const h = b.height ?? b.h ?? 0;
        if (w > 0 && h > 0) {
          const looksNormalized = w <= 1 && h <= 1;
          if (looksNormalized) {
            if (Math.min(w, h) < MIN_FACE_FRAC) continue;
          } else {
            // pixel boxes: require the face to be at least ~55px on its short side
            if (Math.min(w, h) < 55) continue;
          }
        }
      }
      faces.push({
        photo_id: p.id,
        engine: p.face_engine || 'vladmandic',
        descriptor: f.descriptor || null,
        imgB64: f.imgB64 || null,
        box: f.box || null,
        score: f.score ?? 1,
      });
    }
  }
  return faces;
}

/**
 * Greedy clustering on local descriptors, matched against each cluster's actual
 * members (not a drifting average). A face joins a cluster only if it is within
 * MATCH_DIST of that cluster's NEAREST existing member. Averaging alone let
 * clusters drift over many photos until they matched strangers; nearest-member
 * matching prevents that drift — the main cause of false face matches. The mean
 * descriptor is still kept per cluster for the "Find me" selfie search.
 */
function clusterLocal(faces) {
  const clusters = [];
  // process the most confident faces first so clusters seed on clean detections
  const ordered = [...faces].filter(f => Array.isArray(f.descriptor))
    .sort((a, b) => b.score - a.score);

  for (const f of ordered) {
    let best = null;
    let bestDist = Infinity;
    for (const c of clusters) {
      // distance to the NEAREST existing member of this cluster
      let near = Infinity;
      for (const m of c.faces) {
        const d = distance(f.descriptor, m.descriptor);
        if (d < near) near = d;
        if (near === 0) break;
      }
      if (near < bestDist) { bestDist = near; best = c; }
    }

    if (best && bestDist <= MATCH_DIST) {
      best.faces.push(f);
      best.centroid = meanDescriptor(best.faces.map(x => x.descriptor));
    } else {
      clusters.push({ centroid: f.descriptor.slice(), faces: [f] });
    }
  }
  return clusters;
}

/**
 * AWS albums store a face crop per photo rather than a comparable vector, so we
 * cluster by comparing each face against the representative of each cluster.
 */
async function clusterAWS(faces) {
  const clusters = [];
  for (const f of faces) {
    if (!f.imgB64) continue;

    let joined = false;
    for (const c of clusters) {
      const reps = [{ photo_id: 0, imgB64: c.rep.imgB64 }];
      try {
        const m = await findMatchesAWS(f.imgB64, reps, 90);
        if (m.length) { c.faces.push(f); joined = true; break; }
      } catch { /* a failed compare just means "not this cluster" */ }
    }
    if (!joined) clusters.push({ rep: f, faces: [f] });
  }
  return clusters;
}

/** Rebuild every cluster for one album. Safe to re-run. */
export async function clusterAlbum(albumId) {
  const { rows: alb } = await query('SELECT id, vendor_id FROM albums WHERE id=$1', [albumId]);
  if (!alb[0]) return { clusters: 0 };
  const vendorId = alb[0].vendor_id;

  const faces = await collectFaces(albumId);
  if (!faces.length) {
    await query('DELETE FROM face_clusters WHERE album_id=$1', [albumId]);
    await query('UPDATE albums SET faces_clustered=true WHERE id=$1', [albumId]);
    return { clusters: 0 };
  }

  const engine = faces[0].engine === 'aws' ? 'aws' : 'vladmandic';
  const groups = engine === 'aws' ? await clusterAWS(faces) : clusterLocal(faces);

  // start clean so re-running never duplicates people
  await query('DELETE FROM face_clusters WHERE album_id=$1', [albumId]);

  let saved = 0;
  for (const g of groups) {
    // one person can appear once per photo — collapse duplicates
    const photoIds = [...new Set(g.faces.map(f => f.photo_id))];
    if (photoIds.length < MIN_PHOTOS) continue;

    // the circle uses the clearest face we found for this person
    const cover = g.faces.reduce((a, b) => (b.score > a.score ? b : a), g.faces[0]);

    const { rows } = await query(
      `INSERT INTO face_clusters
         (album_id, vendor_id, engine, centroid, cover_photo_id, cover_box, photo_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [albumId, vendorId, engine,
       g.centroid ? JSON.stringify(g.centroid) : null,
       cover.photo_id,
       cover.box ? JSON.stringify(cover.box) : null,
       photoIds.length]);

    const clusterId = rows[0].id;
    for (const pid of photoIds) {
      await query(
        'INSERT INTO photo_faces (cluster_id, photo_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [clusterId, pid]);
    }
    saved++;
  }

  await query('UPDATE albums SET faces_clustered=true WHERE id=$1', [albumId]);
  return { clusters: saved, faces: faces.length, engine };
}

/** The face circles for an album, biggest group first. */
export async function albumClusters(albumId) {
  const { rows } = await query(
    `SELECT c.id, c.photo_count, c.cover_photo_id, c.cover_box
     FROM face_clusters c
     WHERE c.album_id=$1
     ORDER BY c.photo_count DESC, c.id ASC`, [albumId]);
  return rows;
}

/** Which photos a given person appears in. */
export async function clusterPhotoIds(albumId, clusterId) {
  const { rows } = await query(
    `SELECT pf.photo_id
     FROM photo_faces pf
     JOIN face_clusters c ON c.id = pf.cluster_id
     WHERE c.album_id=$1 AND c.id=$2`, [albumId, clusterId]);
  return rows.map(r => r.photo_id);
}
