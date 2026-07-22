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
  if (!faces.length) return [];

  // AWS DetectFaces gives no comparable vector, so we must keep pixels for the
  // later CompareFaces call. Keep only a small CROP of each face — the previous
  // version stored the whole full-size photo once per face, so a 3-face photo
  // held three copies of the same image (~500-900 KB each). On a real wedding
  // album that ran to hundreds of MB and was enough to break the vendor panel.
  const meta = await sharp(jpeg).metadata();
  const W = meta.width || 0, H = meta.height || 0;

  const crops = [];
  for (const f of faces) {
    const b = f.BoundingBox || {};
    let img = null;
    try {
      // BoundingBox is fractional (0-1). Pad it so CompareFaces still sees a
      // whole head rather than a tight rectangle, then clamp to the image.
      const pad = 0.45;
      const bw = (b.Width || 0) * W, bh = (b.Height || 0) * H;
      const cx = ((b.Left || 0) + (b.Width || 0) / 2) * W;
      const cy = ((b.Top || 0) + (b.Height || 0) / 2) * H;
      const side = Math.max(bw, bh) * (1 + pad * 2);
      let left = Math.round(cx - side / 2);
      let top = Math.round(cy - side / 2);
      let size = Math.round(side);
      left = Math.max(0, Math.min(left, Math.max(0, W - 1)));
      top = Math.max(0, Math.min(top, Math.max(0, H - 1)));
      size = Math.max(48, Math.min(size, W - left, H - top));

      img = await sharp(jpeg)
        .extract({ left, top, width: size, height: size })
        .resize(300, 300, { fit: 'cover' })     // plenty for Rekognition
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      img = null;   // crop failed (odd geometry) — fall through below
    }
    crops.push(img);
  }

  return faces.map((f, i) => ({
    aws: true,
    box: f.BoundingBox,
    score: f.Confidence,
    // ~10-20 KB per face instead of ~500-900 KB
    imgB64: crops[i] ? crops[i].toString('base64') : null,
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
