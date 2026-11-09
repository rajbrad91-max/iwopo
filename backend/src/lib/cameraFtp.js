import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { getFeatures } from './entitlements.js';
import { sealPassword } from './sharePassword.js';
import { shootFor, checkUpload, uploadKey, uploadComplete } from './shoots.js';
import { quiet } from './quiet.js';

/**
 * 📡 Camera FTP — the Raw Selector's other way in (Raj, 2026-11-09).
 *
 * vsftpd (/etc/vsftpd.conf) runs on this server at ftp.iwopo.com:21, encrypted (FTPS required), with virtual users
 * only: each photographer has a login in /etc/vsftpd/iwopo.passwd (written here, the password hashed) and is jailed in
 * /srv/iwopo-ftp/<user>. The vendor creates the login in Crew Management; the photographer chooses, per shoot in his
 * portal, that the camera's uploads go to that shoot (crew_members.ftp_lead_id). ingestFtp() then files what the camera
 * has finished sending into that shoot — the same JPEG + RAW handling as an upload in the browser — and removes it
 * from the FTP folder. With no shoot chosen, files wait in the folder.
 *
 * Staging and live share the one FTP server: each site only handles its own users (FTP_USER_PREFIX, "stg-" on staging).
 */
export const FTP_HOST = process.env.FTP_HOST || 'ftp.iwopo.com';
const ROOT = process.env.FTP_ROOT || '/srv/iwopo-ftp';
const PASSWD = process.env.FTP_PASSWD_FILE || '/etc/vsftpd/iwopo.passwd';
const PREFIX = process.env.FTP_USER_PREFIX || '';
const SETTLE_MS = 60 * 1000;   // a file untouched this long has finished arriving
const MINE = new RegExp(`^${PREFIX.replace(/[^\w-]/g, '')}crew(\\d+)$`);

export const ftpUser = (crewId) => `${PREFIX}crew${crewId}`;
const folderOf = (crewId) => path.join(ROOT, ftpUser(crewId));

/** write vsftpd's login file without the given user's line, plus the new line if any — atomically */
function rewriteLogins(user, line) {
  const keep = (fs.existsSync(PASSWD) ? fs.readFileSync(PASSWD, 'utf8') : '').split('\n').filter(l => l && !l.startsWith(`${user}:`));
  if (line) keep.push(line);
  const tmp = `${PASSWD}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, keep.join('\n') + (keep.length ? '\n' : ''), { mode: 0o600 });
  fs.renameSync(tmp, PASSWD);
}

/** a new FTP login (or a new password) for this crew member: returns { user, password } */
export async function setFtpLogin(crewId) {
  const user = ftpUser(crewId);
  const password = crypto.randomBytes(9).toString('base64url');   // 12 characters, letters, digits, - and _
  const hashed = spawnSync('openssl', ['passwd', '-6', '-stdin'], { input: password, encoding: 'utf8' });
  if (hashed.status !== 0 || !hashed.stdout.startsWith('$6$')) throw new Error('Could not set the FTP password');
  rewriteLogins(user, `${user}:${hashed.stdout.trim()}`);
  const dir = folderOf(crewId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  const uid = spawnSync('id', ['-u', 'ftp'], { encoding: 'utf8' }), gid = spawnSync('id', ['-g', 'ftp'], { encoding: 'utf8' });
  if (uid.status === 0 && gid.status === 0) fs.chownSync(dir, Number(uid.stdout), Number(gid.stdout));   // vsftpd writes as the ftp user
  await prisma.crew_members.update({ where: { id: crewId }, data: { ftp_password_enc: sealPassword(password) } });
  return { user, password };
}

/** the login and its folder go (the crew member was removed) */
export function removeFtpLogin(crewId) {
  rewriteLogins(ftpUser(crewId), null);
  fs.rmSync(folderOf(crewId), { recursive: true, force: true });
}

/** finished files in a folder, any depth (cameras may add a dated sub-folder) */
function settledFiles(dir) {
  const out = [];
  const walk = (d) => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > SETTLE_MS) out.push({ path: p, name: e.name, size: st.size }); }
    }
  };
  walk(dir);
  return out;
}

/** how many files wait in this photographer's FTP folder (for his portal) */
export const waitingFiles = (crewId) => settledFiles(folderOf(crewId)).length;

let running = false;
/** every half minute (server.js): file the cameras' finished uploads into the shoots their photographers chose */
export async function ingestFtp() {
  if (running) return;
  running = true;
  try {
    let dirs; try { dirs = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return; }
    for (const d of dirs) {
      const m = d.isDirectory() && d.name.match(MINE);
      if (!m) continue;   // not one of this site's photographers
      const cm = await prisma.crew_members.findUnique({ where: { id: Number(m[1]) }, select: { id: true, vendor_id: true, ftp_lead_id: true } });
      if (!cm?.ftp_lead_id) continue;   // no shoot chosen: the files wait
      const f = await getFeatures(cm.vendor_id);
      if (!f.has('*') && !f.has('rawsel')) continue;
      const job = await prisma.lead_crew.findFirst({ where: { lead_id: cm.ftp_lead_id, crew_member_id: cm.id, uploads: true } });   // 🔒 still his to upload
      if (!job) continue;
      const album = await shootFor(cm.vendor_id, cm.ftp_lead_id);
      if (!album) continue;
      for (const file of settledFiles(path.join(ROOT, d.name))) {
        if (await checkUpload(cm.vendor_id, [{ name: file.name, size: file.size }])) continue;   // not a JPEG/RAW, too big, or over quota: left where it is
        const key = uploadKey(cm.vendor_id, album, file.name);
        try {
          await objects.putObject(objects.PRIVATE, key, fs.createReadStream(file.path), null, file.size);
          const done = await uploadComplete(cm.vendor_id, album, [{ key, name: file.name }]);
          if (done.photos + done.raws > 0) fs.unlinkSync(file.path);
        } catch (e) { quiet('cameraFtp · ingest')(e); }
      }
    }
  } finally { running = false; }
}
