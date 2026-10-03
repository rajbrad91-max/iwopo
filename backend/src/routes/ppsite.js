/**
 * 🚪 The way through to Raj's own website admin.
 *
 * ⚠️ PRIVATE. Behind gate('ppsite'), which is is_private — no subscriber can
 * see it, buy it, or reach it. It exists because Perfect Poses is Raj's own
 * business running on his own separate database, and he wanted one door
 * rather than two passwords.
 *
 * ⚠️ This mints a PROOF, not a session. It does not hand over an iwopo token
 * and the other system does not accept one: keeping the secrets separate is
 * what stops a break in either place opening both.
 */
import express from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/* ⚠️ requireAuth FIRST, on the route itself. gate() only asks whether a
   vendor is entitled; with no vendor at all it has nothing to refuse. */
router.get('/enter', requireAuth, (req, res) => {
  /* and belt and braces: only Raj's own vendor, named, because this door
     opens a DIFFERENT system's admin and an entitlement granted by mistake
     should not be enough on its own */
  if (Number(req.user?.vendor_id) !== 1) {
    return res.status(403).json({ error: 'Not available.' });
  }
  const secret = process.env.PPSITE_BRIDGE_SECRET;
  const base = process.env.PPSITE_URL;
  if (!secret || !base) {
    return res.status(503).json({ error: 'The Perfect Poses site is not connected yet.' });
  }

  /* a fresh nonce each time, so a proof cannot be replayed even inside its
     thirty-second life */
  const t = Date.now();
  const n = crypto.randomBytes(12).toString('hex');
  const s = crypto.createHmac('sha256', secret).update(`${t}.${n}`).digest('hex');

  res.json({ url: `${base}/pp-api/bridge/enter?t=${t}&n=${n}&s=${s}` });
});

export default router;
