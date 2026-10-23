import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as gm from '../lib/inboxGmail.js';
import { unreadCalls } from '../lib/commsSeen.js';
import privateDb from '../config/privateDb.js';

/* 📧 /api/inbox — the owner's private inbox (mounted behind the 'comms' feature gate, like Calls & Messages). */
const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);
const callbackUrl = (req) => `https://${String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0]}/api/inbox/gmail/callback`;
const fail = (res, e) => res.status(e.message === 'not_connected' ? 409 : 400).json({ error: e.message === 'not_connected' ? 'Email is not connected yet.' : e.message === 'inbox_key_missing' ? 'Email is not set up yet.' : e.message });

/* 🔴 GET /api/inbox/counts — unread per tab, for the sidebar number and the tab badges */
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const [calls, email] = await Promise.all([unreadCalls(v, privateDb).catch(() => 0), gm.unreadCount(v).catch(() => 0)]);
    const c = { calls, email, instagram: 0, whatsapp: 0 };
    res.json({ ...c, total: c.calls + c.email + c.instagram + c.whatsapp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/gmail/status', requireAuth, async (req, res) => { try { res.json(await gm.status(vid(req))); } catch (e) { fail(res, e); } });
/* 🔑 the vendor's own Google keys: GET shows only whether they exist (+ a hint), PUT saves them (secret is write-only) */
router.get('/gmail/app', requireAuth, async (req, res) => { try { res.json(await gm.appInfo(vid(req))); } catch (e) { fail(res, e); } });
router.put('/gmail/app', requireAuth, async (req, res) => { try { await gm.saveApp(vid(req), req.body || {}); res.json(await gm.appInfo(vid(req))); } catch (e) { fail(res, e); } });
router.get('/gmail/connect', requireAuth, async (req, res) => { try { res.json({ url: await gm.connectUrl(vid(req), callbackUrl(req)) }); } catch (e) { fail(res, e); } });
router.post('/gmail/disconnect', requireAuth, async (req, res) => { try { await gm.disconnect(vid(req)); res.json({ ok: true }); } catch (e) { fail(res, e); } });
router.get('/gmail/threads', requireAuth, async (req, res) => {
  try { res.json({ threads: await gm.listThreads(vid(req), String(req.query.q || '').slice(0, 200), String(req.query.filter || 'all').slice(0, 40)) }); } catch (e) { fail(res, e); }
});
/* 🏷️ the vendor's filters (the whole list is saved at once) and their Gmail labels */
router.get('/gmail/filters', requireAuth, async (req, res) => { try { res.json({ filters: await gm.getFilters(vid(req)) }); } catch (e) { fail(res, e); } });
router.put('/gmail/filters', requireAuth, async (req, res) => { try { res.json({ filters: await gm.saveFilters(vid(req), req.body?.filters) }); } catch (e) { fail(res, e); } });
router.get('/gmail/labels', requireAuth, async (req, res) => { try { res.json({ labels: await gm.listLabels(vid(req)) }); } catch (e) { fail(res, e); } });
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
