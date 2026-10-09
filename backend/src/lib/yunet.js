/**
 * 🔍 YuNet — finds faces and their five points (eyes, nose tip, mouth corners).
 *
 * OpenCV Zoo's face detector (MIT licence, 228 KB). It replaced the old
 * @vladmandic/face-api finder on 2026-10-09: AuraFace straightens every face
 * on its five points before fingerprinting it, and better points mean a
 * better fingerprint — especially for tilted heads.
 *
 * The model takes a fixed 640×640 picture, and our previews are ~2200 px.
 * One squeezed pass would lose the small faces at the back of a group shot,
 * so a photo is read two ways and the answers merged:
 *   • at TILE_LONG px on its long side, in overlapping 640 tiles — small and
 *     middle-sized faces (2–4 tiles for a preview)
 *   • the whole photo squeezed into 640 — the big close-ups
 * The overlap is wider than any face the tiled pass is meant to catch, so a
 * face cut by one tile's edge is whole in its neighbour.
 *
 * ⚡ A full-size tiled pass (12 more windows) was tried first and dropped:
 * YuNet sees faces down to ~10px, so at TILE_LONG it already reaches ~17px
 * on the preview — below the 26px under which every face is thrown away
 * anyway (isUsableFace). It cost 60% more CPU for faces nobody could use.
 */
import ort from 'onnxruntime-node';
import sharp from 'sharp';

const SIZE = 640;
const OVERLAP = 128;
const TILE_LONG = 1280;
const STRIDES = [8, 16, 32];
const NMS_IOU = 0.3;

let session = null;
export async function loadYunet(modelPath) {
  session ??= await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 2 });
  return session;
}

/** One 640×640 window of an RGB raster → BGR planes as YuNet expects (0–255, no scaling). */
function windowTensor(rgb, W, H, ch, x0, y0) {
  const t = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let y = 0; y < SIZE; y++) {
    const sy = y0 + y;
    if (sy >= H) break;
    for (let x = 0; x < SIZE; x++) {
      const sx = x0 + x;
      if (sx >= W) break;
      const i = (sy * W + sx) * ch, o = y * SIZE + x;
      t[o] = rgb[i + 2]; t[plane + o] = rgb[i + 1]; t[2 * plane + o] = rgb[i];
    }
  }
  return new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]);
}

/** Decode one window's outputs into faces, in that window's pixels. */
function decode(out, minScore) {
  const faces = [];
  for (const s of STRIDES) {
    const cls = out[`cls_${s}`].data, obj = out[`obj_${s}`].data;
    const bbox = out[`bbox_${s}`].data, kps = out[`kps_${s}`].data;
    const cols = SIZE / s;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < minScore) continue;
      const c = i % cols, r = Math.floor(i / cols);
      const cx = (c + bbox[i * 4]) * s, cy = (r + bbox[i * 4 + 1]) * s;
      const w = Math.exp(bbox[i * 4 + 2]) * s, h = Math.exp(bbox[i * 4 + 3]) * s;
      const points = [];
      for (let k = 0; k < 5; k++) points.push([(c + kps[i * 10 + 2 * k]) * s, (r + kps[i * 10 + 2 * k + 1]) * s]);
      faces.push({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, score, points });
    }
  }
  return faces;
}

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter || 1);
};

/** Windows covering a W×H raster: overlapping tiles, or one if it already fits. */
function windows(W, H) {
  const starts = (n) => {
    if (n <= SIZE) return [0];
    const out = [];
    for (let p = 0; p + SIZE < n; p += SIZE - OVERLAP) out.push(p);
    out.push(n - SIZE);                         // the last tile ends exactly at the edge
    return out;
  };
  const list = [];
  for (const y of starts(H)) for (const x of starts(W)) list.push([x, y]);
  return list;
}

/**
 * Every face in a JPEG/PNG buffer, in that image's pixels:
 *   { box: { x, y, width, height }, score, points: [[x,y] × 5] }
 * Points come back in image order: the eye on the LEFT of the picture first,
 * then the right one, the nose tip, then the mouth corners left and right.
 */
export async function findFaces(image, { minScore = 0.6 } = {}) {
  const meta = await sharp(image).metadata();
  const W = meta.width, H = meta.height, long = Math.max(W, H);
  const passes = [Math.min(1, TILE_LONG / long)];   // tiled
  if (long > SIZE) passes.push(SIZE / long);         // whole photo in one window

  const all = [];
  for (const scale of passes) {
    const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
    const { data, info } = await sharp(image).resize(w, h).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x0, y0] of windows(info.width, info.height)) {
      const out = await session.run({ input: windowTensor(data, info.width, info.height, info.channels, x0, y0) });
      for (const f of decode(out, minScore)) {
        all.push({
          x: (f.x + x0) / scale, y: (f.y + y0) / scale, width: f.width / scale, height: f.height / scale,
          score: f.score, points: f.points.map(([px, py]) => [(px + x0) / scale, (py + y0) / scale]),
        });
      }
    }
  }

  // the same face seen by several windows and sizes → keep the most confident
  all.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const f of all) if (!kept.some(k => iou(k, f) > NMS_IOU)) kept.push(f);

  return kept.map(f => {
    const [e1, e2, nose, m1, m2] = f.points;
    const eyes = e1[0] <= e2[0] ? [e1, e2] : [e2, e1];
    const mouth = m1[0] <= m2[0] ? [m1, m2] : [m2, m1];
    return { box: { x: f.x, y: f.y, width: f.width, height: f.height }, score: f.score, points: [eyes[0], eyes[1], nose, mouth[0], mouth[1]] };
  });
}
