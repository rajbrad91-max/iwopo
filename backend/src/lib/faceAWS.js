// 🧠 AWS Rekognition — Collections API.
//
// AWS keeps the face signatures in a per-album collection on THEIR side and
// hands back a short FaceId. We store only that id, so nothing image-shaped
// ever lands in the database.
//
// This replaces an earlier DetectFaces + CompareFaces implementation which had
// to keep pixels locally for every future comparison (~700 KB per face, and a
// full N² of AWS calls to group an album). Same design PerfectPoses runs in
// production.
import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { getSetting } from './settings.js';

async function client() {
  return new RekognitionClient({
    region: await getSetting('aws_region', 'us-east-1'),
    credentials: {
      accessKeyId: await getSetting('aws_access_key', ''),
      secretAccessKey: await getSetting('aws_secret_key', ''),
    },
  });
}

/** Collection name for an album. Rekognition allows [a-zA-Z0-9_.\-] only. */
export function collectionIdFor(albumId) {
  return `iwopo-album-${Number(albumId)}`;
}

/** Rekognition only accepts JPEG/PNG bytes — our tiers are webp. */
async function toJpegBytes(imagePath) {
  return sharp(imagePath).jpeg({ quality: 90 }).toBuffer();
}

/** Create the album's collection. Safe to call repeatedly. */
export async function ensureCollection(albumId) {
  const rek = await client();
  const CollectionId = collectionIdFor(albumId);
  try {
    await rek.send(new CreateCollectionCommand({ CollectionId }));
    return true;
  } catch (e) {
    // already there → that's success, not an error
    if (e.name === 'ResourceAlreadyExistsException') return true;
    throw e;
  }
}

/** Remove the collection and everything AWS holds for this album. */
export async function deleteCollection(albumId) {
  const rek = await client();
  try {
    await rek.send(new DeleteCollectionCommand({ CollectionId: collectionIdFor(albumId) }));
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }
}

/**
 * Index one photo into the album's collection.
 * @returns [{ faceId, boundingBox, confidence }]
 */
export async function indexPhotoFaces(albumId, imagePath, externalImageId) {
  const rek = await client();
  const Bytes = await toJpegBytes(imagePath);
  const res = await rek.send(new IndexFacesCommand({
    CollectionId: collectionIdFor(albumId),
    Image: { Bytes },
    ExternalImageId: String(externalImageId).replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 255),
    // ALL (rather than DEFAULT) also returns pose, quality and eyes-open, which
    // is what lets the gallery choose a front-facing face for the circle instead
    // of an arbitrary one. Same API call, so no extra cost.
    DetectionAttributes: ['ALL'],
    MaxFaces: 20,
    QualityFilter: 'AUTO',        // drops blurry / tiny faces before they cost anything
  }));
  return (res.FaceRecords || []).map(r => {
    const box = r.Face?.BoundingBox || null;
    const d = r.FaceDetail || {};
    return {
      faceId: r.Face?.FaceId,
      boundingBox: box,
      confidence: r.Face?.Confidence ?? null,
      // portrait-quality inputs (see lib/portraitScore.js)
      yaw: d.Pose?.Yaw ?? null,
      pitch: d.Pose?.Pitch ?? null,
      sharpness: d.Quality?.Sharpness ?? null,
      brightness: d.Quality?.Brightness ?? null,
      eyesOpen: d.EyesOpen?.Value ?? null,
      areaFrac: box ? (box.Width || 0) * (box.Height || 0) : null,
    };
  }).filter(f => f.faceId);
}

/** Everyone in the collection who looks like this already-indexed face. */
export async function searchByFaceId(albumId, faceId, threshold = 80) {
  const rek = await client();
  try {
    const res = await rek.send(new SearchFacesCommand({
      CollectionId: collectionIdFor(albumId),
      FaceId: faceId,
      FaceMatchThreshold: threshold,
      MaxFaces: 100,
    }));
    return (res.FaceMatches || []).map(m => ({
      faceId: m.Face?.FaceId,
      similarity: m.Similarity,
    })).filter(m => m.faceId);
  } catch (e) {
    if (e.name === 'InvalidParameterException') return [];
    throw e;
  }
}

/** Selfie search — match an uploaded photo against the album's collection. */
export async function searchBySelfie(albumId, imagePath, threshold = 80) {
  const rek = await client();
  const Bytes = await toJpegBytes(imagePath);
  try {
    const res = await rek.send(new SearchFacesByImageCommand({
      CollectionId: collectionIdFor(albumId),
      Image: { Bytes },
      FaceMatchThreshold: threshold,
      MaxFaces: 100,
    }));
    return (res.FaceMatches || []).map(m => ({
      faceId: m.Face?.FaceId,
      similarity: m.Similarity,
    })).filter(m => m.faceId);
  } catch (e) {
    // AWS raises this when the selfie simply has no detectable face
    if (e.name === 'InvalidParameterException') return [];
    throw e;
  }
}

/** Drop specific faces from the collection (e.g. a deleted photo). */
export async function deleteFaces(albumId, faceIds) {
  if (!faceIds?.length) return;
  const rek = await client();
  try {
    await rek.send(new DeleteFacesCommand({
      CollectionId: collectionIdFor(albumId),
      FaceIds: faceIds,
    }));
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }
}
