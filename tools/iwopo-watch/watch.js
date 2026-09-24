#!/usr/bin/env node
/**
 * 📸 iwopo watch — photographs upload themselves.
 *
 * Point it at a folder. Anything that lands there goes up. You do not open it,
 * click it, or remember it; Windows starts it at boot and it runs until the
 * machine is turned off.
 *
 * ── What this guarantees, and what it cannot ──
 *
 * It cannot be flawless; no software is, and a program that claims to be is
 * lying about the interesting cases. What it IS built to guarantee is that a
 * photograph is never SILENTLY lost. Every failure is written down, retried for
 * ever, and counted on screen. The worst case is a photograph that has not gone
 * up YET and says so — never one that quietly did not.
 *
 * Four things buy that, and the last one matters most:
 *
 *   1. It waits for a file to stop growing. Lightroom writes a JPEG over
 *      several seconds; uploading at first sight ships half a photograph.
 *   2. A record on disk of what has gone. A restart mid-wedding does not
 *      re-upload four hundred files, and does not skip the one in flight.
 *   3. Retry with backoff, without limit. Venue wifi drops. A failure is a
 *      delay, never a loss.
 *   4. A FULL SCAN, on startup and every minute after. File-system events are
 *      missed — under load, on network drives, while this program restarts, and
 *      on some Windows shares almost always. The scan is what makes the promise
 *      true: anything in the folder that is not in the record gets uploaded,
 *      whatever the events did or did not say.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CONFIG = path.join(HERE, 'config.json');
const SENT = path.join(HERE, 'sent.json');
const LOG = path.join(HERE, 'watch.log');

const PHOTO = /\.(jpe?g|png|webp|heic|tiff?)$/i;
const SCAN_MS = 60_000;          // the safety net
const SETTLE_MS = 2_500;         // how long a file must stop changing for
const PARALLEL = 3;              // uploads at once — a venue uplink is not fat

/* ── the record of what has gone ────────────────────────────────────────── */

let sent = new Map();            // relative path → { size, mtime, at }

function loadSent() {
  try {
    const raw = JSON.parse(fs.readFileSync(SENT, 'utf8'));
    sent = new Map(Object.entries(raw));
  } catch { sent = new Map(); }
}

/* Written through a temporary file and renamed. A power cut halfway through
   writing this directly would leave it truncated, and a truncated record means
   re-uploading a whole wedding — or worse, believing files went that did not. */
function saveSent() {
  const tmp = SENT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sent), null, 0));
  fs.renameSync(tmp, SENT);
}

/* ── saying what is happening ───────────────────────────────────────────── */

function log(line) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const msg = `${stamp}  ${line}`;
  console.log(msg);
  try { fs.appendFileSync(LOG, msg + '\n'); } catch { /* the console still has it */ }
}

/* ── uploading one photograph ───────────────────────────────────────────── */

let cfg = null;

async function upload(abs, rel) {
  const stat = await fsp.stat(abs);
  const form = new FormData();
  form.append('photos', new Blob([await fsp.readFile(abs)]), path.basename(abs));
  if (cfg.eventId) form.append('event_id', String(cfg.eventId));

  const res = await fetch(`${cfg.server}/api/albums/${cfg.albumId}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    /* 401 means the token is wrong or revoked, and retrying for ever would
       hammer the server while achieving nothing. Everything else is worth
       another go — a 500 or a dropped connection is usually temporary. */
    const fatal = res.status === 401 || res.status === 403;
    const err = new Error(`${res.status} ${body.slice(0, 120)}`);
    err.fatal = fatal;
    throw err;
  }

  sent.set(rel, { size: stat.size, mtime: Math.round(stat.mtimeMs), at: Date.now() });
  saveSent();
}

/* ── finding what still needs to go ─────────────────────────────────────── */

async function* walk(dir, root = dir) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return; }                                  // a folder that vanished mid-scan
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walk(abs, root); continue; }
    if (!PHOTO.test(e.name)) continue;
    yield { abs, rel: path.relative(root, abs).split(path.sep).join('/') };
  }
}

/**
 * Everything in the folder that is not already up.
 *
 * ⚠️ A file is ONLY skipped when the record matches its current size and
 * modification time. Re-exporting over the same filename — which happens all
 * the time when a photograph is corrected — therefore goes up again rather than
 * being silently ignored because the name was seen once.
 */
async function pending(root) {
  const out = [];
  for await (const f of walk(root)) {
    const s = await fsp.stat(f.abs).catch(() => null);
    if (!s) continue;
    const seen = sent.get(f.rel);
    if (seen && seen.size === s.size && seen.mtime === Math.round(s.mtimeMs)) continue;
    out.push({ ...f, size: s.size, mtime: Math.round(s.mtimeMs) });
  }
  return out;
}

/** Has it stopped being written to? */
async function settled(f) {
  await new Promise(r => setTimeout(r, SETTLE_MS));
  const s = await fsp.stat(f.abs).catch(() => null);
  return !!s && s.size === f.size && Math.round(s.mtimeMs) === f.mtime && s.size > 0;
}

/* ── the loop ───────────────────────────────────────────────────────────── */

const failures = new Map();      // rel → how many times it has failed
let working = false;

/** Backoff, capped. A venue with no signal for an hour should not spend that
    hour retrying every two seconds, and should not wait a day once it returns. */
function waitFor(tries) {
  return Math.min(2 ** tries * 1000, 60_000);
}

async function drain(root) {
  if (working) return;                               // one sweep at a time
  working = true;
  try {
    const todo = await pending(root);
    if (!todo.length) return;

    /* Oldest first. If a wedding is half uploaded when the connection returns,
       the guests should see the beginning of the evening before the end. */
    todo.sort((a, b) => a.mtime - b.mtime);
    log(`${todo.length} to upload`);

    let i = 0;
    const workers = Array.from({ length: PARALLEL }, async () => {
      while (i < todo.length) {
        const f = todo[i++];

        /* Still being written? Leave it — the next scan will find it. Better a
           photograph a minute late than half a photograph delivered. */
        if (!(await settled(f))) continue;

        try {
          await upload(f.abs, f.rel);
          failures.delete(f.rel);
          log(`✅ ${f.rel}`);
        } catch (e) {
          const n = (failures.get(f.rel) || 0) + 1;
          failures.set(f.rel, n);
          log(`⚠️  ${f.rel} — ${e.message}${e.fatal ? ' (check the token)' : ` (attempt ${n})`}`);
          if (e.fatal) { i = todo.length; break; }   // stop the sweep; the token is wrong
          await new Promise(r => setTimeout(r, waitFor(n)));
        }
      }
    });
    await Promise.all(workers);

    const left = failures.size;
    if (left) log(`${left} still waiting — they will be tried again`);
  } finally { working = false; }
}

/* ── start ──────────────────────────────────────────────────────────────── */

function readConfig() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); }
  catch { log(`❌ Cannot read ${CONFIG}. Copy config.example.json to config.json and fill it in.`); process.exit(1); }
  for (const k of ['server', 'token', 'albumId', 'folder']) {
    if (!raw[k]) { log(`❌ config.json is missing "${k}"`); process.exit(1); }
  }
  return raw;
}

async function main() {
  cfg = readConfig();
  loadSent();

  if (!fs.existsSync(cfg.folder)) {
    log(`❌ The folder does not exist: ${cfg.folder}`);
    process.exit(1);
  }

  log(`📸 watching ${cfg.folder}`);
  log(`   album ${cfg.albumId} at ${cfg.server}`);
  log(`   ${sent.size} already uploaded`);

  /* The catch-up. If this was off for a day — a reboot, a crash, a machine
     that was simply closed — everything missed goes now. This is the single
     reason a photograph cannot be lost by the watcher not running. */
  await drain(cfg.folder);

  /* Events for speed: a photograph appears and goes within a second or two. */
  try {
    fs.watch(cfg.folder, { recursive: true }, (_e, name) => {
      if (name && PHOTO.test(name)) drain(cfg.folder).catch(() => {});
    });
  } catch {
    /* Recursive watching is not available everywhere, and some network drives
       report nothing at all. Not fatal: the scan below does the same job a
       little slower, which is why it exists. */
    log('   (file events unavailable — relying on the scan)');
  }

  /* And the scan regardless, because events are missed. This is the safety net
     and it is not optional. */
  setInterval(() => { drain(cfg.folder).catch(e => log('scan failed: ' + e.message)); }, SCAN_MS);
}

/* Nothing should be able to stop this silently. */
process.on('unhandledRejection', e => log('⚠️  ' + (e?.message || e)));
process.on('uncaughtException', e => log('⚠️  ' + (e?.message || e)));

main().catch(e => { log('❌ ' + e.message); process.exit(1); });


