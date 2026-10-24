/**
 * 🔐 iwopo's password rules — ONE set, used by sign-up, password reset, change password and the editor portal
 * (Raj, 2026-10-23). The same checks run on the screen as a live checklist (frontend/src/lib/passwordRules.js).
 *  - 10 to 128 characters
 *  - 3 of: lowercase · UPPERCASE · number · symbol — or a 16+ character passphrase
 *  - not common or predictable, not the person's name / business / email
 *  - not found in a known data breach (Have I Been Pwned "range" check: only the first 5 characters of the
 *    password's SHA-1 leave the server, never the password; if the check can't run, the other rules still apply)
 * Passwords are stored as bcrypt hashes (cost 12) — never the password itself.
 */
import crypto from 'crypto';

export const PASSWORD_MIN = 10, PASSWORD_MAX = 128;
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qwerty', 'qwerty123', 'qwertyuiop',
  'letmein', 'welcome', 'welcome1', 'welcome123', 'admin', 'admin123', 'administrator', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'trustno1', 'abc123', 'abcdef', 'abcd1234', '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000',
  'changeme', 'secret', 'master', 'login', 'iwopo', 'iwopo123', 'wedding', 'wedding123', 'photography', 'photographer', 'canada', 'vancouver', 'surrey']);
const SEQUENCES = /(0123|1234|2345|3456|4567|5678|6789|7890|abcd|bcde|qwer|wert|asdf|sdfg|zxcv)/;

/** what a password still needs, in plain words (empty = fine), without the breach check */
export function passwordProblems(pw, { email = '', name = '', business = '' } = {}) {
  const p = String(pw || ''), low = p.toLowerCase(), squashed = low.replace(/[\s._-]+/g, '');
  const out = [];
  if (p.length < PASSWORD_MIN) out.push(`at least ${PASSWORD_MIN} characters`);
  if (p.length > PASSWORD_MAX) out.push(`${PASSWORD_MAX} characters at most`);
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
  if (p.length < 16 && kinds < 3) out.push('3 of: lowercase, UPPERCASE, a number, a symbol (or 16+ characters)');
  const core = squashed.replace(/[^a-z]/g, '');
  if (COMMON.has(squashed) || COMMON.has(core) || /^(.)\1+$/.test(p) || SEQUENCES.test(low)) out.push('nothing common or predictable (like Password123 or 1234)');
  const own = [String(email).split('@')[0], name, business].map(x => String(x || '').toLowerCase().replace(/[\s._-]+/g, '')).filter(x => x.length >= 4);
  if (own.some(x => squashed.includes(x))) out.push('not your name, business or email');
  return out;
}

/** found in a known breach? (null when the check could not run) */
export async function breachedCount(pw) {
  const sha = crypto.createHash('sha1').update(String(pw)).digest('hex').toUpperCase();
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const line = (await r.text()).split('\n').find(l => l.startsWith(sha.slice(5)));
    return line ? Number(line.split(':')[1]) || 0 : 0;
  } catch { return null; }
}

/** every problem, including the breach check — the server's final word */
export async function checkPassword(pw, who = {}) {
  const out = passwordProblems(pw, who);
  if (!out.length && (await breachedCount(pw)) > 0) out.push('a password that has not appeared in a data breach');
  return out;
}

/** the error answer for a weak password */
export const weakAnswer = (problems) => ({ error: `Choose a stronger password: ${problems.join(' · ')}.`, problems });
