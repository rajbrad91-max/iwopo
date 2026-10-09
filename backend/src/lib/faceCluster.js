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
/* 👤 One-photo people — LIVE SHOOT ONLY.
   Tried for galleries on 2026-10-09 and reverted the same day at Raj's call
   ("I need quality"): on a 782-photo wedding it added 33 circles of one, most
   of them blurred, half-hidden behind a hand, cut off at the frame edge, or a
   second circle for someone who already had one. In a gallery a circle is a
   promise of "this person's photos"; one stray frame does not keep it, and
   Find me still finds anyone who appears once.
   A live shoot is different: no circles are shown there, but a guest's pass
   is made of circle ids, so a guest seen once still needs one to open their
   photo. With no second photo to confirm it, that face must be clear on its
   own: big enough, a confident detection, and looking at the camera. */
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
const THREE_MIN_BEST = 0.60;          // see the 🧱 rule in clusterAlbum

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
    select: { id: true, vendor_id: true, kind: true },
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
    if (photoIds.length === 1 && !(alb.kind === 'liveshoot' && clearSingle(g.faces[0]))) continue;   // 👤 see SINGLE_MIN_*
    if (photoIds.length === 2 && !pairHolds(g.faces)) continue;        // 👯 see PAIR_TIGHT
    /* 🧱 Three photos and not one decent face among them is junk that found
       itself: album 18 grouped a mehndi hand, a gold ribbon and the back of a
       jewelled head (best score 0.57). Measured across all 27 three-photo
       circles on staging: the 26 real ones have a best face of 0.68–1.00
       (only one under 0.82, a real man in album 43). The margin is thin, so
       this only catches junk that is weak in every one of its photos. */
    if (photoIds.length === 3 && Math.max(...g.faces.map(f => f.score ?? 0)) < THREE_MIN_BEST) continue;

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
