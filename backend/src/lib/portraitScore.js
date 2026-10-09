// 🖼️ Face "portrait quality" — how good a face is as the circle shown to clients.
//
// The old rule was "highest detection score" (local) or "whichever came first"
// (AWS). Detection score answers "is this a face?", not "is this a *flattering*
// face" — a sharp side-profile easily beats a softer front-facing shot, and
// clients then see a stranger's ear where they expect a portrait.
//
// This scores what actually makes a good circle, and returns 0-1 (higher wins).
// Both engines feed into the same scale so the two paths behave identically.

/**
 * @param {object} f
 *   yaw        degrees, 0 = facing camera        (AWS Pose.Yaw / local faceShape)
 *   pitch      degrees, 0 = level                (AWS Pose.Pitch / local faceShape)
 *   sharpness  0-100, higher = crisper           (AWS Quality.Sharpness)
 *   brightness 0-100                             (AWS Quality.Brightness)
 *   eyesOpen   boolean                           (AWS EyesOpen)
 *   areaFrac   face area as a fraction of the photo (both)
 *   detScore   detector confidence 0-1           (both)
 */
export function portraitScore(f = {}) {
  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  // 🎯 Facing the camera matters most. Straight on scores 1; by ±45° it's ~0.
  const yaw = Math.abs(f.yaw ?? 0);
  const yawScore = clamp01(1 - yaw / 45);

  // ⤵️ Looking DOWN reads as eyes-closed in a small circle, so it costs more
  // than looking up (faceMesh.js: + is down).
  const pitch = f.pitch ?? 0;
  const pitchScore = clamp01(1 - (pitch > 0 ? pitch / 25 : -pitch / 40));

  // 🔍 A bigger face crops to a cleaner circle. 8% of the frame is already
  // generous for a wedding group shot, so that's treated as full marks.
  const areaScore = clamp01((f.areaFrac ?? 0) / 0.08);

  // ✨ Sharpness. The local engine measures blur (faceBlur.js: 0 crisp … 1
  // soft); AWS reports sharpness. Before blur existed the local engine fell
  // back to a fixed 0.6 — so a soft background face and a crisp portrait
  // scored the same here, and blurry covers were picked (GreatTest, 2026-10-09).
  const sharp = typeof f.blur === 'number' ? clamp01(1 - (f.blur - 0.30) / 0.35)
    : f.sharpness == null ? 0.6 : clamp01(f.sharpness / 80);
  const bright = f.brightness == null ? 0.6
    : clamp01(1 - Math.abs((f.brightness ?? 50) - 60) / 60);   // ~60 is ideal

  /* 👀 Looking at the camera: eye spacing is ~0.45 of the face box head-on and
     falls towards 0.2 in profile. Yaw from landmarks alone can read "straight"
     on a back of a head; eye spacing does not. */
  const frontal = typeof f.eyeSep === 'number' ? clamp01((f.eyeSep - 0.25) / 0.20) : 0.6;

  // Closed eyes ruin a portrait, so this is a multiplier rather than a term.
  // AWS says eyesOpen; the local engine measures eyeOpen (faceMesh.js).
  const eyes = f.eyesOpen === false || (typeof f.eyeOpen === 'number' && f.eyeOpen < COVER.minEyeOpen) ? 0.55 : 1;

  // ↪️ a tilted head (eye line off level) — measured by faceMesh.js
  const rollScore = typeof f.roll === 'number' ? clamp01(1 - Math.abs(f.roll) / 25) : 1;

  const detScore = clamp01(f.detScore ?? 1);

  const base =
    yawScore   * 0.20 +
    frontal    * 0.12 +
    areaScore  * 0.16 +
    sharp      * 0.18 +
    pitchScore * 0.16 +
    rollScore  * 0.08 +
    bright     * 0.04 +
    detScore   * 0.06;

  return clamp01(base * eyes);
}

/**
 * 🖼️ Is this face good enough to stand for a person in the highlights?
 * A circle is only shown if at least ONE of its faces is (faceCluster.js).
 * Raj, 2026-10-09: "blurry, side, tilted faces from the back, from the
 * background — we don't want that in the highlights." On GreatTest the
 * circles that had no such face were background guests seen small, soft or
 * turned away in every photo they were in.
 * Cut-offs read off a contact sheet of all 154 covers there: covers under
 * 60px were background heads, blur above 0.55 visibly soft, eye spacing under
 * 0.33 profiles and backs of heads, and beyond 30° the face is turned away.
 * Carried onto YuNet's scale (same share of faces): 60px → 52, 0.33 → 0.36.
 *
 * 🥛 minScore — YuNet must be SURE it is a face. Raj, 2026-10-09: circles of a
 * water glass, a candle, fabric, crossed arms. Every one of them came from
 * detections YuNet was unsure of: across all 132 circles of GreatTest, the
 * junk circles' best face scored 0.72–0.87, while every real person had at
 * least one face at 0.91 or more. A circle needs one presentable face, so
 * a person never seen clearly and surely gets no circle — and the cover is
 * always a face the finder was sure of.
 */
/**
 * 👁️ What a COVER also needs, on top of being presentable (Raj, 2026-10-09:
 * "some are looking down, some have eyes closed, some are tilted").
 *
 * Only CLEAR failures rule a face out — read off a sheet of 409 candidates
 * measured by faceMesh.js:
 *   • eyes shut: the less-open eye under 0.12 (every one was closed);
 *   • head bowed into the lap: looking down more than 25°;
 *   • eyes low BECAUSE the head is down: under 0.18 and down more than 15°;
 *   • head tilted more than 12°.
 * The first version rejected any face under 0.18 OR down more than 18°, and
 * so threw out the sharpest, biggest photo of a man with one blind eye and a
 * slight bow (0.185, 20°) for a softer, more turned one. A blind eye or a
 * slight bow alone is not a bad portrait; portraitScore still prefers wider
 * eyes and a level head among the faces that pass.
 * A circle never loses its person over this — when nobody's photo passes,
 * the best presentable face still stands.
 */
export const COVER = { minEyeOpen: 0.18, shutEye: 0.12, maxPitchDown: 25, lowEyesPitch: 15, maxRoll: 12 };
export function coverReady(f = {}) {
  if (!presentable(f)) return false;
  const eye = typeof f.eyeOpen === 'number' ? f.eyeOpen : null;
  const down = typeof f.pitch === 'number' && eye !== null ? f.pitch : null;   // mesh pitch only where the mesh ran
  if (eye !== null && eye < COVER.shutEye) return false;
  if (down !== null && down > COVER.maxPitchDown) return false;
  if (eye !== null && down !== null && eye < COVER.minEyeOpen && down > COVER.lowEyesPitch) return false;
  if (typeof f.roll === 'number' && Math.abs(f.roll) > COVER.maxRoll) return false;
  return true;
}

export const PRESENTABLE = { minPx: 52, maxBlur: 0.55, minEyeSep: 0.36, maxYaw: 30, minScore: 0.90 };
export function presentable(f = {}) {
  const { w, h } = boxSize(f.box);
  if ((f.score ?? 1) < PRESENTABLE.minScore) return false;
  if (w > 0 && h > 0 && !(w <= 1 && h <= 1) && Math.min(w, h) < PRESENTABLE.minPx) return false;
  if (typeof f.blur === 'number' && f.blur > PRESENTABLE.maxBlur) return false;
  if (typeof f.eyeSep === 'number' && f.eyeSep < PRESENTABLE.minEyeSep) return false;
  if (Math.abs(f.yaw ?? 0) > PRESENTABLE.maxYaw) return false;
  return true;
}

/**
 * 📐 How a face sits, from YuNet's five points (left eye, right eye, nose tip,
 * mouth corners — in picture order). Stored with the face at index time.
 *
 *   eyeSep       eye-to-eye distance ÷ face-box width. Front ≈ 0.40–0.50,
 *                three-quarter ≈ 0.30–0.40, profile / back of head below 0.21.
 *   noseBetween  where the nose tip sits along the line from one eye to the
 *                other: 0.5 straight on, towards 0 or 1 as the head turns.
 *                Measured ALONG the eye line, so a tilted head is not mistaken
 *                for a turned one.
 *   yaw          the same turn as degrees: 100 × how far the nose is off
 *                centre. Calibrated 2026-10-09 against the old 68-point
 *                measure on 531 matched faces: the share of faces past 30°
 *                was the same at a nose offset of 0.30.
 *   pitch        nose height between the eye line and the mouth, as degrees.
 *
 * Replaced face-api's 68-point estimates when YuNet took over finding faces.
 */
export function faceShape(points, box) {
  try {
    if (!Array.isArray(points) || points.length < 5 || !box?.width) return {};
    const [l, r, n, ml, mr] = points;
    const iod = Math.hypot(r[0] - l[0], r[1] - l[1]) || 1e-6;
    const ax = (r[0] - l[0]) / iod, ay = (r[1] - l[1]) / iod;            // along the eyes
    const noseBetween = ((n[0] - l[0]) * ax + (n[1] - l[1]) * ay) / iod;
    const eyeMid = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
    const mouthMid = [(ml[0] + mr[0]) / 2, (ml[1] + mr[1]) / 2];
    const down = Math.hypot(mouthMid[0] - eyeMid[0], mouthMid[1] - eyeMid[1]) || 1e-6;
    const along = ((n[0] - eyeMid[0]) * -ay + (n[1] - eyeMid[1]) * ax) / down;   // across the eye line, towards the mouth
    return {
      eyeSep: iod / box.width,
      noseBetween,
      yaw: Math.max(-90, Math.min(90, (noseBetween - 0.5) * 100)),
      pitch: Math.max(-90, Math.min(90, (along - 0.55) * 90)),
    };
  } catch { return {}; }
}

/* ════════════════════════════════════════════════════════════════════════
   👤 Is this detection really a face we can recognise?

   On the back of a head, or a sharp profile, the detector still reports a
   "face" and the landmark model INVENTS eyes and a nose for it. The 128-number
   fingerprint of that crop is really the hairstyle and jewellery, so a bride's
   back-of-head shots matched EACH OTHER and formed a circle of their own
   (album 18, 2026-10-09: 7 photos, 4 of them the back of her head).

   One measurement from the face's points, relative so face size does not
   matter:
     eyeSep        eye-to-eye distance ÷ face-box width.
                   Front ≈ 0.35–0.50 · three-quarter ≈ 0.25–0.35 ·
                   profile/back ≈ 0.05–0.20.

   ⚠️ 2026-10-09, re-measured on a 782-photo wedding (album 56, 3,472 faces)
   after the first version made circles WORSE. That version also rejected a
   nose outside the eyes and anything under 55px, tuned on one 107-face album.
   On the big album it threw away 1,123 faces — and contact sheets showed the
   nose rule's 229 rejects were ALL real people in three-quarter view, and most
   of the 761 small ones were clear faces in group shots. People lost photos
   from their own circles. Both are gone: the nose position is still stored
   (the Live Shoot one-photo rule uses it) but no longer judged here, and the
   size floor is 30px, below which the sheet showed mostly blur.
   ⚠️ Change these only after re-measuring on a LARGE real album, with sheets.
   ════════════════════════════════════════════════════════════════════════ */
/* 📐 On YuNet's points (2026-10-09) these keep the SAME strictness as the
   old 68-point ones: calibrated on 531 faces found by both, the share of faces
   under each cut-off is unchanged (old 0.20 → 0.21; boxes are 13.5% smaller,
   so 30px → 26px). */
export const MIN_EYE_SEP = 0.21;
/* Faces whose short side is under this many pixels (on the 2200px preview)
   are background blur; their fingerprint is too noisy to trust. */
export const MIN_FACE_PX = 26;
/* 🌫️ Faces blurrier than this are left out (faceBlur.js: 0 crisp … 1 soft).
   Raj, 2026-10-09: "avoid extremely blurry faces". Set from a contact sheet of
   3,290 faces across four staging albums, one row per band: up to 0.55 crisp,
   0.55–0.65 soft but recognisable, 0.65 and above plainly blurred — 75 faces
   (2%), the ones a fingerprint cannot be trusted on. */
export const MAX_BLUR = 0.65;


/** Box width/height whichever shape it was saved in (stored faces use _width). */
export function boxSize(b) {
  if (!b) return { w: 0, h: 0 };
  return { w: b.width ?? b._width ?? b.w ?? 0, h: b.height ?? b._height ?? b.h ?? 0 };
}

/**
 * Should this stored LOCAL face be used for circles and for matching a selfie?
 * A face indexed before the shape was measured has no eyeSep and passes the
 * shape test (it cannot be judged) — a re-index measures it.
 */
export function isUsableFace(f) {
  const { w, h } = boxSize(f?.box);
  if (w > 0 && h > 0) {
    const normalized = w <= 1 && h <= 1;          // a fraction of the image, not pixels
    if (!normalized && Math.min(w, h) < MIN_FACE_PX) return false;
  }
  if (typeof f?.eyeSep === 'number' && f.eyeSep < MIN_EYE_SEP) return false;
  if (typeof f?.blur === 'number' && f.blur >= MAX_BLUR) return false;       // 🌫️ see MAX_BLUR
  return true;
}
