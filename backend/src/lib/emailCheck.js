/**
 * 📧 Does an email address look wrong? (Raj's lesson for Tornado, 2026-10-11:
 * "immediately flag any suspicious-looking or disposable email address, and
 * explain why".) Only clear signs — a false alarm is worse than none:
 *   broken (two @, spaces, no domain), a throwaway service, a test domain, a
 *   misspelled big provider (gmial.com), or an obviously typed-in placeholder.
 * Returns the reason in plain words, or null when it looks fine.
 */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'yopmail.com', 'yopmail.net',
  'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'spamgourmet.com',
  'burnermail.io', 'mail.tm', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'inboxkitten.com', 'mailpoof.com',
  'discard.email', 'spambox.us', 'mytemp.email', 'crazymailing.com', 'luxusmail.org', 'emailfake.com',
]);
const TEST = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'test.ca', 'email.com', 'domain.com', 'abc.com', 'xyz.com', 'asdf.com']);
const TYPO = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmal.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outloo.com': 'outlook.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com',
};

export function emailWarning(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e) return null;
  if ((e.match(/@/g) || []).length !== 1) return 'it has more than one @ sign — it cannot receive email';
  if (/\s/.test(e)) return 'it contains a space — it cannot receive email';
  const [local, domain] = e.split('@');
  if (!local || !domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return 'the part after @ is not a real domain';
  if (DISPOSABLE.has(domain)) return `${domain} is a throwaway email service — people use it to avoid being contacted`;
  if (TEST.has(domain)) return `${domain} is a placeholder / test address, not a real inbox`;
  if (TYPO[domain]) return `"${domain}" looks like a typo of ${TYPO[domain]} — email to it will probably bounce`;
  if (/^(test|asdf|qwerty|abc|xyz|aaa+|none|na|no|fake|noemail|nomail)\d*$/.test(local)) return `"${local}@" looks typed in just to fill the box`;
  return null;
}
