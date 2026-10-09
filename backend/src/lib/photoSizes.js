/**
 * 📐 The screen sizes of one photograph — in ONE place.
 *
 * Two paths make them: a photo posted to this server (the Live Shoot watcher)
 * and a photo sent straight to R2 by the panel, processed afterwards. Both call
 * this, so the sizes and the quality can never drift apart.
 *
 * FIXED, by Raj's decision — speed work never changes these:
 *   gallery    2200px preview (webp q82) + 800px thumb (webp q78)
 *   live shoot 1800px preview (webp q84) + 800px thumb (webp q78)
 *
 * 🚀 The camera file is decoded ONCE, to the preview size, and the thumb is
 * shrunk from that. It used to be decoded twice. Measured: preview pixel-
 * identical, thumb visually identical, resize work −16%.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export function tierSpec(kind) {
  const live = kind === 'liveshoot';
  return { fullEdge: live ? 1800 : 2200, fullQ: live ? 84 : 82, thumbEdge: 800, thumbQ: 78 };
}

/**
 * @param {string} src      the uploaded original on disk
 * @param {string} dir      where to write the two webp files
 * @param {{full:string, thumb:string}} names
 * @param {string} kind     album kind — 'gallery' | 'liveshoot'
 * @returns {{fullSize:number, thumbSize:number}}
 */
export async function renderTiers(src, dir, names, kind) {
  const s = tierSpec(kind);
  const { data, info } = await sharp(src).rotate()                 // the camera's orientation flag
    .resize(s.fullEdge, s.fullEdge, { fit: 'inside', withoutEnlargement: true })
    .raw().toBuffer({ resolveWithObject: true });
  const fromRaw = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  await Promise.all([
    fromRaw().webp({ quality: s.fullQ }).toFile(path.join(dir, names.full)),
    fromRaw().resize(s.thumbEdge, s.thumbEdge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: s.thumbQ }).toFile(path.join(dir, names.thumb)),
  ]);
  return {
    fullSize: fs.statSync(path.join(dir, names.full)).size,
    thumbSize: fs.statSync(path.join(dir, names.thumb)).size,
  };
}
