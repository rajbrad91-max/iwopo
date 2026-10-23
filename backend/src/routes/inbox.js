import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as gm from '../lib/inboxGmail.js';

/* 📧 /api/inbox — the owner's private inbox (mounted behind the 'comms' feature gate, like Calls & Messages). */
const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);
const callbackUrl = (req) => `https://${String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0]}/api/inbox/gmail/callback`;
const fail = (res, e) => res.status(e.message === 'not_connected' ? 409 : 400).json({ error: e.message === 'not_connected' ? 'Email is not connected yet.' : e.message === 'inbox_key_missing' ? 'Email is not set up yet.' : e.message });

router.get('/gmail/status', requireAuth, async (req, res) => { try { res.json(await gm.status(vid(req))); } catch (e) { fail(res, e); } });
router.get('/gmail/connect', requireAuth, async (req, res) => { try { res.json({ url: await gm.connectUrl(vid(req), callbackUrl(req)) }); } catch (e) { fail(res, e); } });
router.post('/gmail/disconnect', requireAuth, async (req, res) => { try { await gm.disconnect(vid(req)); res.json({ ok: true }); } catch (e) { fail(res, e); } });
router.get('/gmail/threads', requireAuth, async (req, res) => { try { res.json({ threads: await gm.listThreads(vid(req), String(req.query.q || '').slice(0, 200)) }); } catch (e) { fail(res, e); } });
router.get('/gmail/threads/:id', requireAuth, async (req, res) => { try { res.json(await gm.getThread(vid(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post('/gmail/send', requireAuth, async (req, res) => {
  try { const b = req.body || {}; res.json(await gm.sendEmail(vid(req), { to: b.to, subject: b.subject, body: b.body, threadId: b.threadId, replyTo: b.replyTo })); }
  catch (e) { fail(res, e); }
});
export default router;

/* Google sends the browser back here after sign-in — no panel login on this hop; the signed state says whose mailbox. */
export const inboxCallback = express.Router();
inboxCallback.get('/', async (req, res) => {
  try { await gm.finishConnect(req.query.state, req.query.code, callbackUrl(req)); res.redirect('/panel/comms?tab=email&connected=1'); }
  catch (e) { res.redirect('/panel/comms?tab=email&email_error=' + encodeURIComponent(e.message)); }
});
