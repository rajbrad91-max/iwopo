// 🧠 Face engine — @vladmandic/face-api (swappable; AWS can replace later)
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { poseFromLandmarks } from './portraitScore.js';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(__dirname, '..', '..', 'models');

// Detector confidence floor. face-api's default is 0.5, which was dropping
// genuine faces that AWS Rekognition picked up — typically someone turned
// slightly away or further from the camera. Measured on a real wedding set:
//   0.5 (default) → 14 faces, 4 people
//   0.4           → 15 faces, 6 people   ← matches AWS exactly
//   0.3 / 0.2     → identical to 0.4, so 0.4 is not a knife-edge value
// A missed face is worse than it sounds: it can also be the only link between
// two photos of the same person, so one miss can lose a whole face circle.
const MIN_CONFIDENCE = 0.4;
const MAX_RESULTS = 100;   // a big group shot can legitimately have many faces

let ready = false;
async function init() {
  if (ready) return;
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
  ready = true;
}

function detectorOptions() {
  return new faceapi.SsdMobilenetv1Options({
    minConfidence: MIN_CONFIDENCE,
    maxResults: MAX_RESULTS,
  });
}

// Get all face descriptors (128-float vectors) from an image file
export async function getFaceDescriptors(imagePath) {
  await init();
  // canvas can't read webp → decode to JPEG buffer with sharp first
  const jpegBuf = await sharp(imagePath).jpeg().toBuffer();
  const img = await canvas.loadImage(jpegBuf);
  const results = await faceapi
    .detectAllFaces(img, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  const imgArea = (img.width || 1) * (img.height || 1);

  return results.map(r => {
    // landmarks are computed anyway for the descriptor — use them to work out
    // which way the head is turned, so the gallery can pick a front-facing
    // face for the circle instead of whichever scored highest.
    const { yaw, pitch } = poseFromLandmarks(r.landmarks);
    const b = r.detection.box;
    return {
      descriptor: Array.from(r.descriptor),   // 128 floats → JSON-safe
      box: b,
      score: r.detection.score,
      yaw, pitch,
      areaFrac: (b.width * b.height) / imgArea,
    };
  });
}

// Compare two descriptors → distance (lower = more similar). <0.5 ≈ match
export function faceDistance(a, b) {
  return faceapi.euclideanDistance(a, b);
}

// Given a query descriptor + list of {photo_id, descriptor}, return matches under threshold
export function findMatches(query, candidates, threshold = 0.5) {
  return candidates
    .map(c => ({ photo_id: c.photo_id, distance: faceDistance(query, c.descriptor) }))
    .filter(m => m.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
}
