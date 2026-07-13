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

const ROOT = '/var/www/vowflo/storage/galleries';

// A face must be at least this confident to be clustered — weak detections
// (blurry background heads) would otherwise create junk circles.
const MIN_SCORE = 0.9;
// Two local descriptors within this euclidean distance are the same person.
// 0.5 is a well-established threshold for 128-float face descriptors.
const MATCH_DIST = 0.52;
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
 * Greedy agglomerative clustering on local descriptors.
 * Each face joins the nearest cluster within MATCH_DIST, or starts a new one.
 * Centroids are re-averaged as members join, so clusters stay centred.
 */
function clusterLocal(faces) {
  const clusters = [];
  for (const f of faces) {
    if (!Array.isArray(f.descriptor)) continue;

    let best = null;
    let bestDist = Infinity;
    for (const c of clusters) {
      const d = distance(f.descriptor, c.centroid);
      if (d < bestDist) { bestDist = d; best = c; }
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
