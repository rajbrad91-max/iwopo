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
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;                       // 🔒 never from the body
}

/** The five themes. Fixed on purpose — five good ones beat fifty half-finished. */
export const THEMES = [
  { id: 'aperture', name: 'Aperture', blurb: 'Full-bleed photography, quiet type', accent: '#b8922a' },
  { id: 'atelier',  name: 'Atelier',  blurb: 'Editorial, generous white space',    accent: '#1f6f5c' },
  { id: 'vellum',   name: 'Vellum',   blurb: 'Warm, classic, wedding-leaning',     accent: '#a8574d' },
  { id: 'noir',     name: 'Noir',     blurb: 'Dark, cinematic, video-first',       accent: '#c9a227' },
  { id: 'bloom',    name: 'Bloom',    blurb: 'Light, airy, soft colour',           accent: '#8a6fae' },
];
const THEME_IDS = new Set(THEMES.map(t => t.id));

const SECTION_TYPES = new Set(['hero', 'about', 'gallery', 'services', 'text', 'contact']);
const FONTS = new Set(['Playfair Display', 'Inter', 'Poppins', 'Montserrat', 'Lora', 'Cormorant Garamond']);

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

  if (Array.isArray(body.sections)) {
    out.sections = body.sections.slice(0, 20).map((s, i) => ({
      id: String(s.id || `s${i}`).slice(0, 20),
      type: SECTION_TYPES.has(s.type) ? s.type : 'text',
      heading: str(s.heading, 120),
      body: s.body == null ? null : String(s.body).slice(0, 4000),
      image: str(s.image, 300),
      album_token: str(s.album_token, 80),
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
  sections: true, slug: true, published: true,
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
    res.json({ site, themes: THEMES, fonts: [...FONTS] });
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
    const site = await prisma.vendor_sites.update({
      where: { vendor_id: v },                                                     // 🔒 own row
      data,
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
router.get('/:slug', async (req, res) => {
  try {
    const site = await prisma.vendor_sites.findFirst({
      where: { slug: req.params.slug, published: true },
      select: { ...PUBLIC_FIELDS, vendors: { select: { business_name: true, logo_path: true } } },
    });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const { vendors, ...rest } = site;
    res.json({
      site: {
        ...rest,
        business_name: vendors?.business_name ?? null,
        logo_path: vendors?.logo_path ?? null,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
