/**
 * 🤫→📝 A failure we carry on past — but never hide (2026-11-04).
 *
 * Seventy-eight places fire something and carry on whatever happens: the background jobs started in server.js
 * (cleanups, subscription expiry, occasion reminders, inbox scans …), emails, push notifications, storage
 * clean-up. They swallowed every error, so a job that failed every night, or an email that never left, left no
 * trace. They now use .catch(quiet('what')): the caller still carries on exactly as before, and the failure is one
 * warning line in the server log. Failures that are expected — the file or row is already gone — stay silent.
 */
const ALREADY_GONE = new Set(['ENOENT', 'P2025', 'NoSuchKey', 'NotFound']);

export const quiet = (what) => (e) => {
  if (ALREADY_GONE.has(e?.code) || ALREADY_GONE.has(e?.name) || e?.$metadata?.httpStatusCode === 404) return;
  console.warn(`🤫 ${what} failed (carried on): ${e?.message || e}`);
};
