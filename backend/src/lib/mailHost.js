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
