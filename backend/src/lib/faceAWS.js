// 🧠 AWS Rekognition face engine — matches faceEngine.js interface (swappable)
import { RekognitionClient, DetectFacesCommand, CompareFacesCommand } from '@aws-sdk/client-rekognition';
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
export async function findMatchesAWS(selfiePath, candidates, threshold = 90) {
  const selfie = await sharp(selfiePath).jpeg().toBuffer();
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
