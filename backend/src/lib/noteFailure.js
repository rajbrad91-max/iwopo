/**
 * 📝 One line in the server log when something that must never break the main job fails anyway (Raj, 2026-11-11).
 * Used instead of an empty catch where a failure is worth knowing about: the job carries on exactly as before, and the
 * log says what failed and why. Kept in one place so these failures can later be sent on too (an alert, a dashboard).
 * Plain clean-up that is expected to find nothing (a temp file already gone) still uses an empty catch with a comment.
 */
export function noteFailure(what, err) {
  console.warn(`[soft-fail] ${what}: ${err?.message || err}`);
}
