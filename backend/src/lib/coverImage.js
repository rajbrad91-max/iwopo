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
 *
 * ⚡ Each crop comes in three sizes (Raj, 2026-11-08 — speed first): every screen
 * gets the one that fits it rather than all getting 2500px. full 2500 for big
 * screens, 1920 for phones and ordinary laptops, 800 for album cards. (A tiny one
 * was tried and dropped the same day: the sign-in now fades the banner cover in.)
 * Names: coverName(); every file of a cover: coverNames(); what to serve for a
 * request: coverCandidates().
 */
import sharp from 'sharp';
import path from 'node:path';

/* Far more than any crop needs — the widest rendition is 2500 — while being a
   quarter the size of a modern camera file. */
export const MASTER_EDGE = 4000;

/* The sizes each crop is written in: longest edge, WebP quality, filename tag. */
export const COVER_SIZES = {
  full: { edge: 2500, q: 84, tag: '' },          // big screens (and what a request without a size gets)
  1920: { edge: 1920, q: 80, tag: '_1920' },     // phones and ordinary laptops
  800: { edge: 800, q: 80, tag: '_800' },        // album cards
};

/* Sizes no longer made — their files are removed with the cover (routes/albums.js) and cleared from storage by
   scripts/coverSizes.mjs, so none is left behind. '_tiny': dropped 2026-11-08. */
export const RETIRED_COVER_TAGS = ['_tiny'];
export const CROP_EDGE = COVER_SIZES.full.edge;

/* The hero is the full width of the screen and as tall as the viewport, so its
   shape is opposite on the two devices: about 2:1 on a laptop and about 9:16 on
   a phone. One picture cannot serve both without being cut to ribbons at one of
   them, so each gets its own. */
export const SHAPES = {
  wide: { ratio: 2 / 1, suffix: '' },          // desktop — cover_<ts>.webp
  tall: { ratio: 9 / 16, suffix: '_tall' },    // mobile  — cover_<ts>_tall.webp
};

/** A cover file's name: cover_<ts>[_tall][_1920|_800|_tiny].webp */
export const coverName = (base, shape = 'wide', size = 'full') => `${base}${SHAPES[shape].suffix}${COVER_SIZES[size].tag}.webp`;

/** Every rendition of a cover (not the master) — what is uploaded, re-cut and removed together. */
export const coverNames = (base) => Object.keys(SHAPES).flatMap(shape => Object.keys(COVER_SIZES).map(size => coverName(base, shape, size)));

/** The files of retired sizes a cover may still have in storage. */
export const retiredCoverNames = (base) => Object.keys(SHAPES).flatMap(shape => RETIRED_COVER_TAGS.map(tag => `${base}${SHAPES[shape].suffix}${tag}.webp`));

/**
 * The files to try for a request, best first: the size asked for, then that shape at full size, then the wide one.
 * A cover made before a size (or the tall shape) existed simply gets the nearest it has.
 */
export function coverCandidates(coverPhoto, v, s) {
  const base = coverPhoto.replace(/\.webp$/, '');
  const shape = v === 'tall' ? 'tall' : 'wide';
  const size = Object.hasOwn(COVER_SIZES, s) ? s : 'full';
  return [...new Set([coverName(base, shape, size), coverName(base, shape, 'full'), coverPhoto])];
}

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
 * Cut both shapes from a source picture (the master — or, for a cover older than masters, its own full crop), each
 * in every size. The crop is taken once per shape and every size is shrunk from it.
 *
 * withoutEnlargement matters: a vendor uploading something small should get a
 * small sharp cover rather than a large soft one.
 */
export async function writeCrops(masterPath, dir, base, focus, { only } = {}) {
  const m = await sharp(masterPath).metadata();
  const f = parseFocus(focus);
  const written = [];
  for (const shape of Object.keys(SHAPES)) {
    const rect = cropRect(m.width, m.height, SHAPES[shape].ratio, f);
    const crop = await sharp(masterPath).extract(rect).toBuffer();
    for (const [size, spec] of Object.entries(COVER_SIZES)) {
      const out = coverName(base, shape, size);
      if (only && !only.includes(out)) continue;
      await sharp(crop)
        .resize(spec.edge, spec.edge, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: spec.q })
        .toFile(path.join(dir, out));
      written.push(out);
    }
  }
  return written;
}
