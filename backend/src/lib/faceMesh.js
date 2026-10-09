/**
 * 👁️ MediaPipe Face Mesh — how a face LOOKS, for choosing circle covers.
 *
 * Google's face landmarks model (Apache-2.0, 4.7 MB, ONNX conversion checked
 * against Google's own to 0.00024 px). It does not find faces and plays no
 * part in who-is-who: given one face already found by YuNet, it marks 478
 * points — eyelids, irises, the whole face in 3-D — from which:
 *
 *   eyeOpen  the LESS open of the two eyes: lid gap ÷ eye width. Measured on
 *            409 candidates across every staging album (2026-10-09): every
 *            face under 0.18 had its eyes closed, looking down or squeezed
 *            shut laughing; open eyes sit at 0.25–0.40.
 *   pitch    forehead-to-chin against depth, degrees; + is looking DOWN.
 *            Beyond ~18° the face is looking into its lap.
 *   roll     the eye line against level, degrees: a tilted head.
 *
 * Run only on faces that could be a cover (presentable), so it adds ~35 ms to
 * a few faces per photo, not to every face found.
 */
import ort from 'onnxruntime-node';

const IN = 256;
let session = null;
export async function loadFaceMesh(modelPath) {
  session ??= await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 1 });
  return session;
}

/** A square crop round the face with MediaPipe's margin, from an RGB raster, as its input. */
function cropInput(raw, box) {
  const { data, info } = raw;
  const side = Math.max(box.width, box.height) * 1.5;             // the margin MediaPipe expects
  const x0 = box.x + box.width / 2 - side / 2, y0 = box.y + box.height / 2 - side / 2;
  const step = side / IN;
  const t = new Float32Array(IN * IN * 3);
  for (let y = 0; y < IN; y++) {
    const sy = Math.floor(y0 + (y + 0.5) * step);
    for (let x = 0; x < IN; x++) {
      const sx = Math.floor(x0 + (x + 0.5) * step);
      const o = (y * IN + x) * 3;
      if (sx < 0 || sy < 0 || sx >= info.width || sy >= info.height) continue;   // outside the photo: black
      const i = (sy * info.width + sx) * info.channels;
      t[o] = data[i] / 255; t[o + 1] = data[i + 1] / 255; t[o + 2] = data[i + 2] / 255;
    }
  }
  return t;
}

/** eyeOpen, pitch and roll for one face (box in the raster's pixels: { x, y, width, height }). */
export async function faceLooks(raw, box) {
  const out = await session.run({ input_12: new ort.Tensor('float32', cropInput(raw, box), [1, IN, IN, 3]) });
  const L = out.Identity.data;
  const P = (i) => [L[i * 3], L[i * 3 + 1], L[i * 3 + 2]];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // eyelids: upper/lower mid-lid over corner-to-corner, each eye
  const left = d(P(159), P(145)) / (d(P(33), P(133)) || 1);
  const right = d(P(386), P(374)) / (d(P(362), P(263)) || 1);
  const [lc, rc] = [P(33), P(263)];
  const brow = P(10), chin = P(152);
  return {
    eyeOpen: Math.round(Math.min(left, right) * 1000) / 1000,
    pitch: Math.round(Math.atan2(chin[2] - brow[2], chin[1] - brow[1]) * 180 / Math.PI * 10) / 10,
    roll: Math.round(Math.atan2(rc[1] - lc[1], rc[0] - lc[0]) * 180 / Math.PI * 10) / 10,
  };
}
