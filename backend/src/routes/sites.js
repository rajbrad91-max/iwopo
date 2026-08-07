/**
 * 🌐 WEBSITE BUILDER
 *
 * A vendor picks one of five themes and then adjusts it — accent colour, two
 * fonts, their own words and photos — so the site reads as theirs without
 * handing them a page builder to get lost in.
 *
 * Two audiences, deliberately separated:
 *   /api/sites/my    the vendor editing their own site (auth, id from the token)
 *   /api/sites/:slug the public site (no auth, published only)
 *
 * A site is one row per vendor. Sections are jsonb rather than their own table:
 * they're read as a whole on every render and never queried across vendors, so
 * a table would buy joins and migrations and nothing else.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import prisma from '../config/prisma.js';
import { normalizeDomain, checkDomain, dnsInstructions } from '../lib/customDomain.js';
import { requireAuth } from '../middleware/auth.js';
import { SITES_DIR } from '../config/paths.js';
import * as objects from '../lib/objectStore.js';

const router = express.Router();

// same limit and temp folder as the logo upload — one way to take a file
const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 15 * 1024 * 1024 } });


/**
 * The public shape of a site. Both public routes — the /site/<slug> path and a
 * vendor's own domain — return exactly this, so a site cannot look one way on
 * one and another way on the other.
 */
function shapePublicSite(site) {
  const { vendors, ...rest } = site;
  return {
    ...rest,
    business_name: vendors?.business_name ?? null,
    logo_path: vendors?.logo_path ?? null,
    gallery_token: vendors?.gallery_token ?? null,
    vendor_slug: vendors?.slug ?? null,            // 🔗 for the Book Us link
  };
}

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;                       // 🔒 never from the body
}

/** The five themes. Fixed on purpose — five good ones beat fifty half-finished. */
export const THEMES = [
  /* The first two are built for photographers and carry a Gallery page, where a
     couple opens the album they were sent. The other three are for anyone, and
     show client logos and testimonials in that slot instead. The ids never
     change — only what they are called — so no vendor's saved theme moves. */
  { id: 'aperture', name: 'Aperture',      blurb: 'For photographers — full-bleed, quiet type',   accent: '#b8922a', kind: 'photo' },
  { id: 'atelier',  name: 'Contact Sheet', blurb: 'For photographers — an editorial grid',        accent: '#1f6f5c', kind: 'photo' },
  { id: 'vellum',   name: 'Vellum',        blurb: 'Warm, classic, wedding-leaning',              accent: '#a8574d', kind: 'general' },
  { id: 'noir',     name: 'Noir',          blurb: 'Dark, cinematic, video-first',                accent: '#c9a227', kind: 'general' },
  { id: 'bloom',    name: 'Bloom',         blurb: 'Light, airy, soft colour',                    accent: '#8a6fae', kind: 'general' },
];
const THEME_IDS = new Set(THEMES.map(t => t.id));

const FONTS = new Set(['Playfair Display', 'Inter', 'Poppins', 'Montserrat', 'Lora', 'Cormorant Garamond']);

const SECTION_TYPES = new Set(['text', 'image']);

/** Only fields a vendor may set, each cleaned to what the column can hold. */
function cleanBody(body) {
  const out = {};
  const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

  if (body.theme !== undefined && THEME_IDS.has(body.theme)) out.theme = body.theme;
  if (body.accent !== undefined && /^#[0-9a-fA-F]{6}$/.test(body.accent || '')) out.accent = body.accent;
  if (body.heading_font !== undefined && FONTS.has(body.heading_font)) out.heading_font = body.heading_font;
  if (body.body_font !== undefined && FONTS.has(body.body_font)) out.body_font = body.body_font;

  for (const [k, n] of [['site_title', 120], ['tagline', 200], ['about_heading', 120],
    ['contact_email', 160], ['contact_phone', 40], ['instagram', 200], ['facebook', 200]]) {
    if (body[k] !== undefined) out[k] = str(body[k], n);
  }
  if (body.about_body !== undefined) {
    out.about_body = body.about_body == null ? null : String(body.about_body).slice(0, 4000);
  }

  if (body.clients_heading !== undefined) out.clients_heading = str(body.clients_heading, 160);
  if (body.gallery_heading !== undefined) out.gallery_heading = str(body.gallery_heading, 160);
  if (body.gallery_body !== undefined) out.gallery_body = str(body.gallery_body, 600);

  // 🤝 names or logos of people they have worked with
  if (Array.isArray(body.clients)) {
    out.clients = body.clients.slice(0, 24).map((c, i) => ({
      id: String(c.id || `c${Date.now()}${i}`).slice(0, 24),
      name: str(c.name, 120),
      // an uploaded logo, stored the same way a section image is
      logo: str(c.logo, 300),
    })).filter(c => c.name || c.logo);        // an empty row is not a client
  }

  // 💬 what a few of them said. Short on purpose — the brief asks for one or
  // two sentences, and a wall of text stops reading as a testimonial.
  if (Array.isArray(body.testimonials)) {
    out.testimonials = body.testimonials.slice(0, 6).map((t, i) => ({
      id: String(t.id || `t${Date.now()}${i}`).slice(0, 24),
      quote: t.quote == null ? null : String(t.quote).slice(0, 400),
      author: str(t.author, 120),
      role: str(t.role, 120),
    })).filter(t => t.quote);                 // a quote with no words is nothing
  }

  // 🧱 the vendor's own blocks, in the order they arrive. Capped so nobody can
  // make their own page unloadable.
  if (Array.isArray(body.sections)) {
    out.sections = body.sections.slice(0, 12).map((x, i) => ({
      id: String(x.id || `s${Date.now()}${i}`).slice(0, 24),
      type: SECTION_TYPES.has(x.type) ? x.type : 'text',
      heading: str(x.heading, 120),
      body: x.body == null ? null : String(x.body).slice(0, 4000),
      // only kept on an image section, so switching one back to text doesn't
      // leave an orphan filename attached to it
      image: x.type === 'image' ? str(x.image, 300) : null,
    }));
  }

  return out;
}

/** A web address a vendor can actually be given: lowercase, hyphens, no spaces. */
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || null;
}

const PUBLIC_FIELDS = {
  theme: true, accent: true, heading_font: true, body_font: true,
  site_title: true, tagline: true, about_heading: true, about_body: true,
  contact_email: true, contact_phone: true, instagram: true, facebook: true,
  sections: true, clients: true, testimonials: true, clients_heading: true,
  gallery_heading: true, gallery_body: true,
  slug: true, published: true,
  cover_photo: true, cover_focus: true, portfolio: true,
};

/* ─────────────────────────── vendor's own site ─────────────────────────── */

// GET /api/sites/my → the vendor's site, created empty the first time they look
router.get('/my', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    let site = await prisma.vendor_sites.findUnique({ where: { vendor_id: v } });   // 🔒 own row
    if (!site) {
      const vendor = await prisma.vendors.findUnique({
        where: { id: v }, select: { business_name: true },
      });
      site = await prisma.vendor_sites.create({
        data: {
          vendor_id: v,
          site_title: vendor?.business_name || null,
          slug: null,                     // chosen deliberately, not guessed from the name
        },
      });
    }
    // the panel previews the real public component, and that component reads
    // the vendor's name, logo and handle — none of which live on the site row
    const meta = await prisma.vendors.findUnique({
      where: { id: v },                                                            // 🔒 own row
      select: { business_name: true, logo_path: true, slug: true },
    });
    res.json({ site, vendor: meta, themes: THEMES, fonts: [...FONTS] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/sites/my → save. Only the fields sent are written, so editing one
// thing can't blank the rest — the same trap the chatbot knowledge had.
router.put('/my', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const data = cleanBody(req.body);
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to save' });
    data.updated_at = new Date();
    /* An upsert rather than an update. update() on a row that does not exist
       throws P2025, which this handler's catch turns into a 500 — and a vendor
       has no site row until the first GET creates one. The panel always loads
       before it saves, so this is not reachable through the interface, but a
       500 is the wrong answer to "save my site" under any circumstances, and
       the fix costs nothing: the create branch writes the same cleaned fields
       against the vendor from the token. */
    const site = await prisma.vendor_sites.upsert({
      where: { vendor_id: v },                                                     // 🔒 own row
      update: data,
      create: { ...data, vendor_id: v },                                           // 🔒 from the token
    });
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/sites/my/slug → claim a web address. Refused if taken, so two vendors
// can never point at the same one.
router.put('/my/slug', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  const slug = slugify(req.body.slug);
  if (!slug) return res.status(400).json({ error: 'Give your site a web address' });
  if (slug.length < 3) return res.status(400).json({ error: 'That address is too short' });
  try {
    const taken = await prisma.vendor_sites.findFirst({
      where: { slug, NOT: { vendor_id: v } }, select: { id: true },
    });
    if (taken) return res.status(409).json({ error: 'That address is already taken' });
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v }, data: { slug, updated_at: new Date() },              // 🔒 own row
    });
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/sites/my/publish → { published: bool }. A site needs an address
// before it can go live, otherwise there is nowhere for it to be.
router.put('/my/publish', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  const on = !!req.body.published;
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { slug: true },                              // 🔒 own row
    });
    if (on && !cur?.slug) return res.status(400).json({ error: 'Choose a web address first' });
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: { published: on, published_at: on ? new Date() : null, updated_at: new Date() },
    });
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────────────────────────── public site ─────────────────────────────── */

// GET /api/sites/:slug → a published site. Unpublished returns 404 rather than
// 403: an unfinished site shouldn't announce that it exists.
//
// It carries what the four sections need — the vendor's id so Book Us can open
// their real inquiry form, their gallery token so Portfolio and the Client
// Section point at galleries that already exist, and a handful of album covers
// so Portfolio has something to show without a second request.
/* ══════════════════════════════════════════════════════════════════════════
   🌐 Custom domains

   A vendor points their own domain here and their site answers on it. We host
   and design; they own the name. Nothing is switched on until DNS proves the
   domain really points at this server — otherwise anyone could claim a domain
   they don't own and have us chase certificates for it.
   ══════════════════════════════════════════════════════════════════════════ */

// PUBLIC: the site for whichever domain this request arrived on.
// The Host header is the credential here, and it is set by nginx from the real
// request line — a body or query value would be trivially forgeable.
router.get('/by-host', async (req, res) => {
  try {
    const host = normalizeDomain(req.headers['x-forwarded-host'] || req.headers.host);
    if (!host) return res.status(404).json({ error: 'Unknown site' });

    const site = await prisma.vendor_sites.findFirst({
      where: { custom_domain: host, domain_status: 'live', published: true },
      include: { vendors: { select: { business_name: true, logo_path: true, gallery_token: true, slug: true } } },
    });
    // An unverified or unpublished domain is a 404, not a redirect to somebody
    // else's site — a wrong answer here shows one vendor's work on another's
    // domain, which is worse than showing nothing.
    if (!site) return res.status(404).json({ error: 'Unknown site' });
    res.json({ site: shapePublicSite(site) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VENDOR: what domain do I have, and where is it up to?
router.get('/domain', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v) return res.status(400).json({ error: 'No vendor' });
    const site = await prisma.vendor_sites.findUnique({
      where: { vendor_id: Number(v) },              // 🔒 own row only
      select: { custom_domain: true, domain_status: true, domain_verified_at: true },
    });
    res.json({
      domain: site?.custom_domain || '',
      status: site?.domain_status || 'none',
      verified_at: site?.domain_verified_at || null,
      instructions: await dnsInstructions(site?.custom_domain || ''),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VENDOR: claim a domain, or clear it. Claiming never makes it live — it only
// records the intent and hands back the records to add.
router.put('/domain', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    if (!v) return res.status(400).json({ error: 'No vendor' });

    const raw = req.body.domain;
    if (!raw) {
      // updateMany rather than update: with no row there is simply nothing to
      // clear, and that should not be an error
      await prisma.vendor_sites.updateMany({
        where: { vendor_id: v },                                                   // 🔒 own row
        data: { custom_domain: null, domain_status: 'none', domain_verified_at: null },
      });
      return res.json({ domain: '', status: 'none' });
    }

    const domain = normalizeDomain(raw);
    if (!domain) return res.status(400).json({ error: "That doesn't look like a domain name." });

    const taken = await prisma.vendor_sites.findFirst({
      where: { custom_domain: domain, NOT: { vendor_id: v } }, select: { id: true },
    });
    if (taken) return res.status(409).json({ error: 'That domain is already in use here.' });

    const fields = { custom_domain: domain, domain_status: 'pending', domain_verified_at: null };
    await prisma.vendor_sites.upsert({
      where: { vendor_id: v },                                                     // 🔒 own row
      update: fields,
      create: { ...fields, vendor_id: v },                                         // 🔒 from the token
    });
    res.json({ domain, status: 'pending', instructions: await dnsInstructions(domain) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VENDOR: check whether the records have landed yet. Read-only against DNS;
// this is what has to pass before a certificate is ever requested.
router.post('/domain/check', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    if (!v) return res.status(400).json({ error: 'No vendor' });
    const site = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { custom_domain: true },
    });
    if (!site?.custom_domain) return res.status(400).json({ error: 'No domain set' });

    const result = await checkDomain(site.custom_domain);
    // 'verified' is as far as this endpoint goes. Going 'live' means a
    // certificate and an nginx vhost, which is a separate, deliberate step.
    await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: {
        domain_status: result.ok ? 'verified' : 'pending',
        domain_verified_at: result.ok ? new Date() : null,
      },
    });
    res.json({ ...result, domain: site.custom_domain, status: result.ok ? 'verified' : 'pending' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:slug', async (req, res) => {
  try {
    const site = await prisma.vendor_sites.findFirst({
      where: { slug: req.params.slug, published: true },
      select: {
        ...PUBLIC_FIELDS,
        vendor_id: true,
        vendors: { select: { business_name: true, logo_path: true, gallery_token: true, slug: true } },
      },
    });
    if (!site) return res.status(404).json({ error: 'Site not found' });


    res.json({ site: shapePublicSite(site) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ──────────────────────────── site photos ─────────────────────────────── */

/**
 * 📸 Photos for a vendor's site.
 *
 * Two uses, one pipeline: the cover behind the home section, and an image on a
 * section. Both are resized on upload — a hero straight off a camera is 8MB and
 * would make the site crawl on a phone — and both are stored per vendor under
 * the site storage folder.
 *
 * Replacing a photo deletes the one it replaces. Without that, a vendor trying
 * three covers leaves two orphans on disk forever, and nothing would ever clean
 * them up because nothing else knows they existed.
 */
function siteDirFor(vendorId) {
  const dir = path.join(SITES_DIR, String(vendorId));            // 🔒 one folder per vendor
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeSitePhoto(vendorId, file) {
  if (!file) return;
  try {
    // basename only — a stored name must never be able to walk out of the folder
    const p = path.join(siteDirFor(vendorId), path.basename(file));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* a leftover file is not worth failing the request over */ }
}

/**
 * Every photo on a vendor's site goes through here, so there is one answer to
 * "what format and how big" rather than a different one per upload route.
 *
 * 2000px on the LONG edge — passing the same number for both width and height
 * with fit:inside bounds whichever side is larger, so a portrait and a landscape
 * both come out at 2000 on their long side rather than a portrait being blown up
 * or a landscape being under-sized. WebP because it is roughly a third the bytes
 * of JPEG at the same quality, and these are photographs on a public page where
 * load time is the whole experience.
 */
const MAX_EDGE = 2000;

async function storeImage(vendorId, tmpPath) {
  const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.webp`;
  const local = path.join(siteDirFor(vendorId), fname);
  await sharp(tmpPath)
    .rotate()                                       // honour the camera's orientation
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(local);
  fs.unlinkSync(tmpPath);

  /* ☁️ Also to R2 when it is configured. The local copy is kept on purpose:
     the reader below prefers the object and falls back to disk, so a failure
     to reach R2 costs a slower read rather than a missing photograph. That is
     what lets this be switched on one prefix at a time.

     🔒 The key carries the vendor id from the caller's token, never from
     anything the request supplied. */
  if (await objects.enabled(objects.PUBLIC)) {
    try {
      await objects.putObject(objects.PUBLIC, objects.keyFor(vendorId, 'sites', fname),
        fs.createReadStream(local), 'image/webp');
    } catch (e) {
      // not fatal — the file is on disk and will be served from there
      console.error('[sites] R2 upload failed for', fname, e.message);
    }
  }
  return fname;
}

// POST /api/sites/my/cover → the big photo behind the home section
router.post('/my/cover', requireAuth, upload.single('photo'), async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { cover_photo: true },     // 🔒 own row
    });
    const fname = await storeImage(v, req.file.path);
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: { cover_photo: fname, updated_at: new Date() },
    });
    removeSitePhoto(v, cur?.cover_photo);           // only after the new one is safely written
    res.json({ site });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/sites/my/cover → back to the plain themed background
router.delete('/my/cover', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { cover_photo: true },     // 🔒 own row
    });
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v }, data: { cover_photo: null, updated_at: new Date() },
    });
    removeSitePhoto(v, cur?.cover_photo);
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/sites/my/cover-focus → which part of the cover stays visible when
// it's cropped. A hero is a wide letterbox on a laptop and a tall strip on a
// phone, so without this the subject's head is the first thing cut off.
router.put('/my/cover-focus', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  const f = String(req.body.cover_focus || '').trim();
  if (!/^\d{1,3}% \d{1,3}%$/.test(f)) return res.status(400).json({ error: 'Bad focus point' });
  try {
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v }, data: { cover_focus: f, updated_at: new Date() },   // 🔒 own row
    });
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/sites/my/photo → an image for one section.
 *
 * Returns the stored filename for the caller to save against a section. It does
 * NOT write it to the row itself: a vendor may pick a picture and then change
 * their mind about the whole section, and an upload that has already edited the
 * page would leave the row referring to something they never kept.
 */
router.post('/my/photo', requireAuth, upload.single('photo'), async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const image = await storeImage(v, req.file.path);
    res.json({ image });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sites/photo/:vendorId/:file → serve a site photo.
//
// Public on purpose: these are the pictures on a public website. Both parts are
// forced through basename and Number so neither can walk out of the folder.
/**
 * These are a vendor's own website images, and are public by design — the id is
 * in the URL because the page they appear on is open to the world. basename()
 * keeps a crafted filename from climbing out of that vendor's folder.
 *
 * R2 is tried first and the disk second, so files that have not been migrated
 * yet keep working and a migrated one costs nothing extra.
 */
router.get('/photo/:vendorId/:file', async (req, res) => {
  const v = Number(req.params.vendorId);
  if (!Number.isInteger(v) || v <= 0) return res.status(404).end();
  const name = path.basename(req.params.file);

  if (await objects.enabled(objects.PUBLIC)) {
    try {
      const o = await objects.getStream(objects.PUBLIC, objects.keyFor(v, 'sites', name));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (o.contentType) res.setHeader('Content-Type', o.contentType);
      if (o.size) res.setHeader('Content-Length', o.size);
      return o.stream.pipe(res);                    // streamed, never buffered
    } catch { /* not in R2 yet — fall through to the disk */ }
  }

  const f = path.join(SITES_DIR, String(v), name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(f, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});


/* ─────────────────────────── portfolio photos ─────────────────────────── */

/**
 * 🖼️ The photographs a vendor chooses to show off.
 *
 * These are not the same thing as their galleries. A gallery belongs to one
 * client's event and is password-gated for that couple; a portfolio is the work
 * a vendor picks to put in front of strangers. Keeping them separate means a
 * vendor can show three frames from a wedding without exposing the album, and
 * can show work whose gallery has long since been taken down.
 *
 * Stored as an ordered jsonb list on the row rather than its own table: it is
 * read whole on every page render, never queried across vendors, and reordering
 * is a single write instead of a column of positions to keep consistent.
 */
/**
 * Twenty-five is a deliberate ceiling, not a technical one. A portfolio is an
 * edit — the twenty-five frames a vendor would actually show a client — and a
 * wall of two hundred says less than a chosen handful. It also keeps the page
 * fast enough to load on a phone at a venue.
 */
const MAX_PORTFOLIO = 25;

function cleanPortfolio(list) {
  return rawPortfolio(list).slice(0, MAX_PORTFOLIO);
}

/**
 * The same shape, but WITHOUT the cap.
 *
 * The cap belongs on what gets saved, not on what gets read back for comparison:
 * reading the existing row through the capped version meant anything past the
 * twenty-fifth was invisible to the tidy-up, so trimming a longer portfolio left
 * those files on disk with nothing pointing at them.
 */
function rawPortfolio(list) {
  return (Array.isArray(list) ? list : []).map((p, i) => ({
    id: String(p.id || `p${i}`).slice(0, 24),
    file: path.basename(String(p.file || '')).slice(0, 120),
    // a short heading for the piece of work — "Bridal makeup, Surrey"
    caption: p.caption == null ? null : String(p.caption).trim().slice(0, 90) || null,
    // and a sentence or two about it. This is what makes the page work for a
    // makeup artist or a florist rather than only a photographer: the picture
    // shows the result, the words say what was actually done.
    note: p.note == null ? null : String(p.note).trim().slice(0, 320) || null,
  })).filter(p => p.file);
}

// POST /api/sites/my/portfolio → add one photo to the end of the list
router.post('/my/portfolio', requireAuth, upload.single('photo'), async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { portfolio: true },        // 🔒 own row
    });
    const list = cleanPortfolio(cur?.portfolio);
    if (list.length >= MAX_PORTFOLIO) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: `A portfolio holds up to ${MAX_PORTFOLIO} photos` });
    }
    const file = await storeImage(v, req.file.path);
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: {
        portfolio: [...list, { id: `p${Date.now()}`, file, caption: null }],
        updated_at: new Date(),
      },
    });
    res.json({ site });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/sites/my/portfolio/:id/replace → put a different photograph in this
 * frame. The entry keeps its id, its position and its caption; only the file
 * changes. Adding a new one and deleting the old would send it to the end of
 * the collage and lose the words written about it.
 */
router.post('/my/portfolio/:id/replace', requireAuth, upload.single('photo'), async (req, res) => {
  const v = Number(vid(req));
  if (!v) return res.status(400).json({ error: 'No vendor' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { portfolio: true },        // 🔒 own row
    });
    const list = rawPortfolio(cur?.portfolio);
    const target = list.find(p => p.id === req.params.id);
    if (!target) { try { fs.unlinkSync(req.file.path); } catch { /* gone */ } 
      return res.status(404).json({ error: 'Photo not found' }); }

    const file = await storeImage(v, req.file.path);
    const old = target.file;
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: {
        portfolio: list.map(p => (p.id === req.params.id ? { ...p, file } : p)),
        updated_at: new Date(),
      },
    });
    // only after the row is written — a file removed before the update would
    // leave the page pointing at nothing if the write then failed
    removeSitePhoto(v, old);
    res.json({ site });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/sites/my/portfolio/:id → drop one photo, and its file with it
router.delete('/my/portfolio/:id', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { portfolio: true },        // 🔒 own row
    });
    const list = rawPortfolio(cur?.portfolio);
    const gone = list.find(p => p.id === req.params.id);
    if (!gone) return res.status(404).json({ error: 'Photo not found' });
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: { portfolio: list.filter(p => p.id !== req.params.id), updated_at: new Date() },
    });
    // only once the row no longer points at it — a file deleted before the write
    // fails leaves a portfolio entry with nothing behind it
    removeSitePhoto(v, gone.file);
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * PUT /api/sites/my/portfolio → replace the list: reorder, re-caption, or remove.
 *
 * Any photo dropped from the list has its file deleted here too. Without that a
 * vendor could clear their whole portfolio and leave forty files on disk that
 * nothing references and nothing will ever tidy up.
 */
router.put('/my/portfolio', requireAuth, async (req, res) => {
  const v = Number(vid(req));
  try {
    const cur = await prisma.vendor_sites.findUnique({
      where: { vendor_id: v }, select: { portfolio: true },        // 🔒 own row
    });
    const before = rawPortfolio(cur?.portfolio);
    const next = cleanPortfolio(req.body.portfolio);

    // a client can only keep files it already owned — it can't name someone
    // else's, and it can't invent one
    const owned = new Set(before.map(p => p.file));
    const kept = next.filter(p => owned.has(p.file));

    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },
      data: { portfolio: kept, updated_at: new Date() },
    });
    const keptFiles = new Set(kept.map(p => p.file));
    for (const p of before) if (!keptFiles.has(p.file)) removeSitePhoto(v, p.file);
    res.json({ site });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
