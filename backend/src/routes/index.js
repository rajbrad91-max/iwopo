import express from 'express';
import geoip from 'geoip-lite';
import fs from 'fs';
import path from 'path';
import { GALLERIES_ROOT } from '../config/paths.js';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { getAllSettings, setSetting } from '../lib/settings.js';
import { queueStatus, enqueueAlbum } from '../lib/faceQueue.js';
import { deleteCollection } from '../lib/faceAWS.js';
import { platformMail } from './email.js';
import nodemailer from 'nodemailer';
import { getSetting } from '../lib/settings.js';
import { DEFAULT_MODEL } from '../lib/wopoAssistant.js';
import { clientIp } from '../lib/clientIp.js';
import { limit } from '../middleware/rateLimit.js';
import { serverError } from '../lib/httpError.js';
import { adminOverview } from '../lib/adminOverview.js';
import { planCards, planCompare } from '../lib/planCatalog.js';
import { syncOffer } from '../lib/stripeCoupons.js';
import { visitorCurrency } from '../lib/localPrice.js';
import { stripe, stripeReady } from '../lib/stripe.js';
import { myReferrals } from '../lib/referrals.js';
import { EHLO_NAME } from '../lib/mailHost.js';   // 📧 connect as a real domain — Google's relay refuses a bare machine name

const router = express.Router();

// 🧵 Super admin: live face-queue status (backlog, load, concurrency, aws mode)
router.get('/face-queue/status', requireAuth, requireSuperAdmin, async (req, res) => {
  try { res.json(await queueStatus()); }
  catch (e) { serverError(res, e); }
});

// 🔒 Super admin: platform settings (face engine + AWS creds)
router.get('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const s = await getAllSettings();
    // mask secret
    if (s.gdoc_service_account) s.gdoc_service_account = '(saved — hidden)';   // 📄 the Google Doc key never leaves the server
    if (s.aws_secret_key) s.aws_secret_key = s.aws_secret_key.slice(0, 4) + '••••••••' + s.aws_secret_key.slice(-4);
    // every R2 secret is masked the same way — enough to tell which key is in
    // place, never enough to use
    for (const k of ['r2_secret_access_key', 'r2_private_secret_access_key', 'r2_public_secret_access_key']) {
      if (s[k]) s[k] = s[k].slice(0, 4) + '••••••••' + s[k].slice(-4);
    }
    /* 📧 The mail password never goes back out, not even partially. Unlike an
       access key ID there is nothing useful to recognise it by, so the whole
       thing is replaced rather than clipped. */
    if (s.smtp_pass) s.smtp_pass = '••••••••';
    if (s.stripe_connect_webhook_secret) s.stripe_connect_webhook_secret = '••••••••';   // 💳 never goes back out
    for (const k of ['anthropic_api_key', 'agent_api_key', 'gemini_api_key', 'deepgram_api_key', 'local_voice_token']) {
      if (s[k]) s[k] = s[k].slice(0, 4) + '••••••••' + s[k].slice(-4);
    }
    res.json({ settings: s });
  } catch (e) { serverError(res, e); }
});

// 🔄 Super admin: reset ALL face indexing (for engine switch → re-index)
//
// This wipes face data platform-wide so every album re-picks its engine on the
// next index. It must also tear down the AWS side: `album_faces` rows AND the
// per-album Rekognition collections. Leaving those behind would orphan face data
// on AWS (which is billed) while the local rows disappear, so an album would look
// un-indexed while AWS still held its faces.
router.post('/settings/reindex-all', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // which albums currently hold an AWS collection? (needed before we clear the flag)
    const awsAlbums = await prisma.albums.findMany({
      where: { has_collection: true },
      select: { id: true },
    });

    const r = await prisma.photos.updateMany({
      // Prisma.DbNull clears the column. A plain `null` on a Json field writes
      // the JSON value `null` instead, which is not the same thing — the column
      // stays non-NULL and every "faces IS NULL" check would miss it.
      data: { faces: Prisma.DbNull, face_count: 0, face_indexed: false, face_engine: null },
    });
    // clear per-album engine locks + cluster flags so each album re-picks fresh on next index
    await prisma.albums.updateMany({
      data: { face_engine_lock: null, faces_clustered: false, has_collection: false },
    });
    await prisma.photo_faces.deleteMany({});
    await prisma.face_clusters.deleteMany({});
    await prisma.album_faces.deleteMany({});      // ☁️ AWS face rows

    // ☁️ delete the collections themselves so AWS stops storing (and billing for)
    // faces whose photos we just un-indexed. Best effort per album — one failure
    // must not abort the rest.
    let collectionsDeleted = 0;
    for (const a of awsAlbums) {
      try { await deleteCollection(a.id); collectionsDeleted++; }
      catch (e) { console.error(`[reindex-all] collection ${a.id}:`, e.message); }
    }

    // the crop folders left by an older AWS build (crops are generated on demand
    // now, but a folder can still exist from before that change)
    let thumbDirs = 0;
    try {
      for (const vendorDir of fs.readdirSync(GALLERIES_ROOT, { withFileTypes: true })) {
        if (!vendorDir.isDirectory()) continue;
        const vPath = path.join(GALLERIES_ROOT, vendorDir.name);
        for (const albumDir of fs.readdirSync(vPath, { withFileTypes: true })) {
          if (!albumDir.isDirectory()) continue;
          const faceDir = path.join(vPath, albumDir.name, 'faces');
          if (fs.existsSync(faceDir)) { fs.rmSync(faceDir, { recursive: true, force: true }); thumbDirs++; }
        }
      }
    } catch (e) { console.error('[reindex-all] face thumb cleanup:', e.message); }

    // 🔄 …then RE-INDEX. The button says "Re-index all photos", so it must do
    // both halves. Albums are queued rather than indexed inline: a real album
    // takes minutes, which would time out the request and leave the admin
    // staring at a spinner. The queue is already throttled and load-aware, so
    // this never competes with client traffic.
    const albumsWithPhotos = await prisma.albums.findMany({
      where: { photos: { some: {} } },
      select: { id: true },
    });
    for (const a of albumsWithPhotos) enqueueAlbum(a.id);

    res.json({
      ok: true,
      reset: r.count,                    // photos cleared
      collections_deleted: collectionsDeleted,
      face_thumb_dirs_removed: thumbDirs,
      albums_queued: albumsWithPhotos.length,
      note: `Cleared ${r.count} photo(s) and queued ${albumsWithPhotos.length} album(s) for re-indexing. This runs in the background — watch the backlog counter.`,
    });
  } catch (e) { serverError(res, e); }
});

/**
 * 📧 POST /api/settings/platform/test-email → prove the settings work.
 *
 * Mail configuration fails quietly: a wrong port, a password the provider
 * rejects, a from-address the domain does not authorise. Every one of those
 * looks identical from the panel — a saved form and silence — and the first
 * anybody hears of it is a client who never got their gallery link.
 *
 * So this actually sends one, and reports what the mail server said.
 */
router.post('/settings/platform/test-email', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ error: 'Give an address to send the test to' });
    }

    const p = await platformMail();
    if (!p.ready) {
      return res.status(400).json({ error: 'Set the mail host, username and password first.' });
    }

    const t = nodemailer.createTransport({ name: EHLO_NAME, 
      host: p.host, port: p.port, secure: p.port === 465,
      auth: { user: p.user, pass: p.pass },
    });

    /* Checked before sending. verify() catches a wrong host, port or password
       and says which — sendMail on a bad connection often just times out. */
    try { await t.verify(); }
    catch (e) { return res.status(400).json({ error: 'The mail server refused the connection — ' + e.message }); }

    const info = await t.sendMail({
      from: `"${p.fromName}" <${p.from || p.user}>`,
      to,
      subject: 'iwopo — mail is working',
      text: 'If you are reading this, iwopo can send email.\n\nSent from your platform settings.',
      html: '<p>If you are reading this, <b>iwopo can send email</b>.</p><p style="color:#667">Sent from your platform settings.</p>',
    });

    res.json({ ok: true, to, from: p.from || p.user, response: info.response || null });
  } catch (e) {
    res.status(500).json({ error: 'Could not send — ' + e.message });
  }
});

/**
 * 📞 POST /api/settings/platform/test-quo → does the key actually work?
 *
 * Listing the account's phone numbers is the cheapest proof: it needs a valid
 * key and nothing else, and it hands back the number ids the backfill will
 * need anyway. A saved key that turns out to be wrong looks exactly like a
 * saved key that is right, until a week of calls has quietly not arrived.
 */
/**
 * 🤖 POST /api/settings/platform/test-ai → does the Claude key work?
 *
 * The cheapest possible call: one token back. A saved key that turns out to
 * be wrong looks exactly like a working one until somebody presses "create
 * lead from this call" in front of a client and nothing happens.
 */
router.post('/settings/platform/test-ai', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // which key: the AI Agent's (Settings) or the chatbot's (AI Chat → API Key)
    const agent = req.body?.which === 'agent';
    const key = await getSetting(agent ? 'agent_api_key' : 'anthropic_api_key', '');
    if (!key) return res.status(400).json({ error: agent ? 'Add the AI Agent key first.' : 'Add the chatbot key first.' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        // the model actually in use — testing a different one could pass while the real one fails
        model: agent ? ((await getSetting('agent_model', '')) || 'claude-haiku-5-5') : ((await getSetting('anthropic_model', '')) || DEFAULT_MODEL),
        max_tokens: 4,
        messages: [{ role: 'user', content: 'Reply with the word: ok' }],
      }),
    });
    if (!r.ok) {
      const b = await r.text().catch(() => '');
      /* 401 means the key; anything else is worth quoting, because "it failed"
         sends somebody to check their firewall for an hour. */
      return res.status(400).json({
        error: r.status === 401 ? 'Claude rejected that key.'
          : `Claude returned ${r.status}. ${b.slice(0, 140)}`,
      });
    }
    const d = await r.json();
    const said = (d?.content || []).map(c => c.text || '').join('').trim();
    res.json({ ok: true, model: d?.model || null, said });
  } catch (e) {
    res.status(400).json({ error: 'Could not reach Claude — ' + e.message });
  }
});


router.put('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const allowed = ['face_engine', 'aws_mode', 'aws_access_key', 'aws_secret_key', 'aws_region', 'anthropic_api_key', 'anthropic_model',
      /* 🤖 AI Agent has its own key (Raj, 2026-10-10), so Anthropic's bill
         shows the vendor's private assistant apart from the clients' chatbot */
      'agent_api_key', 'agent_model',
      // 🌪️ Tornado's voice on Gemini Live
      'gemini_api_key', 'gemini_voice', 'gemini_live_model',
      // 🎧 Tornado's optional paid ear (Deepgram); the phone only ever gets a short-lived token
      'deepgram_api_key',
      // 🔊 Tornado's voice on Raj's own PC (Kokoro af_heart over Tailscale); Charon speaks when the PC is off
      'local_voice_url', 'local_voice_token',
      'r2_account_id',
      // shared pair, used by either bucket that has none of its own
      'r2_access_key_id', 'r2_secret_access_key',
      // 🔒 private — galleries and File Flyer
      'r2_bucket_private', 'r2_private_access_key_id', 'r2_private_secret_access_key',
      // 🌐 public — website images and logos
      'r2_bucket_public', 'r2_public_access_key_id', 'r2_public_secret_access_key',
      'r2_public_url',
      /* 📧 Platform email. These were environment variables, which meant the
         one person who could set them had to edit a file on the server — so
         they were never set, and nothing in the product could send anything. */
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_from_name',
      // 💳 Stripe Connect — vendors' own Stripe accounts for client card payments (lib/stripeConnect.js)
      'stripe_connect_client_id', 'stripe_connect_webhook_secret',
    ];

    /* 🔒 One bucket for both classes would silently un-gate every client gallery
       and every File Flyer link at once: the album password and the share token
       stay in the database and stop meaning anything, because the object URL
       reaches the file without passing either. Refused, not warned about. */
    const priv = String(req.body.r2_bucket_private || '').trim().toLowerCase();
    const pub = String(req.body.r2_bucket_public || '').trim().toLowerCase();
    if (priv && pub && priv === pub) {
      return res.status(400).json({
        error: 'same_bucket',
        message: 'The private and public buckets must be different. Sharing one would make every gallery password and share link meaningless.',
      });
    }

    for (const k of allowed) {
      if (req.body[k] !== undefined && req.body[k] !== '' && !String(req.body[k]).includes('••••')) {
        await setSetting(k, req.body[k]);
      }
    }

    /* 🗑️ Removing a credential is a SEPARATE, explicit act.
       Saving skips empty values on purpose — the form sends every field on
       every save, and a masked or blank one must never wipe a working key by
       accident. But that left no way to remove one AT ALL: a leaked key could
       be replaced and never revoked, which is the case where you most want to
       empty the box and press save. Naming the keys makes clearing impossible
       to do by accident and possible to do at all. */
    const clear = Array.isArray(req.body.clear) ? req.body.clear : [];
    for (const k of clear) {
      if (allowed.includes(k)) await setSetting(k, '');
    }

    res.json({ ok: true, cleared: clear.filter(k => allowed.includes(k)) });
  } catch (e) { serverError(res, e); }
});

// 🌍 currency symbol per country
const CURRENCY = { US:'$', CA:'C$', GB:'£', IN:'₹', AU:'A$', EU:'€' };

// resolve a visitor's geo → { code, currency }
function geoFrom(req) {
  const ip = clientIp(req);
  const g = geoip.lookup(ip);
  if (!g) return { code: 'default', region: null, currency: '$' };
  // British Columbia exception → CA-BC
  const code = (g.country === 'CA' && g.region === 'BC') ? 'CA-BC' : g.country;
  const currency = CURRENCY[g.country] || '$';
  return { code, region: g.region, currency };
}

// pick the right price for a row given geo
// pick monthly+annual for a row given geo. country_prices values can be:
//   number (monthly only)  OR  { m: monthly, y: annual }
function geoPrice(row, geo, baseField = 'price', baseAnnualField = 'price_annual') {
  const cp = row.country_prices || {};
  let entry;
  if (geo.code !== 'default' && cp[geo.code] != null) entry = cp[geo.code];
  else if (geo.code === 'CA-BC' && cp['CA'] != null) entry = cp['CA'];
  else if (cp.default != null) entry = cp.default;

  if (entry != null) {
    if (typeof entry === 'object') return { m: Number(entry.m), y: entry.y != null ? Number(entry.y) : null };
    return { m: Number(entry), y: null }; // legacy number = monthly only
  }
  return { m: Number(row[baseField]), y: row[baseAnnualField] != null ? Number(row[baseAnnualField]) : null };
}

router.get('/hello', (req, res) => {
  res.json({ message: 'Hello from iwopo API! 👋' });
});

// 🔔 Super admin: live notification counts (topbar icons)
router.get('/admin/counts', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [messages, paid, trials] = await Promise.all([
      prisma.support_messages.count({ where: { seen: false, status: 'open' } }),
      prisma.vendors.count({ where: { status: 'active', seen_by_admin: false } }),
      prisma.vendors.count({ where: { status: 'trial', seen_by_admin: false } }),
    ]);
    res.json({ messages, paid, trials });
  } catch (e) { serverError(res, e); }
});

// 🔔 mark a group seen: 'messages' | 'paid' | 'trials'
router.put('/admin/counts/:group/seen', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    if (req.params.group === 'messages') await prisma.support_messages.updateMany({ where: { seen: false }, data: { seen: true } });
    else if (req.params.group === 'paid') await prisma.vendors.updateMany({ where: { status: 'active' }, data: { seen_by_admin: true } });
    else if (req.params.group === 'trials') await prisma.vendors.updateMany({ where: { status: 'trial' }, data: { seen_by_admin: true } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 📨 support messages list (super admin)
router.get('/admin/messages', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const messages = await prisma.support_messages.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ messages });
  } catch (e) { serverError(res, e); }
});


// 🔒 Super admin: full services incl. country_prices (for editor)
router.get('/admin/services', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    /* 🔒 Private features are not part of the product. They never appear in a
       catalogue, a price list or a plan — only a super admin can grant one to a
       particular vendor. */
    const services = await prisma.services.findMany({ where: { is_private: false }, orderBy: { id: 'asc' } });
    res.json({ services });
  } catch (e) { serverError(res, e); }
});

// Public: list all services (legacy) — geo-priced
router.get('/services', async (req, res) => {
  try {
    const geo = geoFrom(req);
    const rows = await prisma.services.findMany({ where: { is_private: false }, orderBy: { id: 'asc' } });   // 🔒 see above
    const services = rows.map(s => {
      const gp = geoPrice(s, geo);
      const { country_prices, ...pub } = s; // 🔒 don't expose all-country pricing publicly
      return { ...pub, price: gp.m, price_annual: gp.y ?? s.price_annual, currency: geo.currency, geo_code: geo.code };
    });
    res.json({ services, geo: geo.code, currency: geo.currency });
  } catch (e) { serverError(res, e); }
});

// 📋 Public: the plans as cards — the ONE list (lib/planCatalog.js), in USD (Raj, 2026-11-06)
router.get('/packages', async (req, res) => {
  try {
    const asked = String(req.query.currency || '').toUpperCase();   // an explicit currency (Super Admin asks for USD) beats the visitor's country
    const { plans, groups, notes } = await planCompare({ currency: /^[A-Z]{3}$/.test(asked) ? asked : visitorCurrency(req) });
    res.json({ packages: plans, compare: groups, compare_notes: notes });   // 📊 the cards, and the same plans as a table
  } catch (e) { serverError(res, e); }
});

// 🔒 Super admin: the same cards, for the price editor
router.get('/admin/packages', requireAuth, requireSuperAdmin, async (req, res) => {
  try { res.json({ packages: await planCards() }); } catch (e) { serverError(res, e); }
});

/* 🔓 What each plan UNLOCKS (2026-11-01, plans the one source since 2026-11-06). plan_features is what a vendor on a plan
   actually GETS, and every price card's lines are generated from it (lib/planCatalog.js), so a card cannot promise
   what the plan does not give. Super Admin sets it. Only public features can be chosen; private tools are never touched. */
const unlockCatalog = () => prisma.services.findMany({
  where: { feature_key: { not: null }, is_private: false }, orderBy: { id: 'asc' },
  select: { feature_key: true, name: true, icon: true },
});
router.get('/admin/plan-unlocks', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [catalog, plans] = await Promise.all([unlockCatalog(),
      prisma.plans.findMany({ select: { code: true, name: true, plan_features: { select: { feature_key: true } } } })]);
    res.json({ catalog, plans: plans.map(p => ({ code: p.code, name: p.name, features: p.plan_features.map(f => f.feature_key) })) });
  } catch (e) { serverError(res, e); }
});
router.put('/admin/plan-unlocks/:code', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const plan = await prisma.plans.findUnique({ where: { code: String(req.params.code) }, select: { id: true } });
    if (!plan) return res.status(404).json({ error: 'No plan with that code' });
    const allowed = (await unlockCatalog()).map(s => s.feature_key);
    const want = [...new Set((Array.isArray(req.body?.features) ? req.body.features : []).map(String))].filter(k => allowed.includes(k));
    await prisma.$transaction([
      prisma.plan_features.deleteMany({ where: { plan_id: plan.id, feature_key: { in: allowed } } }),   // only public ones
      ...(want.length ? [prisma.plan_features.createMany({ data: want.map(feature_key => ({ plan_id: plan.id, feature_key })) })] : []),
    ]);
    res.json({ ok: true, features: want });
  } catch (e) { serverError(res, e); }
});

/* 📋 Super admin: a plan's own fields, from the editable pricing table (Raj, 2026-11-07). The plans table is the one
   source the backend enforces — currentPlan, storage limits, chat limits, the trial at checkout, the public page —
   so an edit here is what vendors actually get. A renamed plan renames its Stripe product too. */
router.put('/admin/plans/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const plan = await prisma.plans.findUnique({ where: { id: Number(req.params.id) }, select: { id: true, name: true, stripe_product_id: true, price_monthly: true } });
    if (!plan) return res.status(404).json({ error: 'No plan with that id' });
    const text = (v, max) => (v === undefined ? undefined : String(v).trim().slice(0, max));
    const num = (v, lo, hi, whole) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v); if (!Number.isFinite(n)) return undefined;
      return Math.min(hi, Math.max(lo, whole ? Math.round(n) : Math.round(n * 100) / 100));
    };
    const data = {
      name: text(b.name, 40) || undefined, tagline: text(b.tagline, 90),
      price_monthly: num(b.price_monthly, 0, 100000), price_annual: num(b.price_annual, 0, 1000000),
      storage_gb: num(b.storage_gb, 1, 100000, true), chat_limit: num(b.chat_limit, 0, 1000000, true), trial_days: num(b.trial_days, 0, 365, true),
    };
    if (Array.isArray(b.highlights)) {
      // { label } or { label, coming: true } — the form the plans were seeded in, so a save that changes nothing leaves them as they were
      data.highlights = b.highlights.map(h => ({ label: String(h?.label || '').trim().slice(0, 80), ...(h?.coming ? { coming: true } : {}) })).filter(h => h.label).slice(0, 12);
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    const saved = await prisma.plans.update({ where: { id: plan.id }, data });
    if (data.name && data.name !== plan.name && plan.stripe_product_id && stripeReady()) {
      await stripe('POST', `/products/${plan.stripe_product_id}`, { name: `iwopo ${data.name}` }).catch(e => console.warn('[plans] Stripe product not renamed:', e.message));
    }
    res.json({ ok: true, plan: { id: saved.id, code: saved.code, name: saved.name } });
  } catch (e) { serverError(res, e); }
});

// 🔒 Super admin: update a STANDALONE SERVICE price
router.put('/services/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price, price_annual, price_annual_regular } = req.body;
  try {
    await prisma.services.update({
      where: { id: Number(req.params.id) },
      data: {
        price: price ?? 0,
        price_annual: price_annual ?? null,
        price_annual_regular: price_annual_regular ?? null,
      },
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🔒 Super admin: update a service's tiers (jsonb array)
router.put('/services/:id/tiers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { tiers } = req.body;
  try {
    await prisma.services.update({
      where: { id: Number(req.params.id) },
      data: { tiers: tiers || [] },              // Json column — no manual stringify
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🔒 Super admin: set country-specific prices (services or packages)
// body: { type:'service'|'package', country_prices:{ default:14.99, CA:18, 'CA-BC':20 } }
router.put('/country-prices/:type/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { type, id } = req.params;
  const { country_prices } = req.body;
  try {
    // the model is chosen from a fixed pair — never interpolated from user input
    const data = { country_prices: country_prices || {} };
    const where = { id: Number(id) };
    // 📋 plans are priced in USD only (Raj, 2026-11-06) — country prices are for services
    if (type !== 'service') return res.status(400).json({ error: 'Plans are priced in USD only' });
    await prisma.services.update({ where, data });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 🎁 OFFERS
// Public: list active offers
// 🔒 Super admin: list all offers (coupons are internal)
router.get('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const offers = await prisma.offers.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ offers });
  } catch (e) { serverError(res, e); }
});

// 🔒 Create offer
router.post('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { code, label, percent_off, starts_at, ends_at, applies_to } = req.body;
  if (!code || !percent_off) return res.status(400).json({ error: 'Missing code or percent' });
  try {
    const offer = await prisma.offers.create({
      data: {
        code: code.toUpperCase(),
        label: label || null,
        percent_off,
        starts_at: starts_at ? new Date(starts_at) : null,
        ends_at: ends_at ? new Date(ends_at) : null,
        applies_to: applies_to || 'all',
      },
    });
    // 🎟️ the same code in Stripe, so checkout takes it — a failure is said, the offer stays (it can be re-synced)
    const sync = await syncOffer(offer).catch(e => ({ synced: false, error: e.message }));
    res.status(201).json({ offer, stripe: sync });
  } catch (e) {
    if (e.code === 'P2002' || e.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    serverError(res, e);
  }
});

// Public: validate a coupon code (for checkout)
// applies_to: 'all' | 'service:ID' | 'package:ID'
router.get('/offers/validate/:code', async (req, res) => {
  try {
    const today = new Date();
    const offer = await prisma.offers.findFirst({
      where: {
        code: req.params.code.toUpperCase(),
        active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: today } }] },
          { OR: [{ ends_at: null }, { ends_at: { gte: today } }] },
        ],
      },
    });
    if (!offer) return res.status(404).json({ valid: false, error: 'Invalid or expired code' });
    // optional target check: ?target=service:12 or package:1
    const { target } = req.query;
    if (offer.applies_to !== 'all' && target && offer.applies_to !== target) {
      return res.status(400).json({ valid: false, error: 'Code not valid for this item' });
    }
    res.json({ valid: true, code: offer.code, percent_off: offer.percent_off, applies_to: offer.applies_to });
  } catch (e) { serverError(res, e); }
});

// 🔒 Toggle / delete offer
router.put('/offers/:id/toggle', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = await prisma.offers.findUnique({ where: { id } });
    if (!cur) return res.status(404).json({ error: 'Not found' });
    const offer = await prisma.offers.update({ where: { id }, data: { active: !cur.active } });   // active = NOT active
    const sync = await syncOffer(offer).catch(e => ({ synced: false, error: e.message }));   // 🎟️ Stripe follows
    res.json({ ok: true, stripe: sync });
  } catch (e) { serverError(res, e); }
});
router.delete('/offers/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const offer = await prisma.offers.findUnique({ where: { id: Number(req.params.id) } });
    if (offer) await syncOffer(offer, { removing: true }).catch(() => {});   // 🎟️ its Stripe code stops working first
    await prisma.offers.deleteMany({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

// 👥 REFERRALS — a signed-in vendor refers a friend's email (or shares their code); both get a free month when the
// friend pays for a plan (lib/referrals.js). The referrer is the account in the token, never an email from the
// request: until 2026-11-04 anyone, signed in or not, could file a referral in any vendor's name. 10 an hour each.
const referralLimit = limit({ name: 'referral', max: 10, windowMs: 60 * 60_000, perAccount: true, key: (r) => String(r.user?.id) });
router.post('/referrals', requireAuth, referralLimit, async (req, res) => {
  const friend_email = String(req.body?.friend_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friend_email)) return res.status(400).json({ error: "Enter your friend's email address" });
  try {
    const me = await prisma.users.findUnique({ where: { id: Number(req.user.id) }, select: { email: true } });
    if (!me?.email) return res.status(401).json({ error: 'Please sign in again' });
    const referrer_email = me.email.trim().toLowerCase();
    if (referrer_email === friend_email) return res.status(400).json({ error: "You can't refer yourself" });
    // the friend must be NEW
    const exists = await prisma.users.findFirst({ where: { email: { equals: friend_email, mode: 'insensitive' } }, select: { id: true } });
    if (exists) return res.status(409).json({ error: 'That email already has an iwopo account' });
    // the same friend twice is the same referral
    const already = await prisma.referrals.findFirst({ where: { referrer_email, friend_email } });
    if (already) return res.json({ referral: already });
    const referral = await prisma.referrals.create({ data: { referrer_email, friend_email } });
    res.status(201).json({ referral });
  } catch { res.status(500).json({ error: 'Could not save the referral — please try again.' }); }
});

// 🎟️ A vendor's own referral page: their code, share link, and the friends who joined (lib/referrals.js)
router.get('/referrals/mine', requireAuth, async (req, res) => {
  if (!req.user?.vendor_id) return res.status(400).json({ error: 'Not a vendor account' });
  try { res.json(await myReferrals(req.user.vendor_id, process.env.APP_URL || 'https://iwopo.com')); } catch (e) { serverError(res, e); }
});

// 🔒 Super admin: list all referrals
router.get('/referrals', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const referrals = await prisma.referrals.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ referrals });
  } catch (e) { serverError(res, e); }
});

// 🌍 Real seller stats for the super-admin dashboard.
//
// The dashboard used to draw a country chart from a hardcoded list — Canada 52,
// US 38 and so on — which read as real and was not. This returns what is
// actually in the table, including how many sellers have not set a country at
// all, so an empty platform looks empty instead of looking successful.
// 📊 GET /api/admin/overview — every Super Admin figure from the database (lib/adminOverview.js)
router.get('/admin/overview', requireAuth, requireSuperAdmin, async (req, res) => {
  try { res.json(await adminOverview()); } catch (e) { serverError(res, e); }
});

router.get('/admin/vendor-stats', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await prisma.vendors.groupBy({
      by: ['country'],
      _count: { _all: true },
    });
    const counted = rows.map(r => ({
      code: (r.country || '').trim(),
      count: r._count._all,
    }));
    const unset = counted.filter(c => !c.code).reduce((n, c) => n + c.count, 0);
    const countries = counted
      .filter(c => c.code)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    const total = counted.reduce((n, c) => n + c.count, 0);
    const byStatus = await prisma.vendors.groupBy({ by: ['status'], _count: { _all: true } });

    /* 🏷️ Vendors per profession — the trade each vendor chose (vendors.profession: at sign-up, or by loading a
       preset in their inquiry form). A vendor with none is counted as unset rather than guessed at. */
    const byProf = await prisma.vendors.groupBy({
      by: ['profession'],
      _count: { _all: true },
    });
    const professions = byProf
      .filter(p => p.profession)
      .map(p => ({ key: p.profession, count: p._count._all }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const profUnset = total - professions.reduce((n, p) => n + p.count, 0);

    res.json({
      total,
      unset,                                  // sellers with no country recorded
      countries,                              // [{ code, count }] busiest first
      professions,                            // [{ key, count }] busiest first
      professions_unset: Math.max(0, profUnset),
      statuses: byStatus.map(s => ({ status: s.status || 'unknown', count: s._count._all })),
    });
  } catch (e) { serverError(res, e); }
});

export default router;
