/**
 * 🖥️ The owner's editing PC, controlled through Tornado (Raj, 2026-10-12): "open, import,
 * export, make proxies, find a video on the NAS, upload it to Drive — from my phone".
 *
 * A small agent on the PC (pc-agent/agent.py) connects OUT to this server — no port is
 * opened on the PC — and asks for work (GET /api/pc/next, long-poll). Tornado queues a
 * job with the pc_task tool, waits up to ~20 s for the answer, and when a job takes
 * longer (a big copy, proxies) the result reaches the owner later through Tornado's inbox.
 * A device proves itself with a long random token, stored here only as a SHA-256 hash.
 */
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { getSetting } from './settings.js';
import prisma from '../config/prisma.js';

/** 🛡️ The PC features are the owner's private tools — only vendors on this allow-list
    (platform setting pc_agent_vendors, e.g. "1") ever see or use them. Vendors buying
    iwopo are not affected in any way. */
export async function pcAllowed(vendorId) {
  const list = String(await getSetting('pc_agent_vendors', '')).split(/[\s,]+/).filter(Boolean).map(Number);
  return list.includes(Number(vendorId));
}

export const PC_ACTIONS = ['wake', 'apps', 'power', 'open_app', 'close_app', 'upload_to_gallery', 'status', 'details', 'find_files', 'find_folder', 'list_folder', 'make_folder', 'copy', 'move', 'upload_drive', 'make_proxies'];
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/** A new device for a vendor — returns the token ONCE (put it in the agent's config). */
export async function registerDevice(vendorId, name) {
  const token = crypto.randomBytes(32).toString('base64url');
  const d = await prisma.pc_devices.create({ data: { vendor_id: Number(vendorId), name: String(name).slice(0, 80), token_hash: hash(token) } });
  return { id: d.id, token };
}

/** The device behind a request (header X-PC-Token), or null. */
export async function deviceOf(req) {
  const t = req.get('x-pc-token');
  if (!t || t.length < 20) return null;
  return prisma.pc_devices.findUnique({ where: { token_hash: hash(t) } });
}

/** The vendor's PC that was seen most recently — online if seen in the last 90 s. */
export async function onlineDevice(vendorId) {
  const d = await prisma.pc_devices.findFirst({ where: { vendor_id: Number(vendorId), revoked_at: null }, orderBy: { last_seen: 'desc' } });
  if (!d?.last_seen) return { device: d, online: false };
  return { device: d, online: Date.now() - new Date(d.last_seen) < 90_000 };
}

/** Queue a job and wait up to `waitMs` for it to finish. */
export async function runOnPc(vendorId, action, params, waitMs = 20_000) {
  if (!(await pcAllowed(vendorId))) return { error: 'Not available.' };
  const { device, online } = await onlineDevice(vendorId);
  if (!device) return { error: 'No PC is connected yet — the PC agent has not been set up.' };
  if (!online) return { error: `${device.name} is off or the PC agent isn't running (last seen ${device.last_seen ? new Date(device.last_seen).toLocaleString('en-US', { timeZone: 'America/Vancouver' }) : 'never'}).` };
  const job = await prisma.pc_jobs.create({ data: { vendor_id: Number(vendorId), device_id: device.id, action, params: JSON.stringify(params || {}) } });
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 600));
    const j = await prisma.pc_jobs.findUnique({ where: { id: job.id } });
    if (j.status === 'done' || j.status === 'failed') {
      await prisma.pc_jobs.update({ where: { id: j.id }, data: { notified: true } });
      return { status: j.status, result: safeJson(j.result) };
    }
  }
  const j = await prisma.pc_jobs.findUnique({ where: { id: job.id } });
  return { status: 'running', job_id: job.id, progress: j.progress || 'started', note: 'Still running on the PC — tell him it has started; the result comes as an [Update] when it finishes.' };
}

/** Finished long jobs the owner hasn't heard about yet (for Tornado's inbox) — marked as told. */
export async function finishedPcJobs(vendorId, since) {
  const jobs = await prisma.pc_jobs.findMany({ where: { vendor_id: Number(vendorId), notified: false, status: { in: ['done', 'failed'] }, updated_at: { gt: since } }, orderBy: { updated_at: 'asc' }, take: 5 });
  if (jobs.length) await prisma.pc_jobs.updateMany({ where: { id: { in: jobs.map(j => j.id) } }, data: { notified: true } });
  return jobs.map(j => `PC ${j.status === 'done' ? 'FINISHED' : 'FAILED'} — ${j.action}: ${String(j.summary || safeJson(j.result)?.summary || j.result || '').slice(0, 220)}`);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

/* ⏰ Wake the desktop (Raj, 2026-10-12) — the same magic packet his WolOn app sends:
   UDP to the home address (TP-Link DDNS) on port 9; the router forwards it to the PC.
   Settings: pc_wake_host, pc_wake_mac, pc_wake_port (Super Admin / platform_settings). */
export async function wakePc(vendorId) {
  const host = await getSetting('pc_wake_host', ''), mac = String(await getSetting('pc_wake_mac', '')).replace(/[^0-9a-f]/gi, '');
  const port = Number(await getSetting('pc_wake_port', '9')) || 9;
  if (!host || mac.length !== 12) return { error: 'Wake-on-LAN is not set up (home address and the PC\'s MAC).' };
  const { online } = await onlineDevice(vendorId);
  if (online) return { status: 'done', result: { summary: 'The PC is already on.' } };
  const m = Buffer.from(mac, 'hex');
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(m)]);
  const sock = dgram.createSocket('udp4');
  try {
    for (let i = 0; i < 3; i++) {                                         // three times, a second apart — UDP can drop one
      await new Promise((ok, no) => sock.send(packet, port, host, (e) => (e ? no(e) : ok())));
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally { sock.close(); }
  // up to ~2 minutes for Windows to start and the agent to say hello
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    if ((await onlineDevice(vendorId)).online) return { status: 'done', result: { summary: 'The PC is on and ready.' } };
  }
  return { status: 'running', note: 'Wake signal sent. Windows is starting; the PC agent says hello once he is signed in — tell him it is waking up.' };
}

/* 📦 The delivery log — filed by client, read one client at a time. */
const last10 = (x) => String(x || '').replace(/\D/g, '').slice(-10);

/** A finished delivery → one row, with the client's name, email and phone from the gallery and its lead. */
export async function logDelivery(vendorId, { album_id, file_name, size_bytes, source_path, action = 'uploaded', fee = null, note = '' }) {
  const v = Number(vendorId);
  const album = album_id ? await prisma.albums.findFirst({ where: { id: Number(album_id), vendor_id: v }, select: { id: true, title: true, client_email: true } }) : null;
  const lead = album?.client_email ? await prisma.leads.findFirst({ where: { vendor_id: v, email: { equals: album.client_email, mode: 'insensitive' } }, orderBy: { id: 'desc' }, select: { id: true, name: true, email: true, phone: true } }) : null;
  return prisma.agent_delivery_log.create({ data: {
    vendor_id: v, lead_id: lead?.id ?? null, client_name: (lead?.name || album?.title || '').slice(0, 120), client_email: (lead?.email || album?.client_email || '').slice(0, 160),
    client_phone: lead?.phone || '', album_id: album?.id ?? null, album_title: (album?.title || '').slice(0, 200), file_name: String(file_name || '').slice(0, 260),
    size_bytes: BigInt(Math.max(0, Math.round(Number(size_bytes) || 0))), source_path: String(source_path || '').slice(0, 1000), action, fee, note: String(note || '').slice(0, 400),
  } });
}

/** One client's deliveries — matched by name, email or phone; never the whole log. */
export async function deliveriesFor(vendorId, query) {
  const v = Number(vendorId), q = String(query || '').trim();
  if (!q) return { error: 'Which client?' };
  const digits = last10(q);
  const rows = await prisma.agent_delivery_log.findMany({
    where: { vendor_id: v, OR: [
      { client_name: { contains: q, mode: 'insensitive' } }, { client_email: { contains: q, mode: 'insensitive' } }, { album_title: { contains: q, mode: 'insensitive' } },
      ...(digits.length >= 7 ? [{ client_phone: { contains: digits.slice(-7) } }] : []),
    ] },
    orderBy: { at: 'desc' }, take: 15,
  });
  return { deliveries: rows.map(r => `${new Date(r.at).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })} · ${r.action} · ${r.file_name} (${(Number(r.size_bytes) / 1e9).toFixed(1)} GB) → gallery "${r.album_title}"${r.fee !== null ? ` · fee $${Number(r.fee)}` : ''}${r.note ? ` · ${r.note}` : ''} · client ${r.client_name}`) };
}
