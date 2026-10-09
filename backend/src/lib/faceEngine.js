// 🧠 Face engine — LOCAL, runs on our own server.
//
// 2026-10-09: who-is-who is decided by AuraFace (fal.ai, Apache-2.0 — a
// commercially usable ArcFace-type ResNet-100, 512-number fingerprints).
// @vladmandic/face-api is kept only to FIND faces and their 68 points; its
// own 128-number fingerprint is parked. Measured on Raj's example (a man whose
// one clear photo had been left out of his own circle): the old fingerprint put
// him 0.44–0.52 from himself and other people from 0.51 — they overlapped, so no
// rule could separate them; AuraFace puts him 0.47–0.62 similar to himself and
// every other person at 0.31 or less.
//
// The model file is not in git (249 MB): backend/models/auraface/glintr100.onnx,
// from https://huggingface.co/fal/AuraFace-v1 — tools/iwopo-deploy fetches it.
import * as faceapi from '@vladmandic/face-api';
import '@tensorflow/tfjs-node';
import canvas from 'canvas';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import ort from 'onnxruntime-node';
import { poseFromLandmarks, faceShape } from './portraitScore.js';
import { faceBlur } from './faceBlur.js';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(__dirname, '..', '..', 'models');
const AURAFACE = path.join(MODELS, 'auraface', 'glintr100.onnx');

/** A fingerprint from this engine has this many numbers; anything else is from
 *  the parked engine and must be re-indexed before it is compared. */
export const DESCRIPTOR_LENGTH = 512;

/* 📏 Distances. Fingerprints are unit length, so the straight-line distance d
   and the similarity s are two views of one thing: d = √(2 − 2s).
   Measured on GreatTest: the same man across sharp and blurry side shots
   s = 0.47–0.62; twenty other people s ≤ 0.31. */
const fromSimilarity = (s) => Math.sqrt(2 - 2 * s);
export const DIST = {
  match: fromSimilarity(0.40),      // same person — circles (single pass), Find me, live shoot
  seed: fromSimilarity(0.40),       // clear faces building a gallery circle
  join: fromSimilarity(0.45),       // a poor face joining a person's clear faces
  pairTight: fromSimilarity(0.50),  // a two-photo circle with no strong detections
  typicalFull: fromSimilarity(0.60),   // as typical of the person as a face gets
  typicalNone: fromSimilarity(0.25),   // too unlike the person to stand for them
};

/** A live shoot's "selfie strictness" was set on the parked engine's scale
 *  (48 = 0.48). Mapped onto this one so a saved setting keeps its meaning:
 *  the default 48 → similarity 0.40; stricter 40 → 0.50. */
export function selfieLimit(strictness) {
  const old = strictness ? strictness / 100 : 0.48;
  return DIST.match + (old - 0.48) * ((fromSimilarity(0.50) - DIST.match) / (0.40 - 0.48));
}

// Detector confidence floor — see the measurement that set it: below 0.4 found
// nothing more, and above it real faces turned slightly away were lost. A
// missed face can be the only link between two photos of the same person.
const MIN_CONFIDENCE = 0.4;
const MAX_RESULTS = 100;   // a big group shot can legitimately have many faces

let ready = null;
let aura = null;
function init() {
  ready ??= (async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
    aura = await ort.InferenceSession.create(AURAFACE, { intraOpNumThreads: 2 });
  })();
  return ready;
}

function detectorOptions() {
  return new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE, maxResults: MAX_RESULTS });
}

/* 📐 ArcFace models expect a face STRAIGHTENED onto a fixed 112×112 layout:
   eyes, nose tip and mouth corners at these points. A tilted head is rotated
   level before the fingerprint is taken — much of why it copes with angles. */
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
function fivePoints(landmarks) {
  const L = landmarks.positions;
  const avg = (i, j) => { let x = 0, y = 0; for (let k = i; k <= j; k++) { x += L[k].x; y += L[k].y; } return [x / (j - i + 1), y / (j - i + 1)]; };
  return [avg(36, 41), avg(42, 47), [L[30].x, L[30].y], [L[48].x, L[48].y], [L[54].x, L[54].y]];
}
/** Least-squares similarity transform (rotation + scale + shift) src → dst. */
function similarity(src, dst) {
  const n = src.length, mean = (a, k) => a.reduce((s, p) => s + p[k], 0) / n;
  const sx = mean(src, 0), sy = mean(src, 1), dx = mean(dst, 0), dy = mean(dst, 1);
  let a = 0, b = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
    a += x * u + y * v; b += x * v - y * u; ss += x * x + y * y;
  }
  a /= ss; b /= ss;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}
/** The straightened 112×112 face as the model's input: RGB, (v − 127.5) / 127.5. */
function alignedInput(raw, points) {
  const { data, info } = raw;
  const M = similarity(points, TEMPLATE), det = M.a * M.a + M.b * M.b;
  const t = new Float32Array(3 * 112 * 112);
  const at = (x, y, c) => (x < 0 || y < 0 || x >= info.width || y >= info.height) ? 0 : data[(y * info.width + x) * info.channels + c];
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) {
    const X = x - M.tx, Y = y - M.ty;
    const sx = (M.a * X + M.b * Y) / det, sy = (-M.b * X + M.a * Y) / det;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const v = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy)
        + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
      t[c * 12544 + y * 112 + x] = (v - 127.5) / 127.5;
    }
  }
  return t;
}
async function auraFingerprint(raw, points) {
  const out = await aura.run({ data: new ort.Tensor('float32', alignedInput(raw, points), [1, 3, 112, 112]) });
  const e = Array.from(Object.values(out)[0].data);
  const n = Math.hypot(...e) || 1;
  return e.map(v => v / n);
}

// Every face in an image: where it is, how it looks, and its fingerprint.
export async function getFaceDescriptors(imagePath) {
  await init();
  // canvas can't read webp → decode to JPEG first; the same pixels feed AuraFace
  const jpegBuf = await sharp(imagePath).jpeg().toBuffer();
  const img = await canvas.loadImage(jpegBuf);
  const raw = await sharp(jpegBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const results = await faceapi.detectAllFaces(img, detectorOptions()).withFaceLandmarks();

  const imgArea = (img.width || 1) * (img.height || 1);
  const size = { width: img.width, height: img.height };
  const faces = [];
  for (const r of results) {            // one at a time — the model is the heavy part
    const { yaw, pitch } = poseFromLandmarks(r.landmarks);
    const b = r.detection.box;
    // 👤 is it really a face, and is it sharp? measured here, judged by isUsableFace()
    const { eyeSep, noseBetween } = faceShape(r.landmarks, b);
    const blur = await faceBlur(jpegBuf, b, size);
    faces.push({
      descriptor: await auraFingerprint(raw, fivePoints(r.landmarks)),
      box: b,
      score: r.detection.score,
      yaw, pitch,
      eyeSep, noseBetween, blur,
      areaFrac: (b.width * b.height) / imgArea,
    });
  }
  return faces;
}

/** Distance between two fingerprints (lower = more alike). Different lengths
 *  mean one is from the parked engine — never treated as a match. */
export function faceDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// Given a query fingerprint + list of {photo_id, descriptor}, the matches within the limit
export function findMatches(query, candidates, threshold = DIST.match) {
  return candidates
    .map(c => ({ photo_id: c.photo_id, distance: faceDistance(query, c.descriptor) }))
    .filter(m => m.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
}
