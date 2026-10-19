/**
 * 🖥️ /api/pc/* — the PC agent's side (lib/pcAgent.js). Authenticated by the device
 * token (X-PC-Token), never by a user login; a device only ever sees its own jobs.
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../config/prisma.js';
import { deviceOf, pcAllowed, logDelivery, pcCameOnline, registerDevice } from '../lib/pcAgent.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { signToken } from '../middleware/auth.js';

const router = express.Router();

/* 🔄 The current agent (backend/pc-agent/agent.py, in the repo) — each PC compares its own
   version on hello and replaces itself when the server holds a newer one. */
const AGENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../pc-agent/agent.py');
function agentFile() {
  try { const code = fs.readFileSync(AGENT_FILE); return { code, version: crypto.createHash('sha256').update(code).digest('hex').slice(0, 16) }; }
  catch { return null; }
}

async function device(req, res, next) {
  const d = await deviceOf(req).catch(() => null);
  if (!d || d.revoked_at) return res.status(401).json({ error: 'Unknown device' });
  if (!(await pcAllowed(d.vendor_id))) return res.status(403).json({ error: 'Not available' });   // 🛡️ owner-only feature
  req.device = d;
  // 🧭 who is checking in: the startup helper (?can= / helper:true) — on even when the PC sleeps or nobody is
  // signed in — or the full agent (answers only when the PC is awake and signed in). Kept apart so Tornado can
  // tell "asleep" from "awake" (Raj, 2026-10-15: "it says the computer is on, but it's asleep").
  const role = req.query.can || req.body?.helper ? 'helper' : (req.path === '/next' || req.path === '/hello') ? 'agent' : null;
  if (role) {
    let info; try { info = JSON.parse(d.info || '{}'); } catch { info = {}; }
    info[`${role}_at`] = Date.now();
    await prisma.pc_devices.update({ where: { id: d.id }, data: { info: JSON.stringify(info).slice(0, 4000) } }).catch(() => {});
    d.info = JSON.stringify(info);
  }
  // ⏻ while a shutdown / restart / sleep counts down, its check-ins don't make it "on" again
  const off = await prisma.pc_jobs.findFirst({ where: { device_id: d.id, action: 'power', status: 'done', updated_at: { gt: new Date(Date.now() - 120_000) } }, orderBy: { id: 'desc' }, select: { params: true } });
  if (!off || !/shutdown|restart|sleep|off|reboot/i.test(off.params || '')) await prisma.pc_devices.update({ where: { id: d.id }, data: { last_seen: new Date() } }).catch(() => {});
  next();
}

/** 🔑 A new PC (e.g. Raj's Ubuntu) claims its device token with a ONE-TIME setup code (made on the server,
    expires in 24 h, used once). Nobody ever has to paste a device token into a chat. */
let claimTries = [];
router.post('/claim', async (req, res) => {
  claimTries = claimTries.filter(t => Date.now() - t < 10 * 60_000);
  if (claimTries.length >= 10) return res.status(429).json({ error: 'Too many tries — wait 10 minutes' });
  claimTries.push(Date.now());
  let c; try { c = JSON.parse((await getSetting('pc_claim', '')) || '{}'); } catch { c = {}; }
  const code = String(req.body?.code || '').trim();
  if (!c.hash || !code || Date.now() > Number(c.exp || 0) || crypto.createHash('sha256').update(code).digest('hex') !== c.hash) return res.status(401).json({ error: 'Wrong or expired setup code' });
  await setSetting('pc_claim', '');                               // used once
  const d = await registerDevice(c.vendor, String(req.body?.name || 'Ubuntu PC').slice(0, 80));
  res.json({ token: d.token, device_id: d.id });
});

/** The agent says hello (every ~30 s) with what it can see: drives, free space, Resolve running… */
router.post('/hello', device, async (req, res) => {
  let prev; try { prev = JSON.parse(req.device.info || '{}'); } catch { prev = {}; }
  await prisma.pc_devices.update({ where: { id: req.device.id }, data: { info: JSON.stringify({ ...(req.body?.helper ? {} : req.body || {}), helper_at: prev.helper_at, agent_at: prev.agent_at, version: req.body?.helper ? prev.version : (req.body?.version || prev.version), helper_version: req.body?.helper ? req.body?.version : prev.helper_version }).slice(0, 4000) } }).catch(() => {});
  await pcCameOnline(req.device.id).catch(() => {});        // ⏰ a wake that was waiting for it
  res.json({ ok: true, agent_version: agentFile()?.version || null });
});

/** 🔄 The current agent.py, for a PC that is behind. */
router.get('/agent', device, (req, res) => {
  const a = agentFile();
  if (!a) return res.status(404).json({ error: 'No agent on the server' });
  // ✍️ Raj's signature travels with the code (made on his PC, never here); the agent refuses code without it
  let sig = '';
  try { sig = fs.readFileSync(`${AGENT_FILE}.sig`, 'utf8').trim(); } catch { /* unsigned — the PC will refuse it */ }
  res.set('X-Agent-Signature', sig);
  res.type('text/x-python').send(a.code);
});

/** 🔑 For one gallery upload: a login as the device's own vendor, so the upload goes through the
    panel's very own direct-to-R2 routes (same checks, same storage pool, same tenancy walls). */
router.post('/vendor-token', device, async (req, res) => {
  const user = await prisma.users.findFirst({ where: { vendor_id: req.device.vendor_id }, orderBy: { id: 'asc' }, select: { id: true, role: true, vendor_id: true } });
  if (!user) return res.status(404).json({ error: 'No user for this vendor' });
  res.json({ token: signToken({ id: user.id, role: 'vendor', vendor_id: user.vendor_id }) });   // 🔒 this vendor only, no admin powers
});

/** 📦 A delivery finished on the PC → the delivery log. */
router.post('/delivered', device, async (req, res) => {
  try { await logDelivery(req.device.vendor_id, req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/** The next job for this PC — waits up to 20 s (long-poll), then 204. */
router.get('/next', device, async (req, res) => {
  // ⏱️ a command older than 2 minutes is never run (an old "shut down" must not fire hours later)
  await prisma.pc_jobs.updateMany({ where: { device_id: req.device.id, status: 'queued', created_at: { lt: new Date(Date.now() - 120_000) } }, data: { status: 'failed', summary: 'expired — the PC was not reachable in time', notified: true, updated_at: new Date() } });
  // 🔌 the startup helper (before sign-in) takes only what it can do: ?can=status,power
  const can = String(req.query.can || '').split(',').map(x => x.trim()).filter(Boolean);
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const job = await prisma.pc_jobs.findFirst({ where: { device_id: req.device.id, status: 'queued', created_at: { gte: new Date(Date.now() - 120_000) }, ...(can.length ? { action: { in: can } } : {}) }, orderBy: { id: 'asc' } });
    if (job) {
      const claimed = await prisma.pc_jobs.updateMany({ where: { id: job.id, status: 'queued' }, data: { status: 'running', updated_at: new Date() } });
      if (claimed.count) return res.json({ id: job.id, action: job.action, params: JSON.parse(job.params || '{}') });
    }
    if (req.socket.destroyed) return undefined;
    await new Promise(r => setTimeout(r, 1000));
  }
  await prisma.pc_devices.update({ where: { id: req.device.id }, data: { last_seen: new Date() } }).catch(() => {});
  return res.status(204).end();
});

/** Progress or the result of a job — only this device's own jobs. */
router.post('/jobs/:id', device, async (req, res) => {
  const id = Number(req.params.id);
  const job = await prisma.pc_jobs.findFirst({ where: { id, device_id: req.device.id } });
  if (!job) return res.status(404).json({ error: 'Not found' });
  const status = ['running', 'done', 'failed'].includes(req.body?.status) ? req.body.status : job.status;
  if (job.action === 'power' && req.body?.status === 'done' && /shutdown|restart|sleep|off|reboot/i.test(job.params || '')) {
    await prisma.pc_devices.update({ where: { id: req.device.id }, data: { last_seen: new Date(Date.now() - 10 * 60_000) } }).catch(() => {});
  }
  await prisma.pc_jobs.update({
    where: { id },
    data: {
      status,
      progress: req.body?.progress ? String(req.body.progress).slice(0, 300) : job.progress,
      result: req.body?.result !== undefined ? JSON.stringify(req.body.result).slice(0, 20000) : job.result,
      summary: req.body?.summary ? String(req.body.summary).slice(0, 400) : job.summary,
      updated_at: new Date(),
    },
  });
  res.json({ ok: true });
});

export default router;
