/**
 * 🔑 The signing secret for logins and signed links, read in ONE place (security review, Raj 2026-11-11). It used to
 * be read in twelve, each with a guessable fallback ('dev-secret-change-me', 'iwopo') that would have let anyone sign
 * a login had the real one ever gone missing. There is no fallback now: without it this throws, and the server's
 * start-up check (config/checkEnv.js) stops before that with a plain message.
 */
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET is missing or shorter than 32 characters — set it in backend/.env');

export const JWT_SECRET = secret;
