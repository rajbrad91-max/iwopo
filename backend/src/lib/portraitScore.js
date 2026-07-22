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
 *   yaw        degrees, 0 = facing camera        (AWS Pose.Yaw / local landmarks)
 *   pitch      degrees, 0 = level                (AWS Pose.Pitch / local landmarks)
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

  // Looking up/down is less jarring than turning away, so it's weighted lower.
  const pitch = Math.abs(f.pitch ?? 0);
  const pitchScore = clamp01(1 - pitch / 40);

  // 🔍 A bigger face crops to a cleaner circle. 8% of the frame is already
  // generous for a wedding group shot, so that's treated as full marks.
  const areaScore = clamp01((f.areaFrac ?? 0) / 0.08);

  // ✨ Sharpness/brightness only when the engine reports them (AWS).
  const sharp = f.sharpness == null ? 0.6 : clamp01(f.sharpness / 80);
  const bright = f.brightness == null ? 0.6
    : clamp01(1 - Math.abs((f.brightness ?? 50) - 60) / 60);   // ~60 is ideal

  // 👀 Closed eyes ruin a portrait, so this is a multiplier rather than a term.
  const eyes = f.eyesOpen === false ? 0.55 : 1;

  const detScore = clamp01(f.detScore ?? 1);

  const base =
    yawScore   * 0.38 +
    areaScore  * 0.22 +
    sharp      * 0.16 +
    pitchScore * 0.14 +
    bright     * 0.06 +
    detScore   * 0.04;

  return clamp01(base * eyes);
}

/**
 * Estimate yaw/pitch from face-api's 68 landmarks, which the local engine
 * already computes for its descriptors and previously discarded.
 *
 * yaw:   compare the eye-centre to the nose horizontally — a turned head pushes
 *        the nose toward one eye.
 * pitch: compare the nose to the eye/mouth midpoints vertically.
 * Both are rough (±10°) but plenty to rank "facing camera" against "profile".
 */
export function poseFromLandmarks(landmarks) {
  try {
    const L = landmarks?.positions || landmarks;
    if (!L || L.length < 68) return { yaw: 0, pitch: 0 };
    const mean = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });

    const leftEye  = mean(L.slice(36, 42));
    const rightEye = mean(L.slice(42, 48));
    const nose     = L[30];
    const mouth    = mean(L.slice(48, 68));

    const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
    const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1;

    // horizontal offset of the nose from the eye midpoint, in eye-widths
    const yaw = ((nose.x - eyeMid.x) / eyeDist) * 90;
    // vertical position of the nose between the eyes and the mouth
    const span = (mouth.y - eyeMid.y) || 1;
    const pitch = (((nose.y - eyeMid.y) / span) - 0.5) * 90;

    return {
      yaw: Math.max(-90, Math.min(90, yaw)),
      pitch: Math.max(-90, Math.min(90, pitch)),
    };
  } catch {
    return { yaw: 0, pitch: 0 };
  }
}
