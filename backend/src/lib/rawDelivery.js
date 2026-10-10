/**
 * 🎞️ Raw Selector — what happens to an EDITED photo the editor delivers.
 *
 *   ®️ the vendor's logo is printed on it, where and how the vendor chose
 *      (rawsel_settings) — only these photos, never the regular galleries;
 *   🤖 Claude writes a short description (alt text), quietly, in the background.
 *
 * Both are cheap: one sharp composite (~0.1–0.3 s) per photo here, and the
 * description is written on Anthropic's side from a small preview.
 */
import sharp from 'sharp';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { recordObject } from './storageLedger.js';
import { getSetting } from './settings.js';
import { DEFAULT_MODEL } from './wopoAssistant.js';   // the same model the rest of the app uses

const POS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export const LOGO_DEFAULTS = { logo_pos: 'br', logo_size: 14, logo_opacity: 85, logo_margin: 3 };

/** A private file, whole, as a Buffer. */
async function readAll(key) {
  const { stream } = await objects.getStream(objects.PRIVATE, key);
  const parts = [];
  for await (const c of stream) parts.push(c);
  return Buffer.concat(parts);
}

/**
 * The photo with the logo on it. Logo width = size% of the photo's width, at
 * opacity%, margin% of the shorter side away from the chosen edge(s).
 */
export async function withLogo(photo, logo, s = LOGO_DEFAULTS) {
  const img = sharp(photo, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const W = meta.autoOrient?.width || meta.width, H = meta.autoOrient?.height || meta.height;
  if (!W || !H) return photo;
  const lw = Math.max(16, Math.round(W * Math.min(60, Math.max(3, s.logo_size)) / 100));
  const opacity = Math.min(100, Math.max(5, s.logo_opacity)) / 100;
  // fade the logo to the chosen opacity by scaling its alpha channel
  const scaled = await sharp(logo).resize({ width: lw }).ensureAlpha().toBuffer();
  const { data, info } = await sharp(scaled).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  const faded = await sharp(data, { raw: info }).png().toBuffer();
  const m = Math.round(Math.min(W, H) * Math.min(20, Math.max(0, s.logo_margin)) / 100);
  const pos = POS.includes(s.logo_pos) ? s.logo_pos : 'br';
  const left = pos[1] === 'l' ? m : pos[1] === 'c' ? Math.round((W - info.width) / 2) : W - info.width - m;
  const top = pos[0] === 't' ? m : pos[0] === 'm' ? Math.round((H - info.height) / 2) : H - info.height - m;
  return img.composite([{ input: faded, left: Math.max(0, left), top: Math.max(0, top) }]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** Print the vendor's logo onto the original at `key`, in place. No logo set → left as it is. */
export async function stampLogo(vendorId, key) {
  const s = await prisma.rawsel_settings.findUnique({ where: { vendor_id: vendorId } });
  if (!s?.logo_key) return false;
  const [photo, logo] = await Promise.all([readAll(key), readAll(s.logo_key)]);
  const out = await withLogo(photo, logo, s);
  await objects.putObject(objects.PRIVATE, key, out, 'image/jpeg', out.length);
  await recordObject(objects.PRIVATE, key, out.length).catch(() => {});
  return out.length;
}

/* ── 🤖 alt text ──────────────────────────────────────────────────────── */
const API_URL = 'https://api.anthropic.com/v1/messages';

/** One description, from a small preview: what is in the photo, plainly. */
async function describe(jpeg, apiKey, model) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 120,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
        { type: 'text', text: 'Write alt text for this wedding or event photo: one plain sentence, under 25 words, describing what is visible (people, setting, moment). No names, no guesses about who anyone is, no "image of". Reply with the sentence only.' },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}`);
  const d = await r.json();
  return String(d.content?.find(c => c.type === 'text')?.text || '').trim().replace(/^"|"$/g, '').slice(0, 400);
}

/**
 * Describe every delivered photo that has no alt text yet. Without an AI key it
 * does nothing — and catches up by itself once the key is saved (it runs again
 * after each delivery and every hour). Delivered photos only.
 */
let running = false;
export async function writeAltTexts() {
  if (running) return 0;
  running = true;
  try {
    const apiKey = await getSetting('anthropic_api_key', '');
    if (!apiKey) return 0;
    const model = (await getSetting('anthropic_model', '')) || DEFAULT_MODEL;
    const todo = await prisma.photos.findMany({
      where: { alt_text: null, ready: true, kind: 'photo', album_events: { is: { delivery: true } } },
      select: { id: true, preview_path: true, thumb_path: true, vendor_id: true, album_id: true },
      take: 200,
    });
    let n = 0;
    for (const p of todo) {
      try {
        const rel = p.preview_path || p.thumb_path;
        const small = await sharp(await readAll(objects.keyFor(p.vendor_id, 'galleries', ...rel.split('/').slice(1))))
          .resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        const alt = await describe(small, apiKey, model);
        if (alt) { await prisma.photos.update({ where: { id: p.id }, data: { alt_text: alt } }); n++; }
      } catch (e) { console.error('[rawsel] alt text', p.id, e.message); }
    }
    return n;
  } finally { running = false; }
}
