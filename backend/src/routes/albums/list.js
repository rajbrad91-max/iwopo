/**
 * 📚 The album list, making an album, and the gallery settings and theme.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11). Mounted by routes/albums.js in
 * the original order.
 */
import express from 'express';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { hashSharePassword, sealPassword } from '../../lib/sharePassword.js';
import { getFeatures } from '../../lib/entitlements.js';
import { serverError } from '../../lib/httpError.js';
import { ownVendorId } from '../../lib/vendorScope.js';
import { cleanPw, cleanCategory, publicAlbum, checkGalleryPasswords } from './shared.js';

const router = express.Router();

const THEME_DEFAULTS = {
  heading_font: 'Playfair Display', body_font: 'Jost',
  bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f',
  title_text: 'Private gallery', subtitle_text: 'Your photos, ready to view and download',
  tagline_text: '',
};

router.get('/', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    /* 🎥 Galleries and live shoots are the same row with a different rule
       about who sees what, but they are not the same LIST — a photographer
       looking for a wedding to deliver should not scroll past a week of live
       shoots to find it. Defaults to galleries, so every existing caller keeps
       behaving exactly as it did. */
    const kind = req.query.kind === 'liveshoot' ? 'liveshoot' : 'gallery';

    const albums = await prisma.albums.findMany({
      where: { vendor_id: v, kind },              // 🔒 tenancy
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { photos: true } } },
    });
    // how many photos are flagged selected, per album (one grouped query, not N)
    const picked = await prisma.photos.groupBy({
      by: ['album_id'],
      where: { vendor_id: v, is_selected: true },   // 🔒 tenancy (photos carry vendor_id directly)
      _count: { _all: true },
    });
    const pickedBy = new Map(picked.map(r => [r.album_id, r._count._all]));

    /* Counted apart, because a film is not a photograph. The single total read
       "1 photos" for an album holding one film and no photographs at all. */
    const byKind = await prisma.photos.groupBy({
      by: ['album_id', 'kind'],
      where: { vendor_id: v },                       // 🔒 tenancy
      _count: { _all: true },
    });
    const kindOf = new Map();
    for (const r of byKind) {
      const cur = kindOf.get(r.album_id) || { photo: 0, video: 0 };
      cur[r.kind === 'video' ? 'video' : 'photo'] += r._count._all;
      kindOf.set(r.album_id, cur);
    }

    const rows = albums.map(({ _count, ...a }) => {
      const k = kindOf.get(a.id) || { photo: 0, video: 0 };
      return {
        ...a,
        photo_count: k.photo,
        video_count: k.video,
        selected_count: pickedBy.get(a.id) || 0,
        // 🟢 every Zip downloaded, for the gallery as it is now (lib/galleryDownloads.js)
        all_downloaded: a.downloads_complete_count != null && a.downloads_complete_count === k.photo + k.video,
      };
    });
    res.json({ albums: rows.map(publicAlbum) });
  } catch (e) { serverError(res, e); }
});

// 🔒 create album
router.post('/', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { title, category, guest_username, admin_username,
    client_email, exp_enabled, exp_from_date, exp_date, exp_notes, face_ai } = req.body;
  /* ⚠️ Trimmed BEFORE hashing. The client's login trims what they type, so a
     password saved with a stray space — easy when a prefix ends in one — could
     never be matched however correctly it was typed. */
  const guest_password = cleanPw(req.body.guest_password);
  const admin_password = cleanPw(req.body.admin_password);
  if (!title) return res.status(400).json({ error: 'Title required' });
  const pwErr = await checkGalleryPasswords(ownVendorId(req), [guest_password, admin_password]);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    // 16 bytes, matching the rest of the app. Six was 48 bits — short enough
    // that guessing gallery links was worth someone's time, and a gallery is
    // the most private thing here. Existing links keep working.
    const token = crypto.randomBytes(16).toString('hex');
    /* 🔒 kind comes from the BODY, so it has to be checked against what this
       vendor actually holds. Without this, any vendor could post
       kind:"liveshoot" and get a selfie-gated album — the delivery half of a
       private feature — even though gate() keeps them out of every route that
       reads one. The audit caught exactly that: a vendor without the feature
       created one and got 201. */
    const wantsLive = req.body?.kind === 'liveshoot';
    if (wantsLive) {
      const feats = await getFeatures(v);
      /* getFeatures returns a SET, not an array — gate() uses .has() and so
         must this. My .includes() threw, which happened to refuse the request
         and so LOOKED like the guard working. A test that passes for the wrong
         reason is worse than one that fails. */
      if (!feats.has('liveshoot')) {
        return res.status(402).json({ error: 'Live Shoot is not enabled on this account.' });
      }
    }

    const album = await prisma.albums.create({
      data: {
        vendor_id: v, title,
        category: cleanCategory(category),
        /* 🎥 gallery unless asked otherwise — an unknown value must never
           silently create something with different rules about who sees it */
        kind: wantsLive ? 'liveshoot' : 'gallery',
        guest_username: guest_username || null,
        guest_password: await hashSharePassword(guest_password),
        guest_password_enc: sealPassword(guest_password),
        admin_username: admin_username || null,
        admin_password: await hashSharePassword(admin_password),
        admin_password_enc: sealPassword(admin_password),
        client_email: client_email || null,
        exp_enabled: !!exp_enabled,
        exp_from_date: exp_from_date ? new Date(exp_from_date) : null,
        exp_date: exp_date ? new Date(exp_date) : null,
        exp_notes: exp_notes || null,
        face_ai: !!face_ai,
        public_token: token,
      },
    });
    res.status(201).json({ album: publicAlbum(album) });
  } catch (e) { serverError(res, e); }
});

// 🔒 confirmed bookings (for auto-fill name + phone) — status 'booked'
router.get('/booking-options', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const bookings = await prisma.leads.findMany({
      where: { vendor_id: v, status: 'booked', archived_at: null, name: { not: null } }, // 🔒 tenancy
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json({ bookings });
  } catch (e) { serverError(res, e); }
});

// 🔒 update album
router.put('/settings', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const { pw_prefix, spw_prefix } = req.body;
  try {
    const data = {
      pw_prefix: pw_prefix || '',
      spw_prefix: spw_prefix || '',
    };
    await prisma.album_settings.upsert({
      where: { vendor_id: v },                    // 🔒 tenancy
      update: data,
      create: { vendor_id: v, ...data },
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🔒 album settings GET — per vendor
router.get('/settings', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  try {
    const row = await prisma.album_settings.findUnique({
      where: { vendor_id: v },                    // 🔒 tenancy
      select: { pw_prefix: true, spw_prefix: true },
    });
    const vendor = await prisma.vendors.findUnique({
      where: { id: v },
      select: { gallery_token: true },
    });
    const settings = row || { pw_prefix: '', spw_prefix: '' };
    settings.gallery_token = vendor?.gallery_token || null;
    res.json({ settings });
  } catch (e) { serverError(res, e); }
});

// 🎨 gallery theme GET — per vendor
router.get('/theme', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  try {
    const theme = await prisma.gallery_theme.findUnique({ where: { vendor_id: v } }); // 🔒 tenancy
    res.json({ theme: theme || { ...THEME_DEFAULTS } });
  } catch (e) { serverError(res, e); }
});

// 🎨 gallery theme PUT — per vendor
router.put('/theme', requireAuth, async (req, res) => {
  const v = ownVendorId(req);
  const t = { ...THEME_DEFAULTS, ...req.body };
  try {
    const data = {
      heading_font: t.heading_font, body_font: t.body_font,
      bg_color: t.bg_color, heading_color: t.heading_color, accent_color: t.accent_color,
      sub_color: t.sub_color, title_text: t.title_text, subtitle_text: t.subtitle_text,
      tagline_text: t.tagline_text,
    };
    await prisma.gallery_theme.upsert({
      where: { vendor_id: v },                    // 🔒 tenancy
      update: data,
      create: { vendor_id: v, ...data },
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

export default router;
