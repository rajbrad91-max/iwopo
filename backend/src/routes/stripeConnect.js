import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { serverError } from '../lib/httpError.js';
import { connectReady, connectUrl, finishConnect, disconnect, accountOf, handleConnectEvent } from '../lib/stripeConnect.js';

/* 💳 Stripe Connect for vendors (lib/stripeConnect.js). The vendor is always the one in the token — never one named by the request. */
const router = express.Router();
const APP_URL = process.env.APP_URL || 'https://iwopo.com';
const vendorOf = (req) => Number(req.user?.vendor_id) || null;

router.get('/status', requireAuth, async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const a = await accountOf(v);
    res.json({ ready: await connectReady(), connected: !!a, account: a ? `…${a.stripe_account_id.slice(-6)}` : null, since: a?.stripe_connected_at || null });
  } catch (e) { serverError(res, e); }
});

router.get('/start', requireAuth, async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    if (!await connectReady()) return res.status(503).json({ error: 'Card payments are being set up — please try again soon.' });
    const u = await prisma.users.findUnique({ where: { id: Number(req.user.id) }, select: { email: true } });
    res.json({ url: await connectUrl(v, u?.email) });
  } catch (e) { serverError(res, e); }
});

// Stripe sends the vendor back here; the vendor is the one the signed state names
router.get('/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect(`${APP_URL}/panel/settings?stripe=cancelled`);
    await finishConnect(req.query.state, req.query.code);
    res.redirect(`${APP_URL}/panel/settings?stripe=connected`);
  } catch { res.redirect(`${APP_URL}/panel/settings?stripe=error`); }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try { await disconnect(v); res.json({ ok: true }); } catch (e) { serverError(res, e); }
});

export default router;

// 🔔 card payments on connected accounts — mounted before express.json(), the signature needs the raw bytes
export const connectWebhook = express.Router();
connectWebhook.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const r = await handleConnectEvent(req.body.toString('utf8'), req.headers['stripe-signature']);
    res.status(r.ok ? 200 : 400).json({ received: r.ok });
  } catch (e) { serverError(res, e); }
});
