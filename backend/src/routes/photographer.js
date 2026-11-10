import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { getFeatures } from '../lib/entitlements.js';
import { limit } from '../middleware/rateLimit.js';
import { checkPassword, weakAnswer } from '../lib/passwordPolicy.js';
import { shootFor, uploadBegin, uploadComplete, announceUpload, renameShoot, imageLink } from '../lib/shoots.js';
import { notify } from './notifications.js';
import { sendAsVendor } from './email.js';
import { serverError } from '../lib/httpError.js';
import { FTP_HOST, ftpUser, waitingFiles } from '../lib/cameraFtp.js';
import { openPassword } from '../lib/sharePassword.js';

/**
 * 📸 The photographer's door to the Raw Selector (Raj, 2026-11-09). A crew member the vendor has set, in Crew
 * Management, to upload the photos of a booking signs in at /photographer with the email on their crew card, sees
 * ONLY those shoots, uploads RAW + JPEG straight to storage, and then tells the owner — or the owner and the client.
 * The upload and the announcement are lib/shoots.js, shared with the vendor's own upload (routes/rawsel.js).
 * Private: only while the vendor has the Raw Selector (rawsel). The editor's door is routes/editor.js; this mirrors it.
 */
const router = express.Router();
const SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me') + ':photographer';
const norm = (e) => String(e || '').trim().toLowerCase().slice(0, 200);
const sign = (row) => jwt.sign({ typ: 'photographer', cid: row.id }, SECRET, { expiresIn: '12h' });
const hasRawsel = async (vendorId) => { const f = await getFeatures(vendorId); return f.has('*') || f.has('rawsel'); };
const appUrl = (req) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const answer = (res, out) => (out.status ? res.status(out.status).json(out) : res.json(out));

/** the crew member behind the token — or a refusal (always answers; see routes/editor.js requireEditor) */
async function requirePhotographer(req, res, next) {
  try {
    let p;
    try { p = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), SECRET); } catch { return res.status(401).json({ error: 'Please sign in' }); }
    if (p?.typ !== 'photographer') return res.status(401).json({ error: 'Please sign in' });
    const cm = await prisma.crew_members.findUnique({ where: { id: Number(p.cid) } });
    if (!cm || !cm.password_hash || !await hasRawsel(cm.vendor_id)) return res.status(401).json({ error: 'Your access has ended' });
    req.crew = cm;
    next();
  } catch (e) { serverError(res, e); }
}

/** the booking's shoot, if this crew member is set to upload its photos */
async function myShoot(req, res) {
  const leadId = Number(req.params.leadId);
  const job = await prisma.lead_crew.findFirst({ where: { lead_id: leadId, crew_member_id: req.crew.id, uploads: true } });   // 🔒 assigned to upload
  const album = job ? await shootFor(req.crew.vendor_id, leadId) : null;
  if (!album) { res.status(404).json({ error: 'This shoot is not one of yours' }); return null; }
  return album;
}

const authLimit = limit({ name: 'photographer-auth', max: 10, windowMs: 15 * 60_000 });

/** first time: set a password — only for an email on a crew card that is set to upload somewhere */
router.post('/signup', authLimit, async (req, res) => {
  try {
    const email = norm(req.body?.email);
    const password = String(req.body?.password || '');
    const weak = await checkPassword(password);
    if (weak.length) return res.status(400).json(weakAnswer(weak));
    const rows = await prisma.crew_members.findMany({ where: { email: { equals: email, mode: 'insensitive' }, password_hash: null, lead_crew: { some: { uploads: true } } } });
    const open = [];
    for (const r of rows) if (await hasRawsel(r.vendor_id)) open.push(r);
    // the same answer whether the email is unknown or already joined — nobody can probe who is a photographer
    if (!email || !open.length) return res.status(400).json({ error: 'This email cannot sign up here. If you already have a password, sign in instead.' });
    const hash = await bcrypt.hash(password, 10);
    await prisma.crew_members.updateMany({ where: { id: { in: open.map(r => r.id) } }, data: { password_hash: hash, joined_at: new Date(), last_login_at: new Date() } });
    res.json({ token: sign(open[0]) });
  } catch (e) { serverError(res, e); }
});

router.post('/login', authLimit, async (req, res) => {
  try {
    const email = norm(req.body?.email);
    const rows = await prisma.crew_members.findMany({ where: { email: { equals: email, mode: 'insensitive' }, password_hash: { not: null } } });
    for (const r of rows) {
      if (await bcrypt.compare(String(req.body?.password || ''), r.password_hash) && await hasRawsel(r.vendor_id)) {
        await prisma.crew_members.update({ where: { id: r.id }, data: { last_login_at: new Date() } });
        return res.json({ token: sign(r) });
      }
    }
    res.status(401).json({ error: 'Email or password is not right' });
  } catch (e) { serverError(res, e); }
});

router.get('/me', requirePhotographer, async (req, res) => {
  try {
    const v = await prisma.vendors.findUnique({ where: { id: req.crew.vendor_id }, select: { business_name: true } });
    res.json({ name: req.crew.name, email: req.crew.email, studio: v?.business_name || '' });
  } catch (e) { serverError(res, e); }
});

/** the shoots this crew member uploads for, newest date first, with how far each has got */
router.get('/shoots', requirePhotographer, async (req, res) => {
  try {
    const jobs = await prisma.lead_crew.findMany({
      where: { crew_member_id: req.crew.id, uploads: true, leads: { vendor_id: req.crew.vendor_id } },   // 🔒
      select: { leads: { select: { id: true, name: true, event_type: true, event_date: true } } },
    });
    const albums = await prisma.albums.findMany({
      where: { vendor_id: req.crew.vendor_id, kind: 'shoot', lead_id: { in: jobs.map(j => j.leads.id) } },
      select: { id: true, lead_id: true, title: true, uploaded_at: true, _count: { select: { photos: true, raw_files: true } }, photos: { where: { ready: true }, select: { thumb_path: true }, orderBy: { filename: 'asc' }, take: 1 } },
    });
    const by = new Map(albums.map(a => [a.lead_id, a]));
    const covers = new Map(await Promise.all(albums.map(async a => [a.lead_id, a.photos[0] ? await imageLink(req.crew.vendor_id, a.photos[0].thumb_path, `${a.id}-cover.webp`) : null])));
    const shoots = jobs.map(({ leads: l }) => {
      const a = by.get(l.id);
      return { id: l.id, name: a?.title || l.name || 'Client', event: l.event_type || '', date: l.event_date, jpegs: a?._count.photos || 0, raws: a?._count.raw_files || 0, notified: a?.uploaded_at || null, ftp: req.crew.ftp_lead_id === l.id, cover: covers.get(l.id) || null };
    }).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    res.json({ shoots });
  } catch (e) { serverError(res, e); }
});

/** 📡 his camera FTP login (the vendor creates it in Crew Management), and how many files wait in it */
router.get('/ftp', requirePhotographer, async (req, res) => {
  try {
    const c = req.crew;
    if (!c.ftp_password_enc) return res.json({ host: FTP_HOST, user: null });
    res.json({ host: FTP_HOST, port: 21, user: ftpUser(c.id), password: openPassword(c.ftp_password_enc), shoot: c.ftp_lead_id, waiting: waitingFiles(c.id) });
  } catch (e) { serverError(res, e); }
});

/** 📡 the camera's uploads go to this shoot — or, off, to none (they wait in the FTP folder) */
router.post('/shoots/:leadId/ftp', requirePhotographer, async (req, res) => {
  try {
    const a = await myShoot(req, res); if (!a) return;
    const on = !!req.body?.on;
    const next = on ? a.lead_id : (req.crew.ftp_lead_id === a.lead_id ? null : req.crew.ftp_lead_id);
    await prisma.crew_members.update({ where: { id: req.crew.id }, data: { ftp_lead_id: next } });
    res.json({ ftp: next === a.lead_id });
  } catch (e) { serverError(res, e); }
});

/** 🏷️ rename the shoot (the name travels to its gallery) */
router.put('/shoots/:leadId/name', requirePhotographer, async (req, res) => {
  try {
    const a = await myShoot(req, res); if (!a) return;
    const title = await renameShoot(req.crew.vendor_id, a, req.body?.name);
    if (!title) return res.status(400).json({ error: 'A name is needed' });
    res.json({ name: title });
  } catch (e) { serverError(res, e); }
});

router.post('/shoots/:leadId/begin', requirePhotographer, async (req, res) => {
  try {
    const a = await myShoot(req, res); if (!a) return;
    answer(res, await uploadBegin(req.crew.vendor_id, a, req.body?.files));
  } catch (e) { serverError(res, e); }
});

router.post('/shoots/:leadId/complete', requirePhotographer, async (req, res) => {
  try {
    const a = await myShoot(req, res); if (!a) return;
    res.json(await uploadComplete(req.crew.vendor_id, a, req.body?.items, req.crew.name || req.crew.email));
  } catch (e) { serverError(res, e); }
});

router.post('/shoots/:leadId/notify', requirePhotographer, async (req, res) => {
  try {
    const a = await myShoot(req, res); if (!a) return;
    answer(res, await announceUpload({ v: req.crew.vendor_id, album: a, who: req.crew.name || req.crew.email, client: !!req.body?.client, appUrl: appUrl(req), notify, sendAsVendor }));
  } catch (e) { serverError(res, e); }
});

export default router;
