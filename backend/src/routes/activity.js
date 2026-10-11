/**
 * 👀 Tester activity (Raj, 2026-10-11) — TEMPORARY, remove after about a month.
 *
 * Raj hired a tester (Bobby, user 14 on alphabetaone.com) and wants to see, per
 * day in Vancouver time, when Bobby was signed in and which panel pages he
 * stayed on, from when to when. Only the user ids listed in the platform
 * setting `tracked_user_ids` are recorded — for everybody else the first ping
 * answers { track: false } and the panel stops asking.
 *
 * The panel pings the page it is on every ~20 s while the tab is visible; a
 * ping on the same page within 75 s extends the current visit, anything else
 * starts a new one. The report is Super Admin only, at an unlinked page
 * (/x/tester-activity).
 *
 * STAGING ONLY: it answers nothing (404) unless TESTER_TRACKING=1 is in the
 * server's .env — set on alphabetaone.com, never on iwopo.com, so a sync that
 * carries this code to live leaves it switched off there.
 *
 * To remove: this file, its two lines in server.js, TesterActivity.jsx + .css,
 * the /x/tester-activity route in App.jsx, lib/activityPing.js and its use in
 * VendorPanel.jsx, the tester_activity table, and the tracked_user_ids setting.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';

const router = express.Router();
// 🚫 switched off unless this server is the one Raj tracks his tester on (staging)
router.use((req, res, next) => (process.env.TESTER_TRACKING === '1' ? next() : res.status(404).json({ error: 'Not found' })));
const TZ = 'America/Vancouver';
const SAME_VISIT_MS = 75_000;          // a ping this soon on the same page continues the visit
const NEW_SESSION_MS = 10 * 60_000;    // a gap this long between visits = a new sitting

async function trackedIds() {
  return String(await getSetting('tracked_user_ids', '')).split(/[,\s]+/).map(Number).filter(Boolean);
}

router.post('/ping', requireAuth, async (req, res) => {
  try {
    const uid = Number(req.user?.id);
    if (!(await trackedIds()).includes(uid)) return res.json({ track: false });
    const path = String(req.body?.path || '').slice(0, 300);
    if (!path.startsWith('/')) return res.status(400).json({ error: 'path' });
    const now = new Date();
    const last = await prisma.tester_activity.findFirst({ where: { user_id: uid }, orderBy: { ended_at: 'desc' } });
    if (last && last.path === path && now - last.ended_at < SAME_VISIT_MS) {
      await prisma.tester_activity.update({ where: { id: last.id }, data: { ended_at: now } });
    } else {
      await prisma.tester_activity.create({ data: { user_id: uid, path, started_at: now, ended_at: now, source: 'live' } });
    }
    res.json({ track: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** A page path as a person reads it: /panel/leads/97 → "Leads › lead #97". */
function pageName(path) {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/login') return 'Home / sign-in page';
  const m = p.match(/^\/panel(?:\/([a-z-]+))?(?:\/(\d+))?/);
  if (!m) return p;
  if (!m[1]) return 'Dashboard';
  const name = m[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return m[2] ? `${name} › #${m[2]}` : name;
}
const vDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });                   // YYYY-MM-DD in Vancouver
const vTime = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });

router.get('/report', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const ids = await trackedIds();
    const users = await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
    const since = new Date(Date.now() - 40 * 86400e3);
    const out = [];
    for (const u of users) {
      const rows = await prisma.tester_activity.findMany({ where: { user_id: u.id, started_at: { gte: since } }, orderBy: { started_at: 'asc' } });
      const days = {};
      let session = null;
      for (const r of rows) {
        const key = vDay(r.started_at);
        const day = (days[key] ||= { day: key, label: new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), sessions: [] });
        if (!session || session.day !== key || r.started_at - session._end > NEW_SESSION_MS) {
          session = { day: key, _start: r.started_at, _end: r.ended_at, visits: [] };
          day.sessions.push(session);
        }
        session._end = new Date(Math.max(session._end, r.ended_at));
        const secs = Math.max(0, Math.round((r.ended_at - r.started_at) / 1000));
        session.visits.push({ page: pageName(r.path), path: r.path, from: vTime(r.started_at), to: vTime(r.ended_at), seconds: secs, source: r.source });
      }
      const list = Object.values(days).sort((a, b) => b.day.localeCompare(a.day)).map(d => ({
        ...d,
        sessions: d.sessions.map(s => ({ from: vTime(s._start), to: vTime(s._end), seconds: Math.round((s._end - s._start) / 1000), visits: s.visits })),
        total_seconds: d.sessions.reduce((t, s) => t + Math.round((s._end - s._start) / 1000), 0),
      }));
      out.push({ user: u, days: list });
    }
    res.json({ timezone: TZ, people: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
