/**
 * 🔐 The password rules as a live checklist under the box (mirrors backend/src/lib/passwordPolicy.js — the server
 * checks the same things, plus a private data-breach check, and has the final word).
 */
export const PASSWORD_MIN = 10;
const COMMON = ['password', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'trustno1', 'abc123', 'changeme', 'secret', 'master', 'login', 'iwopo', 'wedding', 'photography', 'photographer'];
const SEQUENCES = /(0123|1234|2345|3456|4567|5678|6789|7890|abcd|bcde|qwer|wert|asdf|sdfg|zxcv)/;

/** [{ label, ok }] for the checklist; ok === true when that rule is met */
export function passwordChecklist(pw, { email = '', name = '', business = '' } = {}) {
  const p = String(pw || ''), low = p.toLowerCase(), squashed = low.replace(/[\s._-]+/g, '');
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
  const own = [String(email).split('@')[0], name, business].map(x => String(x || '').toLowerCase().replace(/[\s._-]+/g, '')).filter(x => x.length >= 4);
  const core = squashed.replace(/[^a-z]/g, '');
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: p.length >= PASSWORD_MIN && p.length <= 128 },
    { label: '3 of: lowercase, UPPERCASE, number, symbol (or 16+ characters)', ok: p.length >= 16 || kinds >= 3 },
    { label: 'Nothing common or predictable', ok: !!p && !COMMON.includes(core) && !/^(.)\1+$/.test(p) && !SEQUENCES.test(low) },
    { label: 'Not your name, business or email', ok: !!p && !own.some(x => squashed.includes(x)) },
  ];
}
export const passwordReady = (pw, who) => passwordChecklist(pw, who).every(r => r.ok);
