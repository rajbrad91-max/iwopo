/**
 * 🖼 Cover photographs: one master, two crops.
 *
 * A cover used to be resized to fit inside 1200px and that was the whole story.
 * The hero it lands in is the full width of the screen, so an 800px-wide
 * portrait was being stretched two and a half times on an ordinary laptop —
 * which is what made it look pixelated.
 *
 * Now the upload keeps a WebP master and cuts two renditions from it. The
 * master is why the focal point stays adjustable: moving it re-cuts from a
 * picture we still hold rather than asking the vendor to upload again.
 *
 * The original JPEG is discarded once the master exists. A camera file is
 * several times the size of the master and carries nothing a 2500px crop can
 * use.
 */
import sharp from 'sharp';
import path from 'node:path';

/* Far more than any crop needs — the widest rendition is 2500 — while being a
   quarter the size of a modern camera file. */
export const MASTER_EDGE = 4000;
export const CROP_EDGE = 2500;

/* The hero is the full width of the screen and as tall as the viewport, so its
   shape is opposite on the two devices: about 2:1 on a laptop and about 9:16 on
   a phone. One picture cannot serve both without being cut to ribbons at one of
   them, so each gets its own. */
export const SHAPES = {
  wide: { ratio: 2 / 1, suffix: '' },          // desktop — cover_<ts>.webp
  tall: { ratio: 9 / 16, suffix: '_tall' },    // mobile  — cover_<ts>_tall.webp
};

/** "40% 50%" → { x: 0.4, y: 0.5 }, tolerant of anything malformed. */
export function parseFocus(focus) {
  const m = String(focus || '').match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  if (!m) return { x: 0.5, y: 0.5 };
  return { x: Math.min(1, Number(m[1]) / 100), y: Math.min(1, Number(m[2]) / 100) };
}

/**
 * The rectangle to take out of a picture so the result has the shape asked for
 * and keeps the focal point in view.
 *
 * The window is the largest of that shape that fits, then slid so the focal
 * point sits at its centre — and clamped, so a point near an edge pulls the
 * window to that edge rather than off the picture.
 */
export function cropRect(width, height, ratio, focus) {
  let w = width, h = Math.round(width / ratio);
  if (h > height) { h = height; w = Math.round(height * ratio); }
  const left = Math.round(Math.min(Math.max(focus.x * width - w / 2, 0), width - w));
  const top = Math.round(Math.min(Math.max(focus.y * height - h / 2, 0), height - h));
  return { left, top, width: w, height: h };
}

/** The master: WebP, capped, orientation honoured. Returns its dimensions. */
export async function writeMaster(srcPath, destPath) {
  await sharp(srcPath)
    .rotate()                                   // honour the camera's orientation
    .resize(MASTER_EDGE, MASTER_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })                      // a master is re-encoded from, so keep it generous
    .toFile(destPath);
  const m = await sharp(destPath).metadata();
  return { width: m.width, height: m.height };
}

/**
 * Cut both renditions from the master.
 *
 * withoutEnlargement matters: a vendor uploading something small should get a
 * small sharp cover rather than a large soft one.
 */
export async function writeCrops(masterPath, dir, base, focus) {
  const m = await sharp(masterPath).metadata();
  const f = parseFocus(focus);
  const written = [];
  for (const [name, shape] of Object.entries(SHAPES)) {
    const rect = cropRect(m.width, m.height, shape.ratio, f);
    const long = Math.max(rect.width, rect.height);
    const scale = Math.min(CROP_EDGE / long, 1);
    const out = `${base}${shape.suffix}.webp`;
    await sharp(masterPath)
      .extract(rect)
      .resize(Math.round(rect.width * scale), Math.round(rect.height * scale))
      .webp({ quality: 84 })
      .toFile(path.join(dir, out));
    written.push({ name, file: out });
  }
  return written;
}
