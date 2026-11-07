import { serverError } from './httpError.js';

/**
 * 📥 A download a browser opened itself — a link or a button that navigates — and that cannot be served shows a
 * small iwopo page saying why, with a way back; never raw JSON, never a raw error (Raj, 2026-11-07: a gallery tab
 * with no photos answered {"error":"No photos"}). The app's own requests (fetch) keep getting the JSON they read.
 */
const navigating = (req) => req.get('sec-fetch-mode') === 'navigate' || /text\/html/.test(req.get('accept') || '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function backHref(req) {
  try {
    const ref = new URL(req.get('referer') || '');
    return ref.host === req.get('host') ? ref.pathname + ref.search : '/';
  } catch { return '/'; }
}
const page = (title, message, back) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · iwopo</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#FFF7F0;color:#2C241C;font:16px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  main{max-width:440px;width:100%;padding:34px 30px;background:#fff;border:1px solid #EDE4DA;border-radius:16px;box-shadow:0 30px 70px -40px rgba(26,18,11,.45);text-align:center}
  img{width:40px;height:40px} h1{margin:14px 0 8px;font-size:22px;color:#1A120B} p{margin:0 0 22px;color:#6E6258}
  a{display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#C44D00,#E65C00 45%,#FF7A26);color:#fff;font-weight:700;text-decoration:none}
</style></head><body><main>
<img src="/iwopo-mark.png" alt="iwopo">
<h1>${esc(title)}</h1><p>${esc(message)}</p><a href="${esc(back)}">← Go back</a>
</main></body></html>`;

/** status + code: what the app's JSON says (unchanged); message: what a person reads on the page */
export function downloadFailed(req, res, status, code, message = code) {
  if (res.headersSent) return undefined;
  if (!navigating(req)) return res.status(status).json({ error: code });
  const title = status >= 500 ? 'Something went wrong' : status === 410 ? 'This link has expired' : 'Nothing to download';
  return res.status(status).type('html').send(page(title, message, backHref(req)));
}

/** a download that broke while being prepared: logged in full, shown to a person in plain words */
export function downloadCrashed(req, res, e) {
  if (res.headersSent) { console.error('[download]', req.originalUrl, e?.message); return undefined; }
  if (!navigating(req)) return serverError(res, e);
  console.error('[download]', req.originalUrl, e?.stack || e?.message);
  return downloadFailed(req, res, 500, 'download_failed', 'This download could not be prepared just now — please try again in a moment.');
}
