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
import { portraitScore, isUsableFace, boxSize, presentable, coverReady } from './portraitScore.js';
import { DIST, DESCRIPTOR_LENGTH, faceDistance } from './faceEngine.js';

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
/* 📏 Every "same person?" distance comes from the engine that made the
   fingerprints (DIST in faceEngine.js, AuraFace since 2026-10-09). The
   numbers that used to live here — 0.48, 0.45, 0.42, 0.40 — belonged to the
   old face-api fingerprint (removed) and mean nothing on AuraFace's scale. */
const MATCH_DIST = DIST.match;
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
// on YuNet's scale (boxes 13.5% smaller, eye spacing re-calibrated 2026-10-09): 70 → 61, 0.40 → 0.42
const SINGLE_MIN_PX = 61;
const SINGLE_MIN_SCORE = 0.55;
const SINGLE_MIN_EYE_SEP = 0.42;
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
   confident detections. Measured 2026-10-09 on the parked engine: real pairs
   sat close, or loosely close with both faces scoring ≥ 0.93; the one wrong
   pair — the bride and a cardboard photo-booth cut-out — was loose with the
   cut-out scoring 0.54. A loose match to a weak detection is exactly what a
   painted face looks like; the same reasoning holds on AuraFace's scale. */
const PAIR_TIGHT = DIST.pairTight;
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

// one definition of "how alike" for the whole app — the engine's
const distance = faceDistance;
/** A fingerprint scaled back to unit length (an average of unit vectors is shorter). */
function unit(v) {
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
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
    select: { id: true, faces: true, face_engine: true, event_id: true },
  });

  const faces = [];
  for (const p of rows) {
    (p.faces || []).forEach((f, k) => {
      if ((f.score ?? 1) < MIN_SCORE) return;
      /* 👤 Size AND "is it really a face" in one place — isUsableFace().
         ⚠️ The size check that used to sit here read box.width, but stored
         boxes are saved as _width, so it never ran: 32-pixel background heads
         were clustered (album 18's 6th circle had two). */
      if (!isUsableFace(f)) return;
      faces.push({
        photo_id: p.id,
        // which face in that photo — kept so a circle names FACES, not whole
        // photographs (a live-shoot pass must not include everyone stood
        // beside a guest in a group shot)
        face_index: k,
        event_id: p.event_id ?? null,      // which tab — circles never cross tabs
        engine: p.face_engine || 'vladmandic',
        // only the current engine's fingerprints — a parked one cannot be compared
        descriptor: f.descriptor?.length === DESCRIPTOR_LENGTH ? f.descriptor : null,
        box: f.box || null,
        score: f.score ?? 1,
        eyeSep: f.eyeSep, noseBetween: f.noseBetween, blur: f.blur,
        eyeOpen: f.eyeOpen, roll: f.roll,
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
 * the threshold of that cluster's NEAREST existing member. Averaging alone let
 * clusters drift over many photos until they matched strangers; nearest-member
 * matching prevents that drift. The mean descriptor is still kept per cluster
 * for the "Find me" selfie search and for choosing a typical cover.
 *
 * 🧱 GALLERIES group in two passes (Raj, 2026-10-09: "more precise").
 * Poor faces — side-on, soft, half-hidden — have fingerprints that resemble
 * EACH OTHER more than they resemble their owners. Allowed to build circles,
 * they chained different people together: GreatTest's 10th-biggest circle
 * held men, women, a bowl and an ornament. So:
 *   1. only CLEAR faces (clearFace) build circles, at SEED_DIST;
 *   2. a poor face may only JOIN a circle, and only when it is within
 *      JOIN_DIST of one of that person's clear faces — otherwise it is left
 *      out rather than allowed to bridge two people.
 * Measured on GreatTest (3,035 faces) with the parked engine: circles whose
 * members spread like a mix of people went from 17 to none, checked against
 * contact sheets. The rule is kept with AuraFace's own distances. A live shoot keeps the single pass — no circles are shown
 * there, and a guest's photo must stay reachable even from a poor face.
 */
const SEED_DIST = DIST.seed;
const JOIN_DIST = DIST.join;
function clearFace(f) {
  const { w, h } = boxSize(f.box);
  // on YuNet's scale (2026-10-09): 45px → 39, eye spacing 0.33 → 0.36 — the same share of faces
  return (w <= 1 || Math.min(w, h) >= 39)
    && (typeof f.blur !== 'number' || f.blur <= 0.55)
    && (typeof f.eyeSep !== 'number' || f.eyeSep >= 0.36)
    && Math.abs(f.yaw ?? 0) <= 35;
}

/** Nearest member of a cluster, optionally among only some of its faces. */
function nearest(f, members) {
  let near = Infinity;
  for (const m of members) {
    const d = distance(f.descriptor, m.descriptor);
    if (d < near) near = d;
    if (near === 0) break;
  }
  return near;
}

function clusterLocal(faces, { twoPass = false } = {}) {
  const clusters = [];
  // the most confident faces first, so clusters seed on clean detections
  const ordered = [...faces].filter(f => Array.isArray(f.descriptor))
    .sort((a, b) => b.score - a.score);
  const builders = twoPass ? ordered.filter(clearFace) : ordered;
  const limit = twoPass ? SEED_DIST : MATCH_DIST;

  for (const f of builders) {
    let best = null, bestDist = Infinity;
    for (const c of clusters) {
      const near = nearest(f, c.faces);
      if (near < bestDist) { bestDist = near; best = c; }
    }
    if (best && bestDist <= limit) {
      best.faces.push(f);
      best.centroid = meanDescriptor(best.faces.map(x => x.descriptor));
    } else {
      clusters.push({ centroid: f.descriptor.slice(), faces: [f] });
    }
  }

  if (twoPass) {
    // pass 2: poor faces join a person's CLEAR faces, or are left out
    const clearOf = new Map(clusters.map(c => [c, [...c.faces]]));
    for (const f of ordered.filter(x => !clearFace(x))) {
      let best = null, bestDist = Infinity;
      for (const c of clusters) {
        const near = nearest(f, clearOf.get(c));
        if (near < bestDist) { bestDist = near; best = c; }
      }
      if (best && bestDist <= JOIN_DIST) best.faces.push(f);
    }
    for (const c of clusters) c.centroid = meanDescriptor(c.faces.map(x => x.descriptor));
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
  /* 🗂️ Each tab is its own set of people (Raj, 2026-10-09: "every tab is
     like a separate folder for face recognition"). Grouped across the whole
     album, a circle shown on the Marco JAggo tab could carry its cover — and
     its count — from Jaggo-2. So faces are grouped tab by tab, and a circle
     belongs to exactly one tab. An album without tabs is one group; a live
     shoot stays whole, because a guest's pass must reach every photo of them. */
  const byTab = new Map();
  for (const f of faces) {
    const tab = alb.kind === 'liveshoot' ? null : f.event_id;
    if (!byTab.has(tab)) byTab.set(tab, []);
    byTab.get(tab).push(f);
  }
  const groups = [];
  for (const [tab, list] of byTab) {
    for (const g of clusterLocal(list, { twoPass: alb.kind !== 'liveshoot' })) {
      // ⚖️ the cover is judged against an average where clear faces count more
      groups.push({ ...g, event_id: tab, centroid: alb.kind === 'liveshoot' ? g.centroid : personAverage(g.faces) });
    }
  }

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

    /* 🖼️ A gallery circle needs at least ONE face good enough to show —
       clear, big enough, looking roughly at the camera (presentable() in
       portraitScore.js). A person who is small, soft or turned away in every
       photo is a background guest, and their circle is what Raj saw as
       "blurry, side, from the back". A live shoot keeps every circle: none
       are shown there, and a guest's pass is built from them. */
    const good = g.faces.filter(presentable);
    if (alb.kind !== 'liveshoot' && !good.length) continue;

    // 🖼️ the circle uses the most PORTRAIT-LIKE face of this person — chosen
    // among the presentable ones when there are any. Detection score answers
    // "is this a face?", which a sharp side-profile can win over a softer
    // front-facing shot; portraitScore weighs sharpness, size and facing.
    /* 👤 …and the most TYPICAL of them. A face half-covered by a hand, or an
       ornament that slipped into the circle, can be sharp, big and "facing
       the camera" — but its fingerprint sits far from this person's average
       one. GreatTest's bride had a mehndi hand over her face as the cover of
       257 photos. The less like the person's average a face is, the less it
       may stand for them (DIST.typicalFull … DIST.typicalNone). */
    // 👁️ eyes open, head up and level first (coverReady); then any presentable face
    const ready = good.filter(coverReady);
    const pool = ready.length ? ready : good.length ? good : g.faces;
    const typical = (f) => (g.centroid && f.descriptor
      ? Math.max(0, Math.min(1, 1 - (distance(f.descriptor, unit(g.centroid)) - DIST.typicalFull) / (DIST.typicalNone - DIST.typicalFull))) : 1);
    const coverScore = (f) => portraitScore(f) * (0.4 + 0.6 * typical(f));
    const cover = pool.reduce((best, f) => (coverScore(f) > coverScore(best) ? f : best), pool[0]);

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
        event_id: g.event_id ?? null,
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

/**
 * ⚖️ A person's average face, with CLEAR faces counting more. A soft or
 * turned face still says something about who someone is, but less — so it
 * cannot drag the average (used to merge circles and to pick a typical
 * cover) towards a blur.
 */
function personAverage(faces) {
  const dims = faces[0].descriptor.length;
  const out = new Array(dims).fill(0);
  let total = 0;
  for (const f of faces) {
    const w = clearFace(f) ? 1 : 0.3;
    total += w;
    for (let i = 0; i < dims; i++) out[i] += f.descriptor[i] * w;
  }
  return out.map(v => v / (total || 1));
}

/* 🔗 Merging whole circles by their average faces was tried on 2026-10-09
   and removed the same day. On GreatTest the most alike pairs of circles were
   mostly DIFFERENT people — relatives and similar-looking guests reached 0.55,
   the same level as one person across very different photos — so merging
   would mix family members, the worst mistake a circle can make. A person
   split across two circles is fixed by hand instead. */

/** The face circles for an album — or for one of its tabs — biggest group first. */
export async function albumClusters(albumId, eventId = null) {
  return prisma.face_clusters.findMany({
    where: { album_id: Number(albumId), ...(eventId ? { event_id: Number(eventId) } : {}) },
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
