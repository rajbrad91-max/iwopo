// 🧠 AWS Rekognition face engine — matches faceEngine.js interface (swappable)
import { RekognitionClient, DetectFacesCommand, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import fs from 'fs';
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

// Detect faces → return face "descriptors". AWS doesn't give raw vectors via
// DetectFaces, so we store the JPEG bytes reference for CompareFaces at search.
// We return bounding boxes + confidence so the same DB shape is kept.
export async function getFaceDescriptorsAWS(imagePath) {
  const jpeg = await sharp(imagePath).jpeg().toBuffer();
  const rek = await client();
  const out = await rek.send(new DetectFacesCommand({
    Image: { Bytes: jpeg },
    Attributes: ['DEFAULT'],
  }));
  const faces = out.FaceDetails || [];
  // store the image bytes (base64) so we can CompareFaces later
  return faces.map(f => ({
    aws: true,
    box: f.BoundingBox,
    score: f.Confidence,
    imgB64: jpeg.toString('base64'),   // needed for compare
  }));
}

// Compare a selfie against candidate photos using AWS CompareFaces.
// candidates: [{ photo_id, imgB64 }]
// Accepts EITHER a file path (selfie search from an upload) OR a base64 JPEG
// string (cluster-vs-cluster comparison, where the image is already in memory).
// sharp() cannot read a base64 string, so it must be decoded to a Buffer first —
// passing the raw string made every comparison throw "unsupported image format",
// which clusterAWS() swallowed, so no two faces ever matched and AWS clustering
// silently produced zero circles.
//
// NOTE: base64 legitimately contains '/' and '+', so a slash is NOT a reliable
// "this is a path" signal. Detect a real path instead: short, and pointing at a
// file that exists on disk.
function toImageInput(src) {
  if (Buffer.isBuffer(src)) return src;
  if (typeof src !== 'string') return src;
  const looksLikePath = src.length < 4096 && !src.includes('\n') && fs.existsSync(src);
  return looksLikePath ? src : Buffer.from(src, 'base64');
}

export async function findMatchesAWS(selfieSrc, candidates, threshold = 90) {
  const selfie = await sharp(toImageInput(selfieSrc)).jpeg().toBuffer();
  const rek = await client();
  const matched = [];
  for (const c of candidates) {
    try {
      const res = await rek.send(new CompareFacesCommand({
        SourceImage: { Bytes: selfie },
        TargetImage: { Bytes: Buffer.from(c.imgB64, 'base64') },
        SimilarityThreshold: threshold,
      }));
      if ((res.FaceMatches || []).length > 0) {
        const best = Math.max(...res.FaceMatches.map(m => m.Similarity));
        matched.push({ photo_id: c.photo_id, similarity: best });
      }
    } catch (e) { /* skip */ }
  }
  return matched.sort((a, b) => b.similarity - a.similarity);
}
