/**
 * 🌫️ How blurred is one face? 0 = crisp … 1 = completely soft.
 *
 * Raj, 2026-10-09: "we need to avoid extremely blurry faces". A blurred face
 * still gets a fingerprint, and a fingerprint of blur matches other blur — so
 * soft background faces join the wrong circles or sit in circles of their own.
 *
 * ⚠️ The first measure tried (edge strength after a Laplacian filter) FAILED
 * the contact-sheet test: it ranked clean studio portraits as the blurriest,
 * because smooth skin on a plain backdrop has few edges. Edge strength
 * measures texture, not focus.
 *
 * This one asks the question directly (Crété et al., "The blur effect"):
 * blur the face on purpose and see how much it changes. A sharp face loses a
 * lot of its pixel-to-pixel variation when blurred; an already-blurred face
 * barely changes. The answer is a ratio, so contrast, skin smoothness and
 * lighting cancel out. The face is read at up to 128px (never enlarged).
 * The threshold that uses it lives in portraitScore.js (MAX_BLUR), set from
 * contact sheets of a real wedding.
 */
import sharp from 'sharp';

const MAX_SIDE = 128;
const K = 9;                                      // the deliberate blur: a 9-pixel average

/** One direction (rows or columns) of the blur effect. */
function blurAlong(px, w, h, horizontal) {
  let sumF = 0, sumV = 0;
  const at = (x, y) => px[y * w + x];
  const half = (K - 1) >> 1;
  const smooth = (x, y) => {
    let s = 0, n = 0;
    for (let d = -half; d <= half; d++) {
      const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += at(xx, yy); n++;
    }
    return s / n;
  };
  for (let y = horizontal ? 0 : 1; y < h; y++) {
    for (let x = horizontal ? 1 : 0; x < w; x++) {
      const px0 = horizontal ? at(x - 1, y) : at(x, y - 1);
      const dF = Math.abs(at(x, y) - px0);
      const dB = Math.abs(smooth(x, y) - (horizontal ? smooth(x - 1, y) : smooth(x, y - 1)));
      sumF += dF;
      sumV += Math.max(0, dF - dB);
    }
  }
  return sumF > 0 ? (sumF - sumV) / sumF : 1;
}

/**
 * @param {string|Buffer} image  the preview the face was detected on
 * @param {{x:number,y:number,width:number,height:number}} box  in that image's pixels
 * @param {{width:number,height:number}} size  that image's dimensions
 * @returns {Promise<number|null>} 0 (sharp) … 1 (blurred), or null if it could not be read
 */
export async function faceBlur(image, box, size) {
  try {
    const left = Math.max(0, Math.round(box.x));
    const top = Math.max(0, Math.round(box.y));
    const width = Math.min(Math.round(box.width), size.width - left);
    const height = Math.min(Math.round(box.height), size.height - top);
    if (width < 12 || height < 12) return 1;
    const { data, info } = await sharp(image)
      .extract({ left, top, width, height })
      .greyscale()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .raw().toBuffer({ resolveWithObject: true });
    const b = Math.max(blurAlong(data, info.width, info.height, true), blurAlong(data, info.width, info.height, false));
    return Math.round(b * 1000) / 1000;
  } catch { return null; }
}
