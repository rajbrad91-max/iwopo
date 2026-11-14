/**
 * ✉️ The emails iwopo sends to a vendor's clients, and the vendor's own wording for each (Raj, 2026-11-14).
 *
 * Every vendor gets the same set (Settings → Setup Email → Email templates). Until a vendor edits one, the
 * default below is used — word for word what was sent before templates existed, so nothing changes for anyone
 * who never opens the page. An edited one is stored in vendor_email_templates; "Reset to default" deletes it.
 *
 * Tags are written {like_this}. A tag a template does not use is simply not filled; a tag with no value
 * (a gallery without a password) becomes empty text.
 *
 * 🧑‍💻 HTML mode — an email sent as the vendor's own HTML design, with a plain-text copy made from it.
 * Private for now: only the accounts in HTML_EMAIL_ACCOUNTS (Raj's Perfect Poses login) see or send it,
 * until it becomes a Super Admin switch (Raj, 2026-11-14). For anyone else a stored design is ignored and
 * the plain text goes, so taking the feature away can never leave a client without an email.
 */
import sanitizeHtml from 'sanitize-html';
import prisma from '../config/prisma.js';

/** tags every email can use */
const COMMON = ['client_first_name', 'client_name', 'business_name'];

export const TAG_LABELS = {
  client_first_name: 'Client first name',
  client_name: 'Client full name',
  business_name: 'Your business name',
  link: 'Link',
  contract_title: 'Contract title',
  gallery_name: 'Gallery name',
  view_password: 'Password to view',
  pick_password: 'Password to pick',
  admin_password: 'Admin password',
  guest_password: 'Guest password',
};

/** sample values, for the preview only */
export const SAMPLE = {
  client_first_name: 'Priya', client_name: 'Priya Sharma', link: 'https://yourname.iwopo.com/portal/…',
  contract_title: 'Videography Agreement', gallery_name: 'Priya & Arjun', view_password: 'rose24', pick_password: 'lily57',
  admin_password: 'rose24', guest_password: 'lily57',
};

/** the order on the page is the order a booking goes through. `button` = the words on the link's button in a design */
export const EMAILS = {
  packages: {
    label: 'Packages sent',
    when: 'When you press Send packages on a lead. You can still change the words before it goes.',
    tags: [...COMMON, 'link'],
    button: 'View your packages',
    subject: 'Your packages are ready 🎉',
    body: `Hi {client_name},

Thank you for your enquiry — I've put together some options for you.

You can view them here:
{link}

Take your time, and let me know if you'd like anything adjusted.

Best wishes`,
  },
  signed_contract: {
    label: 'Signed contract',
    when: 'By itself, when you confirm the deposit or the client pays online. The signed contract is attached.',
    tags: [...COMMON, 'contract_title'],
    subject: 'Your signed contract — {contract_title}',
    body: `Hi {client_first_name},

Thank you, your booking is confirmed. Your signed contract is attached for your records.

Warm regards,
{business_name}`,
  },
  photos_ready: {
    label: 'Photos ready to pick',
    when: 'When the photos are uploaded and you choose to tell the client, so they can view and pick their favourites.',
    tags: [...COMMON, 'gallery_name', 'link', 'view_password', 'pick_password'],
    button: 'View your photos',
    subject: 'Your photos are ready to view — {gallery_name}',
    body: `Hi {gallery_name},

Your photos are ready to view and pick your favourites:
{link}

Password to view: {view_password}
Password to pick your photos: {pick_password}

{business_name}`,
  },
  edited_ready: {
    label: 'Edited photos delivered',
    when: 'When the edited photos are delivered and the client is told.',
    tags: [...COMMON, 'gallery_name', 'link', 'view_password'],
    button: 'View your photos',
    subject: 'Your edited photos are ready — {gallery_name}',
    body: `Hi {gallery_name},

Your edited photos are ready:
{link}

Password: {view_password}

{business_name}`,
  },
  gallery_shared: {
    label: 'Gallery shared',
    when: 'When you press Send on a gallery. The link opens your client section, where your galleries are listed.',
    tags: [...COMMON, 'link', 'admin_password', 'guest_password'],
    button: 'Open your gallery',
    subject: 'Your Photos Are Ready 📸',
    body: `Dear {client_name},

Your photos are now ready to view and download! 🎉

Guest Password: {guest_password}
(Share this with friends and family)

Admin Password: {admin_password}
(Use this to manage or remove photos)

Thank you for choosing us! 💛`,
  },
};

export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;
export const HTML_MAX = 100_000;

/* ── 🔒 who may use HTML mode ── */
const HTML_EMAIL_ACCOUNTS = String(process.env.HTML_EMAIL_ACCOUNTS || 'info@perfectposes.ca')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/** HTML mode is on for a vendor whose own account (the owner's login) is on the list */
export async function htmlAllowed(vendorId) {
  const owner = await prisma.users.findFirst({
    where: { vendor_id: Number(vendorId), role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true },
  });
  return !!owner?.email && HTML_EMAIL_ACCOUNTS.includes(owner.email.trim().toLowerCase());
}

/* ── HTML helpers ── */
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** text between tags: quotes stay readable in the vendor's code ("I've", not "I&#39;ve") */
const escText = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * 🔒 What may stay in a vendor's HTML: the ordinary building blocks of an email (tables, text, images, links,
 * inline styles and a <style> block). Scripts, frames, forms, event handlers and javascript: links are removed.
 */
export function cleanEmailHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'center', 'font', 'span', 'div', 'style', 'hr'],
    allowVulnerableTags: true,   // only for <style>: email designs need it, and no script can survive the list above
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'background', 'border', 'cellpadding', 'cellspacing', 'role', 'dir', 'lang', 'title', 'color', 'face', 'size', 'colspan', 'rowspan'],
      a: ['href', 'target', 'name', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style', 'border'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'cid'] },
    allowProtocolRelative: false,
  });
}

/** the plain-text copy of a design, for email apps that do not show HTML */
export function htmlToText(html) {
  const ent = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
  return String(html || '')
    .replace(/<(style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
      const t = inner.replace(/<[^>]+>/g, '').trim();
      return t && t !== href ? `${t}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|h[1-6]|tr|li|table|center)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m, k) => ent[k])
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 🎨 The simple design HTML mode starts from: the vendor's logo (or name), their current words, the link as a
 * button, their name at the foot. The contract's fonts (Lora / Open Sans). A starting point to edit or replace.
 */
export function starterHtml(kind, text, { logoUrl = '', businessName = '' } = {}) {
  const d = EMAILS[kind];
  const sans = "'Open Sans',Arial,Helvetica,sans-serif";
  const head = logoUrl
    ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(businessName)}" width="120" style="max-width:120px;height:auto;border:0;">`
    : `<div style="font-family:Lora,Georgia,serif;font-size:22px;color:#1f2937;">{business_name}</div>`;
  const paras = String(text || d.body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    if (p === '{link}' || (d.button && p.split('\n').some(l => l.trim() === '{link}'))) {
      const rest = p.split('\n').filter(l => l.trim() !== '{link}').map(escText).join('<br>');
      return `${rest ? `<p style="margin:0 0 12px;">${rest}</p>` : ''}
        <p style="margin:0 0 22px;text-align:center;"><a href="{link}" style="display:inline-block;padding:12px 26px;border-radius:8px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;">${escText(d.button || 'Open')}</a></p>`;
    }
    return `<p style="margin:0 0 16px;">${p.split('\n').map(escText).join('<br>')}</p>`;
  }).join('\n        ');
  return `<div style="background:#f5f5f4;padding:32px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
    <tr><td style="padding:28px 32px 10px;text-align:center;">${head}</td></tr>
    <tr><td style="padding:10px 32px 18px;font-family:${sans};font-size:15px;line-height:1.65;color:#1f2937;">
        ${paras}
    </td></tr>
  </table>
  <p style="margin:16px 0 0;text-align:center;font-family:${sans};font-size:12px;color:#78716c;">{business_name}</p>
</div>`;
}

/** {tag} → value, for the tags this email knows; anything else in braces is left as the vendor wrote it */
export function fillTags(text, kind, values, esc = (s) => s) {
  const known = new Set(EMAILS[kind]?.tags || []);
  return String(text || '').replace(/\{([a-z_]+)\}/g, (m, tag) => (known.has(tag) ? esc(String(values[tag] ?? '')) : m));
}

/** what this vendor's email says, before tags are filled: their own wording, or the default */
export async function templateFor(vendorId, kind) {
  const d = EMAILS[kind];
  if (!d) throw new Error(`Unknown email: ${kind}`);
  const own = await prisma.vendor_email_templates.findUnique({
    where: { vendor_id_kind: { vendor_id: Number(vendorId), kind } },   // 🔒 this vendor's own row
    select: { subject: true, body: true, mode: true, html: true },
  });
  return { subject: own?.subject || d.subject, body: own?.body || d.body, mode: own?.mode || 'text', html: own?.html || '', edited: !!own };
}

/**
 * The email ready to send: { subject, body, html? } with the tags filled. `html` is there only when the vendor
 * sends this email as an HTML design and may; `body` is then the plain-text copy of that design.
 * `values` gives the email's own tags (link, passwords…); the client and business names are filled here
 * when they are not given.
 */
export async function renderEmail(vendorId, kind, values = {}) {
  const t = await templateFor(vendorId, kind);
  let biz = values.business_name;
  if (biz === undefined) biz = (await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { business_name: true } }))?.business_name || '';
  const name = String(values.client_name ?? '').trim();
  const all = { ...values, business_name: biz, client_name: name, client_first_name: values.client_first_name ?? (name.split(/\s+/)[0] || '') };
  const subject = fillTags(t.subject, kind, all).replace(/\s+/g, ' ').trim();
  if (t.mode === 'html' && t.html && await htmlAllowed(vendorId)) {
    const inner = cleanEmailHtml(fillTags(t.html, kind, all, escHtml));
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head><body style="margin:0;padding:0;">${inner}</body></html>`;
    return { subject, body: htmlToText(inner), html };
  }
  return { subject, body: fillTags(t.body, kind, all) };
}
