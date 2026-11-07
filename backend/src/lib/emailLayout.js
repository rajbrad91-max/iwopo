/**
 * ✉️ The one look of every email iwopo sends (Raj, 2026-11-07): a slim dark header with the mark, a thin accent line,
 * a white card, details in a quiet panel with figures in monospace, one clear button, a small footer. Tables and
 * inline styles only — what email clients actually render.
 */
const APP = () => process.env.APP_URL || 'https://iwopo.com';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** A button: primary is the solid accent, secondary an outline. */
export const emailButton = (href, label, primary = false) => `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:8px;font:600 14px ${SANS};text-decoration:none;${primary ? 'background:#C44D00;color:#ffffff' : 'background:#ffffff;color:#0F1418;border:1px solid #D0D5DA'}">${esc(label)}</a>`;

/** Label / value rows in the quiet panel — values in monospace, like a receipt. */
export const emailRows = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;background:#F6F7F8;border:1px solid #E4E7EA;border-radius:10px">
${rows.filter(Boolean).map(([k, v], i, a) => `<tr><td style="padding:11px 16px;${i < a.length - 1 ? 'border-bottom:1px solid #E4E7EA;' : ''}font:13px ${SANS};color:#5B6770">${esc(k)}</td><td align="right" style="padding:11px 16px;${i < a.length - 1 ? 'border-bottom:1px solid #E4E7EA;' : ''}font:600 13px ${MONO};color:#0F1418">${esc(v)}</td></tr>`).join('\n')}
</table>`;

/** A one-time code, big and spaced, in monospace. */
export const emailCode = (code) => `<p style="margin:6px 0 22px;padding:16px 0;text-align:center;background:#F6F7F8;border:1px solid #E4E7EA;border-radius:10px;font:700 30px ${MONO};letter-spacing:10px;color:#0F1418">${esc(code)}</p>`;

/** A paragraph in the body text style. */
export const emailText = (html, { muted = false } = {}) => `<p style="margin:0 0 16px;font:${muted ? '13px' : '15px'}/1.6 ${SANS};color:${muted ? '#5B6770' : '#1E2A32'}">${html}</p>`;

/** The whole email around a body. preheader: the grey line inbox lists show next to the subject. */
export function emailShell({ title, preheader = '', body }) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#EEF0F2">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F2;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#0F1418;border-radius:12px 12px 0 0;padding:18px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${APP()}/iwopo-mark.png" alt="" width="26" height="26" style="display:block"></td>
      <td style="padding-left:10px;font:700 18px ${SANS};letter-spacing:-.01em;color:#ffffff">iwopo</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:#C44D00;background-image:linear-gradient(90deg,#A33C00,#E65C00,#FF8A3D)">&nbsp;</td></tr>
  <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:30px 28px 26px">
    <h1 style="margin:0 0 14px;font:700 21px/1.3 ${SANS};letter-spacing:-.01em;color:#0F1418">${esc(title)}</h1>
    ${body}
  </td></tr>
  <tr><td style="padding:18px 6px 0;font:12px/1.6 ${SANS};color:#7A858C">
    IWOPO, LLC · <a href="${APP()}" style="color:#7A858C;text-decoration:underline">iwopo.com</a><br>
    Sent automatically from noreply@iwopo.com — replies to this address aren't read. For help, use Help in your panel.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
