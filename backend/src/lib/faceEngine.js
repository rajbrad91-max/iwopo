// 🧠 Face engine — LOCAL, runs on our own server. Two models, nothing else:
//
//   🔍 YuNet (OpenCV Zoo, MIT, 228 KB) finds each face and its five points —
//      eyes, nose tip, mouth corners (yunet.js).
//   🧬 AuraFace (fal.ai, Apache-2.0, ArcFace-type ResNet-100) straightens each
//      face on those five points and fingerprints it: 512 numbers.
//
// 2026-10-09: AuraFace replaced @vladmandic/face-api's 128-number fingerprint
// — on Raj's example (a man whose one clear photo was left out of his own
// circle) the old fingerprint put him as far from himself as from strangers;
// AuraFace separated him cleanly. Then YuNet replaced face-api's finder as
// well, and the old library was removed: its 68 points drift on tilted faces,
// and a badly straightened face gives AuraFace a weaker fingerprint.
//
// 👁️ MediaPipe Face Mesh (Google, Apache-2.0) then looks closely at faces that
// could be a circle's cover — eyes open, looking down, tilted (faceMesh.js).
//
// Model files are not in git: backend/models/yunet/face_detection_yunet_2023mar.onnx,
// backend/models/auraface/glintr100.onnx and
// backend/models/facemesh/face_landmarks_detector.onnx — tools/iwopo-deploy fetches them.
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import ort from 'onnxruntime-node';
import { faceShape, MIN_FACE_PX, presentable } from './portraitScore.js';
import { faceBlur } from './faceBlur.js';
import { loadYunet, findFaces } from './yunet.js';
import { loadFaceMesh, faceLooks } from './faceMesh.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(__dirname, '..', '..', 'models');
const YUNET = path.join(MODELS, 'yunet', 'face_detection_yunet_2023mar.onnx');
const AURAFACE = path.join(MODELS, 'auraface', 'glintr100.onnx');
const FACEMESH = path.join(MODELS, 'facemesh', 'face_landmarks_detector.onnx');

/** A fingerprint from this engine has this many numbers; anything else is from
 *  the removed engine and must be re-indexed before it is compared. */
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

/** A live shoot's "selfie strictness" was set on the old engine's scale
 *  (48 = 0.48). Mapped onto this one so a saved setting keeps its meaning:
 *  the default 48 → similarity 0.40; stricter 40 → 0.50. */
export function selfieLimit(strictness) {
  const old = strictness ? strictness / 100 : 0.48;
  return DIST.match + (old - 0.48) * ((fromSimilarity(0.50) - DIST.match) / (0.40 - 0.48));
}

/* YuNet's confidence floor. Measured 2026-10-09 on 79 GreatTest photos: 0.5
   found only one more real face than 0.6 but 107 more scraps (hands, 9–16px
   blobs), so 0.6. */
const MIN_SCORE = 0.6;

let ready = null;
let aura = null;
function init() {
  ready ??= (async () => {
    await loadYunet(YUNET);
    await loadFaceMesh(FACEMESH);
    aura = await ort.InferenceSession.create(AURAFACE, { intraOpNumThreads: 2 });
  })();
  return ready;
}

/* 📐 ArcFace models expect a face STRAIGHTENED onto a fixed 112×112 layout:
   eyes, nose tip and mouth corners at these points. A tilted head is rotated
   level before the fingerprint is taken — much of why it copes with angles. */
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
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
  /* .rotate() turns the picture upright from its EXIF orientation. Gallery
     previews are already upright, but a SELFIE comes straight off a phone,
     usually stored sideways with an orientation tag — read as stored, the
     face lies on its side and is missed. */
  const jpegBuf = await sharp(imagePath).rotate().jpeg().toBuffer();
  const raw = await sharp(jpegBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const size = { width: raw.info.width, height: raw.info.height };
  const imgArea = (size.width || 1) * (size.height || 1);
  const found = await findFaces(jpegBuf, { minScore: MIN_SCORE });

  const faces = [];
  for (const d of found) {               // one at a time — AuraFace is the heavy part
    const b = d.box;
    const box = { _x: b.x, _y: b.y, _width: b.width, _height: b.height };   // the shape stored faces have always used
    /* ⚡ YuNet also reports specks — faces 9–25px across at the back of a hall.
       isUsableFace() throws every one of them away, so measuring and
       fingerprinting them was pure waste: on GreatTest they were ~40% of all
       detections. Kept as a bare box (counted, never compared). */
    if (Math.min(b.width, b.height) < MIN_FACE_PX) {
      faces.push({ descriptor: null, box, score: d.score, areaFrac: (b.width * b.height) / imgArea });
      continue;
    }
    // 👤 is it really a face, which way is it turned, is it sharp? judged by isUsableFace()
    const { eyeSep, noseBetween, yaw, pitch } = faceShape(d.points, b);
    const blur = await faceBlur(jpegBuf, b, size);
    const face = {
      descriptor: await auraFingerprint(raw, d.points),
      box,
      points: d.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
      score: d.score,
      yaw, pitch,
      eyeSep, noseBetween, blur,
      areaFrac: (b.width * b.height) / imgArea,
    };
    /* 👁️ A face that could be a circle's cover also gets looked at closely —
       eyes open, looking down, tilted (faceMesh.js). Its pitch replaces the
       rough one from five points. Only these faces: ~35 ms each. */
    if (presentable(face)) {
      const looks = await faceLooks(raw, b);
      face.eyeOpen = looks.eyeOpen;
      face.pitch = looks.pitch;
      face.roll = looks.roll;
    }
    faces.push(face);
  }
  return faces;
}

/** Distance between two fingerprints (lower = more alike). Different lengths
 *  mean one is from the removed engine — never treated as a match. */
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
