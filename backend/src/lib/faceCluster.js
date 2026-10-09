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
import prisma from '../config/prisma.js';
import { portraitScore, isUsableFace, boxSize } from './portraitScore.js';

const ROOT = GALLERIES_ROOT;

// A face must be at least this confident to be clustered — weak detections
// (blurry background heads) would otherwise create junk circles.
//
// This MUST stay at or below faceEngine.js's MIN_CONFIDENCE (0.4), or the
// detector's work is thrown away here. It was 0.87 while the detector emitted
// scores as low as 0.41, so genuine faces AWS finds easily — someone turned
// away, or further from the camera — were detected and then silently dropped
// at this stage. Measured on a real wedding set, 0.87 gave 4 people where AWS
// gave 6; 0.40 gives 6, matching AWS exactly.
//
// Junk is filtered by isUsableFace() — size, plus whether the eyes and nose
// are those of a real face — and by the evidence a circle needs (clearSingle /
// pairHolds below), rather than by confidence alone.
const MIN_SCORE = 0.40;
// Two local descriptors within this euclidean distance are the same person.
// 0.48 balances two failure modes: too high (0.52+) merges different people; too
// low (0.45) splits one person's varied angles/lighting into fragments.
// Nearest-member matching (below) is what keeps
// this safe from drift, so we can afford a slightly looser distance here.
const MATCH_DIST = 0.48;
/* 👤 Somebody seen in only ONE photograph still gets a circle — Raj,
   2026-10-09: "one person who just quickly came in the event should not be
   missed". With no second photo to confirm it, that one face has to be clear
   on its own: big enough, a confident detection, and looking at the camera.
   Measured on album 18's eight one-photo faces: this keeps the three real
   people (man in black, girls in green and pink) and leaves out a back of a
   head with jewellery (eyeSep 0.32), a hand with mehndi (59px, score 0.57)
   and two three-quarter shots of the bride who already has her own circle. */
const SINGLE_MIN_PX = 70;
const SINGLE_MIN_SCORE = 0.55;
const SINGLE_MIN_EYE_SEP = 0.40;
const SINGLE_NOSE = [0.30, 0.70];

/** Is one face alone clear enough to be shown as a person? */
function clearSingle(f) {
  const { w, h } = boxSize(f.box);
  return Math.min(w, h) >= SINGLE_MIN_PX
    && (f.score ?? 0) >= SINGLE_MIN_SCORE
    && typeof f.eyeSep === 'number' && f.eyeSep >= SINGLE_MIN_EYE_SEP
    && f.noseBetween >= SINGLE_NOSE[0] && f.noseBetween <= SINGLE_NOSE[1];
}
/* 👯 A circle of only TWO photos is the weakest evidence there is: one match.
   It stands if the two faces are clearly close (≤ PAIR_TIGHT), or if both are
   confident detections. Measured 2026-10-09 across every 2–3 photo circle on
   staging: real pairs sat at 0.14–0.34, or at 0.46 with both faces ≥ 0.93;
   the one wrong pair — the bride and a cardboard photo-booth cut-out — was
   0.457 apart with the cut-out scoring 0.54. A loose match to a weak
   detection is exactly what a painted face looks like. */
const PAIR_TIGHT = 0.40;
const PAIR_CONF = 0.80;

/** Does a two-photo circle have enough evidence to be shown? */
function pairHolds(faces) {
  const [a, b] = [...new Set(faces.map(f => f.photo_id))];
  let best = null;
  for (const x of faces.filter(f => f.photo_id === a)) {
    for (const y of faces.filter(f => f.photo_id === b)) {
      const d = distance(x.descriptor, y.descriptor);
      if (!best || d < best.d) best = { d, minScore: Math.min(x.score, y.score) };
    }
  }
  return !!best && (best.d <= PAIR_TIGHT || best.minScore >= PAIR_CONF);
}

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
  const rows = await prisma.photos.findMany({
    where: { album_id: Number(albumId), face_indexed: true, face_count: { gt: 0 } },
    select: { id: true, faces: true, face_engine: true },
  });

  const faces = [];
  for (const p of rows) {
    (p.faces || []).forEach((f, k) => {
      if ((f.score ?? 1) < MIN_SCORE) return;
      /* 👤 Size AND "is it really a face" in one place — isUsableFace().
         ⚠️ The size check that used to sit here read box.width, but face-api
         saves its box as _width, so it never ran: 32-pixel background heads
         were clustered (album 18's 6th circle had two). */
      if (!isUsableFace(f)) return;
      faces.push({
        photo_id: p.id,
        // which face in that photo — kept so a circle names FACES, not whole
        // photographs (a live-shoot pass must not include everyone stood
        // beside a guest in a group shot)
        face_index: k,
        engine: p.face_engine || 'vladmandic',
        descriptor: f.descriptor || null,
        box: f.box || null,
        score: f.score ?? 1,
        eyeSep: f.eyeSep, noseBetween: f.noseBetween,
        // pose + size, used to pick the best portrait for the circle
        yaw: f.yaw, pitch: f.pitch, areaFrac: f.areaFrac, detScore: f.score,
      });
    });
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

/** Rebuild every cluster for one album. Safe to re-run.
 *  LOCAL ENGINE ONLY — AWS albums are grouped by faceAWSIndex.js using
 *  Rekognition Collections, which keeps the signatures on AWS's side. */
export async function clusterAlbum(albumId) {
  const alb = await prisma.albums.findUnique({
    where: { id: Number(albumId) },
    select: { id: true, vendor_id: true },
  });
  if (!alb) return { clusters: 0 };
  const vendorId = alb.vendor_id;

  const faces = await collectFaces(albumId);
  if (!faces.length) {
    await prisma.face_clusters.deleteMany({ where: { album_id: Number(albumId) } });
    await prisma.albums.update({ where: { id: Number(albumId) }, data: { faces_clustered: true } });
    return { clusters: 0 };
  }

  const engine = 'vladmandic';
  const groups = clusterLocal(faces);

  /* 🔁 Keep each person's circle id across rebuilds.
     Grouping wipes and rebuilds every circle, and a fresh row means a fresh id.
     A Live Shoot guest's pass names circle ids — so every upload batch during
     an event used to retire every pass and a guest's photographs vanished.
     Each new group takes the old id that most of its faces had, when that id
     is still free. Only first-time faces get a new id. */
  const old = await prisma.photo_faces.findMany({
    where: { face_clusters: { album_id: Number(albumId) }, NOT: { face_index: null } },
    select: { cluster_id: true, photo_id: true, face_index: true },
  });
  const oldIdOf = new Map(old.map(o => [`${o.photo_id}:${o.face_index}`, o.cluster_id]));
  const usedIds = new Set();

  // start clean so re-running never duplicates people
  await prisma.face_clusters.deleteMany({ where: { album_id: Number(albumId) } });

  let saved = 0;
  for (const g of groups) {
    // one person can appear once per photo — collapse duplicates
    const photoIds = [...new Set(g.faces.map(f => f.photo_id))];
    if (photoIds.length === 1 && !clearSingle(g.faces[0])) continue;   // 👤 see SINGLE_MIN_*
    if (photoIds.length === 2 && !pairHolds(g.faces)) continue;        // 👯 see PAIR_TIGHT

    // 🖼️ the circle uses the most PORTRAIT-LIKE face of this person, not simply
    // the highest detection score. Detection score answers "is this a face?",
    // which a sharp side-profile can win over a softer front-facing shot.
    const cover = g.faces.reduce((best, f) =>
      portraitScore(f) > portraitScore(best) ? f : best, g.faces[0]);

    const votes = new Map();
    for (const f of g.faces) {
      const id = oldIdOf.get(`${f.photo_id}:${f.face_index}`);
      if (id && !usedIds.has(id)) votes.set(id, (votes.get(id) || 0) + 1);
    }
    const keepId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const created = await prisma.face_clusters.create({
      data: {
        ...(keepId ? { id: keepId } : {}),
        album_id: Number(albumId), vendor_id: vendorId, engine,
        centroid: g.centroid ?? null,        // Json columns — no manual stringify
        cover_photo_id: cover.photo_id,
        cover_box: cover.box ?? null,
        photo_count: photoIds.length,
      },
      select: { id: true },
    });
    usedIds.add(created.id);

    // one link per photo, naming WHICH face in it is this person
    const firstFace = new Map();
    for (const f of g.faces) if (!firstFace.has(f.photo_id)) firstFace.set(f.photo_id, f.face_index);
    await prisma.photo_faces.createMany({
      data: photoIds.map(pid => ({ cluster_id: created.id, photo_id: pid, face_index: firstFace.get(pid) })),
      skipDuplicates: true,                  // ON CONFLICT DO NOTHING
    });
    saved++;
  }

  await prisma.albums.update({ where: { id: Number(albumId) }, data: { faces_clustered: true } });
  return { clusters: saved, faces: faces.length, engine };
}

/** The face circles for an album, biggest group first. */
export async function albumClusters(albumId) {
  return prisma.face_clusters.findMany({
    where: { album_id: Number(albumId) },
    select: { id: true, photo_count: true, cover_photo_id: true, cover_box: true },
    orderBy: [{ photo_count: 'desc' }, { id: 'asc' }],
  });
}

/** Which photos a given person appears in. */
export async function clusterPhotoIds(albumId, clusterId) {
  const rows = await prisma.photo_faces.findMany({
    where: {
      cluster_id: Number(clusterId),
      face_clusters: { album_id: Number(albumId) },   // 🔒 cluster must be in THIS album
    },
    select: { photo_id: true },
  });
  return rows.map(r => r.photo_id);
}
