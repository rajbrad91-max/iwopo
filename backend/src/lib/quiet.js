/**
 * 🤫→📝 A failure we carry on past — but never hide (2026-11-04).
 *
 * For a promise we fire and carry on past (background jobs, emails, push notifications, storage clean-up):
 * .catch(quiet('what')). The caller carries on exactly as before, and the failure is one line in the server log,
 * written by noteFailure — the one place these failures go. Failures that are expected — the file or row is already
 * gone — stay silent.
 */
import { noteFailure } from './noteFailure.js';

const ALREADY_GONE = new Set(['ENOENT', 'P2025', 'NoSuchKey', 'NotFound']);

export const quiet = (what) => (e) => {
  if (ALREADY_GONE.has(e?.code) || ALREADY_GONE.has(e?.name) || e?.$metadata?.httpStatusCode === 404) return;
  noteFailure(what, e);
};
