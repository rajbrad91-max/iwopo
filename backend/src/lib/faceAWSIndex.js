// 🧠 AWS face indexing + grouping, Collections style.
//
// Flow, mirroring the proven PerfectPoses design:
//   1. ensure the album has a Rekognition collection
//   2. IndexFaces each un-indexed photo → AWS returns a FaceId per face
//   3. store the FaceId + its bounding box (never image bytes, never crop files)
//   4. group: for each unprocessed face, SearchFaces by its id and link the
//      matches to it, so one "person" is a parent face plus its matches
//
// Grouping costs ONE AWS call per distinct person, not N² comparisons.
import fs from 'fs';
import path from 'path';
import { GALLERIES_ROOT } from '../config/paths.js';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import {
  ensureCollection, indexPhotoFaces, searchByFaceId,
  collectionIdFor, deleteFaces,
} from './faceAWS.js';
import { portraitScore } from './portraitScore.js';

const ROOT = GALLERIES_ROOT;
const MATCH_THRESHOLD = 80;   // AWS similarity %, same as PerfectPoses

/**
 * Index every un-indexed photo in an album into its Rekognition collection.
 * @returns { indexed, faces, skipped, errors }
 */
export async function indexAlbumAWS(albumId) {
  const album = await prisma.albums.findUnique({
    where: { id: Number(albumId) },
    select: { id: true, vendor_id: true, has_collection: true },
  });
  if (!album) return { indexed: 0, faces: 0, skipped: 0, errors: 0 };

  if (!album.has_collection) {
    await ensureCollection(album.id);
    await prisma.albums.update({ where: { id: album.id }, data: { has_collection: true } });
  }

  const photos = await prisma.photos.findMany({
    where: { album_id: album.id, face_indexed: false },
    select: { id: true, filename: true, preview_path: true, thumb_path: true },
    orderBy: { id: 'asc' },
  });

  let indexed = 0, faceTotal = 0, skipped = 0, errors = 0;

  for (const p of photos) {
    const rel = p.preview_path || p.thumb_path;
    const abs = rel ? path.join(ROOT, rel) : null;
    if (!abs || !fs.existsSync(abs)) { skipped++; continue; }

    try {
      const found = await indexPhotoFaces(album.id, abs, p.filename || `photo-${p.id}`);

      for (const f of found) {
        await prisma.album_faces.upsert({
          where: { album_id_rekognition_face_id: { album_id: album.id, rekognition_face_id: f.faceId } },
          update: {},                                   // already indexed — leave it
          create: {
            album_id: album.id,
            photo_id: p.id,
            vendor_id: album.vendor_id,                 // 🔒 tenancy
            rekognition_face_id: f.faceId,
            collection_id: collectionIdFor(album.id),
            // the box is all that's needed — the circle is cropped on demand
            // from the photo already on disk, so no extra image is stored
            bounding_box: f.boundingBox ?? undefined,
            confidence: f.confidence ?? undefined,
            // how good this face is AS A CIRCLE (front-facing, large, sharp).
            // The best-scoring face of a person becomes their circle.
            portrait_score: portraitScore({
              yaw: f.yaw, pitch: f.pitch,
              sharpness: f.sharpness, brightness: f.brightness,
              eyesOpen: f.eyesOpen, areaFrac: f.areaFrac,
              detScore: (f.confidence ?? 100) / 100,
            }),
          },
        });
      }

      await prisma.photos.update({
        where: { id: p.id },
        data: {
          face_indexed: true,
          face_count: found.length,
          face_engine: 'aws',
          // AWS keeps the signatures in its collection, so this column must be
          // EMPTIED — not skipped. `faces: undefined` means "leave unchanged" in
          // Prisma, which silently kept stale local descriptors on an album that
          // had previously been indexed locally.
          faces: Prisma.DbNull,
        },
      });

      indexed++;
      faceTotal += found.length;
    } catch (e) {
      errors++;
      console.error(`[faceAWSIndex] photo ${p.id}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 60));   // be gentle on the API
  }

  return { indexed, faces: faceTotal, skipped, errors };
}

/**
 * Group indexed faces into people. For each unprocessed face we ask AWS which
 * other faces in the collection match it, then point those at this one.
 * A "person" is a parent row (matched_face_id IS NULL) plus everything linked.
 */
export async function groupAlbumFacesAWS(albumId) {
  const album = await prisma.albums.findUnique({
    where: { id: Number(albumId) },
    select: { id: true },
  });
  if (!album) return { people: 0 };

  // start clean so re-running never leaves half-old groupings
  await prisma.album_faces.updateMany({
    where: { album_id: album.id },
    data: { matched_face_id: null, is_processed: false, occurrence_count: 1 },
  });

  const faces = await prisma.album_faces.findMany({
    where: { album_id: album.id },
    select: { id: true, rekognition_face_id: true, portrait_score: true },
    // 🖼️ Work through the best portraits FIRST. Whichever face is processed
    // first becomes the parent of its group, and the parent is what the client
    // sees as the circle — so starting with the most front-facing, well-lit
    // face means the circle is a proper portrait rather than an arbitrary
    // (often side-on) shot.
    orderBy: [{ portrait_score: 'desc' }, { id: 'asc' }],
  });
  const byRekId = new Map(faces.map(f => [f.rekognition_face_id, f.id]));
  const done = new Set();

  for (const face of faces) {
    if (done.has(face.rekognition_face_id)) continue;

    let similar = [];
    try {
      similar = await searchByFaceId(album.id, face.rekognition_face_id, MATCH_THRESHOLD);
    } catch (e) {
      console.error('[faceAWSGroup] search failed:', e.message);
    }

    const childIds = [];
    for (const s of similar) {
      const localId = byRekId.get(s.faceId);
      if (!localId || localId === face.id || done.has(s.faceId)) continue;
      childIds.push(localId);
      done.add(s.faceId);
    }

    if (childIds.length) {
      await prisma.album_faces.updateMany({
        where: { id: { in: childIds }, album_id: album.id },   // 🔒 tenancy on the write
        data: { matched_face_id: face.id, is_processed: true },
      });
    }
    await prisma.album_faces.updateMany({
      where: { id: face.id, album_id: album.id },              // 🔒 tenancy on the write
      data: { is_processed: true, occurrence_count: childIds.length + 1 },
    });
    done.add(face.rekognition_face_id);
  }

  const people = await prisma.album_faces.count({
    where: { album_id: album.id, matched_face_id: null },
  });
  await prisma.albums.update({ where: { id: album.id }, data: { faces_clustered: true } });
  return { people };
}

/** The circles a client sees: one row per distinct person, busiest first. */
export async function albumPeopleAWS(albumId, eventId = null) {
  const parents = await prisma.album_faces.findMany({
    where: { album_id: Number(albumId), matched_face_id: null },
    select: { id: true, occurrence_count: true },
    orderBy: [{ occurrence_count: 'desc' }, { id: 'asc' }],
  });
  if (!eventId) return parents.map(p => ({ id: p.id, count: p.occurrence_count }));

  // event-scoped: only count photos that live in this event
  const out = [];
  for (const p of parents) {
    const ids = await photoIdsForPersonAWS(albumId, p.id);
    if (!ids.length) continue;
    const n = await prisma.photos.count({
      where: { id: { in: ids }, album_id: Number(albumId), event_id: Number(eventId) },
    });
    if (n > 0) out.push({ id: p.id, count: n });
  }
  return out.sort((a, b) => b.count - a.count || a.id - b.id);
}

/** Which photos a given person appears in. */
export async function photoIdsForPersonAWS(albumId, personId) {
  const rows = await prisma.album_faces.findMany({
    where: {
      album_id: Number(albumId),
      OR: [{ id: Number(personId) }, { matched_face_id: Number(personId) }],
    },
    select: { photo_id: true },
  });
  return [...new Set(rows.map(r => r.photo_id))];
}

/** Tidy up AWS + local rows when a photo is deleted. */
export async function forgetPhotoFacesAWS(albumId, photoId) {
  const rows = await prisma.album_faces.findMany({
    where: { album_id: Number(albumId), photo_id: Number(photoId) },
    select: { rekognition_face_id: true },
  });
  if (!rows.length) return;
  // remove them from the Rekognition collection so AWS stops holding faces
  // whose photo no longer exists
  try { await deleteFaces(albumId, rows.map(r => r.rekognition_face_id)); } catch { /* best effort */ }
  await prisma.album_faces.deleteMany({ where: { album_id: Number(albumId), photo_id: Number(photoId) } });
}
