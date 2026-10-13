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
import { deviceOf, pcAllowed, logDelivery } from '../lib/pcAgent.js';
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
  await prisma.pc_devices.update({ where: { id: d.id }, data: { last_seen: new Date() } }).catch(() => {});
  next();
}

/** The agent says hello (every ~30 s) with what it can see: drives, free space, Resolve running… */
router.post('/hello', device, async (req, res) => {
  await prisma.pc_devices.update({ where: { id: req.device.id }, data: { info: JSON.stringify(req.body || {}).slice(0, 4000) } }).catch(() => {});
  res.json({ ok: true, agent_version: agentFile()?.version || null });
});

/** 🔄 The current agent.py, for a PC that is behind. */
router.get('/agent', device, (req, res) => {
  const a = agentFile();
  if (!a) return res.status(404).json({ error: 'No agent on the server' });
  res.type('text/x-python').send(a.code);
});

/** 🔑 For one gallery upload: a login as the device's own vendor, so the upload goes through the
    panel's very own direct-to-R2 routes (same checks, same storage pool, same tenancy walls). */
router.post('/vendor-token', device, async (req, res) => {
  const user = await prisma.users.findFirst({ where: { vendor_id: req.device.vendor_id }, orderBy: { id: 'asc' }, select: { id: true, role: true, vendor_id: true } });
  if (!user) return res.status(404).json({ error: 'No user for this vendor' });
  res.json({ token: signToken(user) });
});

/** 📦 A delivery finished on the PC → the delivery log. */
router.post('/delivered', device, async (req, res) => {
  try { await logDelivery(req.device.vendor_id, req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/** The next job for this PC — waits up to 20 s (long-poll), then 204. */
router.get('/next', device, async (req, res) => {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const job = await prisma.pc_jobs.findFirst({ where: { device_id: req.device.id, status: 'queued' }, orderBy: { id: 'asc' } });
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
