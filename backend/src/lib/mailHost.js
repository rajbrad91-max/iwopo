/**
 * 📧 The name iwopo gives itself when it connects to a mail server (SMTP "EHLO").
 *
 * Left alone, the mailer announces the machine's own name ("srv1799161"), which is not a real domain — and Google's
 * SMTP relay refuses that outright ("421 4.7.0 Try again later"), so password resets and sign-in codes failed
 * (2026-10-30). iwopo's own domain is what it is. APP_URL decides it, so staging and live each announce their own.
 */
export const EHLO_NAME = (() => {
  try { return new URL(process.env.APP_URL || 'https://iwopo.com').hostname; } catch { return 'iwopo.com'; }
})();

/**
 * 🧪 Addresses that can never receive mail (RFC 2606 / 6761): example.com, example.net, example.org, and anything
 * under .example, .test, .invalid or .localhost. They are what test data uses (Raj, 2026-11-20 — the stress test of
 * 300 fake inquiries), so iwopo never sends to them: no bounces coming back to the vendor's inbox, and nothing that
 * makes a mail provider think the account is sending junk. A real address is never matched.
 */
const NEVER_DELIVERED = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;
const domainOf = (a) => String(a?.address ?? a ?? '').replace(/^.*</, '').replace(/>.*$/, '').trim().split('@')[1] || '';
export const isTestAddress = (a) => NEVER_DELIVERED.test(domainOf(a));
const listOf = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [v]);

/**
 * 📤 The one way iwopo opens a mail connection. A nodemailer transport whose sendMail drops test addresses from
 * to / cc / bcc first; when nobody real is left it does not connect at all and says so in the log.
 */
export function mailTransport(nodemailer, opts) {
  const t = nodemailer.createTransport({ name: EHLO_NAME, ...opts });
  const send = t.sendMail.bind(t);
  t.sendMail = async (msg) => {
    const keep = {};
    for (const k of ['to', 'cc', 'bcc']) keep[k] = listOf(msg[k]).filter(a => !isTestAddress(a));
    if (!keep.to.length && !keep.cc.length && !keep.bcc.length) {
      console.log('[mail] test address, not sent:', listOf(msg.to).map(domainOf).join(', '), '·', String(msg.subject || '').slice(0, 60));
      return { skipped: true, accepted: [], rejected: [], messageId: null, response: 'not sent: a test address' };
    }
    const out = { ...msg };
    for (const k of ['to', 'cc', 'bcc']) { if (msg[k] != null) out[k] = keep[k].length ? keep[k] : undefined; }
    return send(out);
  };
  return t;
}
