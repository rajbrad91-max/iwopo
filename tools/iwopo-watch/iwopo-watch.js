#!/usr/bin/env node
/**
 * 📸 iwopo watch — one file.
 *
 * Run it with no arguments and it opens the setup window in your browser: the
 * device token, a real Windows folder picker, creating a live shoot, start and
 * stop, and a count of what has gone up.
 *
 * Run it with --watch and it IS the watcher, uploading until stopped. The
 * window spawns itself that way, which keeps the two as separate processes —
 * Stop genuinely stops, and a crash in the watcher cannot take the window down
 * — while leaving exactly one file to copy to another machine.
 *
 * Copy this file anywhere. It writes config.json, sent.json and watch.log
 * beside itself and needs nothing else installed but Node.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, exec, execFile } from 'node:child_process';

const SELF = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HERE = path.dirname(SELF);
const CONFIG = path.join(HERE, 'config.json');
const SENT = path.join(HERE, 'sent.json');
const LOG = path.join(HERE, 'watch.log');

/* Which half of this file is running. */
const AS_WATCHER = process.argv.includes('--watch');

function readCfg() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}
function writeCfg(c) { fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); }

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




/**
 * 🪟 The little window that sets the watcher up.
 *
 * Opens in a browser but serves from THIS machine, which is the whole trick: a
 * page on iwopo.com cannot see your folders, and a form asking you to type
 * C:\Users\...\LiveShoot by hand is worse than editing the file, because at
 * least Notepad is on the same computer as the folder.
 *
 * Running locally means Browse can pop a REAL Windows folder dialog and hand
 * back a real path. Nothing is typed and nothing is escaped.
 *
 * 🔒 Bound to 127.0.0.1 only. This writes a file and starts a process, so it
 * must not be reachable from the venue wifi — and on a laptop at a wedding,
 * 0.0.0.0 would be.
 */

const PORT = 4577;

let child = null;                 // the running watcher


/**
 * 📂 The real Windows folder dialog.
 *
 * PowerShell is already on every Windows machine, so this needs no extra
 * download. On anything else it returns nothing and the page falls back to a
 * text box — which is fine, because everywhere else has a usable shell.
 */
function pickFolder() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);

    /* ⚠️ Written to a file and run, rather than passed with -Command.
       Escaping a multi-line PowerShell script through cmd.exe means quoting it
       for cmd AND for PowerShell at once, and my first attempt escaped quotes
       the way a shell would rather than the way cmd does. The dialog then
       either never appeared or appeared and returned nothing, with exit code
       0 — a silent failure that looked like the button doing nothing. */
    const script = path.join(os.tmpdir(), 'iwopo-pick.ps1');

    /* TopMost is the other half. A dialog opened by a background process goes
       BEHIND the browser window, so it is genuinely open and completely
       invisible, which is indistinguishable from a broken button. The owner
       form is a zero-size always-on-top window purely so the dialog has
       something to sit in front of. */
    fs.writeFileSync(script, [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.TopMost = $true',
      '$owner.ShowInTaskbar = $false',
      '$owner.Size = New-Object System.Drawing.Size(1,1)',
      '$owner.StartPosition = "CenterScreen"',
      '$owner.Show()',
      '$owner.Activate()',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$d.Description = "Choose the folder your photos are exported to"',
      '$d.ShowNewFolderButton = $true',
      'if ($d.ShowDialog($owner) -eq "OK") { [Console]::Out.Write($d.SelectedPath) }',
      '$owner.Close()',
    ].join('\r\n'), 'utf8');

    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script],
      { timeout: 180000, windowsHide: true },
      (err, stdout) => {
        fs.unlink(script, () => {});
        resolve(err ? null : (stdout || '').trim() || null);
      });
  });
}

/** The live shoots this token can upload to, asked of the server. */
async function albums(cfg) {
  if (!cfg.server || !cfg.token) return [];
  try {
    /* /api/devices/albums, not /api/albums — a device token is upload-only
       and cannot reach the latter, by design. */
    const r = await fetch(`${cfg.server}/api/devices/albums`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!r.ok) return [];
    return ((await r.json()).albums || []).map(a => ({ id: a.id, title: a.title }));
  } catch { return []; }
}

function status() {
  let uploaded = 0;
  try { uploaded = Object.keys(JSON.parse(fs.readFileSync(SENT, 'utf8'))).length; } catch { /* none yet */ }
  let last = null;
  try {
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    const ok = [...lines].reverse().find(l => l.includes('✅'));
    if (ok) last = ok.slice(0, 19);
  } catch { /* no log yet */ }
  return { running: !!child && child.exitCode === null, uploaded, last };
}

function start() {
  if (child && child.exitCode === null) return;
  /* Spawns ITSELF with a flag. Still a separate process — so Stop really
     stops it and a crash in the watcher cannot take the window down — but
     there is only one file to copy to another machine. */
  child = spawn(process.execPath, [SELF, '--watch'], {
    cwd: HERE, stdio: 'ignore', detached: false,
  });
  child.on('exit', () => { child = null; });
}
function stop() {
  if (child) { child.kill(); child = null; }
}

/* ── the page ───────────────────────────────────────────────────────────── */

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>iwopo watch</title>
<style>
  :root { color-scheme: light dark; --line:#0a151a22; --muted:#66787e; --teal:#0d9488; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin:0;
         padding:28px; max-width:520px; background:#f6f8f9; color:#0c1618; }
  h1 { font-size:19px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin:0 0 24px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:14px; }
  label { display:block; font-size:12.5px; color:var(--muted); margin-bottom:6px; }
  input, select { width:100%; padding:9px 11px; border-radius:8px; border:1px solid var(--line);
                  font-size:13.5px; box-sizing:border-box; background:#fbfcfc; color:#0c1618; }
  .row { display:flex; gap:8px; align-items:flex-end; margin-bottom:16px; }
  .row > div { flex:1; }
  button { padding:9px 16px; border-radius:8px; border:1px solid var(--line); background:#fff;
           font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; color:#0c1618; }
  button.go { background:var(--teal); border-color:var(--teal); color:#fff; }
  button:disabled { opacity:.5; cursor:default; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; }
  .on { background:#16a34a; } .off { background:#94a3b8; }
  .stat { font-size:13.5px; margin-bottom:6px; }
  .muted { color:var(--muted); font-size:12.5px; }
  .acts { display:flex; gap:8px; margin-top:16px; }
  .msg { margin-top:12px; font-size:12.5px; }
  .err { color:#dc2626; }
</style></head><body>
<h1>📸 iwopo watch</h1>
<p class="sub">Photos in the chosen folder upload themselves.</p>

<div class="card">
  <div id="tokrow" style="display:none; margin-bottom:16px">
    <label>Device token</label>
    <input id="token" placeholder="iwd_… from Settings → Devices in your panel">
    <div class="muted" style="margin-top:6px">
      Panel → Settings → 🔑 Devices → Add device, then paste it here.
    </div>
  </div>

  <div class="row">
    <div>
      <label>Folder with your photos</label>
      <input id="folder" placeholder="Choose a folder…">
    </div>
    <button onclick="browse()" id="br">📂 Browse</button>
  </div>

  <label>Upload into</label>
  <div class="row" style="margin-bottom:0">
    <div><select id="album"><option value="">Loading…</option></select></div>
    <button onclick="newShoot()">+ New shoot</button>
  </div>

  <div class="acts">
    <button class="go" onclick="save()">Save</button>
    <button onclick="act('start')">▶ Start</button>
    <button onclick="act('stop')">■ Stop</button>
  </div>
  <div id="msg" class="msg"></div>
</div>

<div class="card">
  <div class="stat"><span id="dot" class="dot off"></span><b id="state">Checking…</b></div>
  <div class="muted" id="counts"></div>
</div>

<script>
let cfg = {};
async function load() {
  const d = await (await fetch('/state')).json();
  cfg = d.config || {};
  document.getElementById('folder').value = cfg.folder || '';
  /* Asked for only when missing. Somebody who has already set it up should not
     be shown an empty box that looks like something went wrong. */
  document.getElementById('tokrow').style.display = d.hasToken ? 'none' : 'block';
  const sel = document.getElementById('album');
  sel.innerHTML = d.albums.length
    ? d.albums.map(a => '<option value="' + a.id + '"' + (a.id == cfg.albumId ? ' selected' : '') + '>' + a.title + '</option>').join('')
    /* Points at the button six inches away rather than at the panel, which
       is where this used to send somebody and is no longer necessary. */
    : '<option value="">No live shoots yet — press + New shoot</option>';
  paint(d.status);
}
function paint(s) {
  document.getElementById('dot').className = 'dot ' + (s.running ? 'on' : 'off');
  document.getElementById('state').textContent = s.running ? 'Running' : 'Not running';
  document.getElementById('counts').textContent =
    s.uploaded + ' uploaded' + (s.last ? ' · last at ' + s.last.slice(11) : '');
}
async function browse() {
  const b = document.getElementById('br');
  b.disabled = true; b.textContent = 'Choose a folder…';
  try {
    const r = await (await fetch('/browse', { method: 'POST' })).json();
    if (r.folder) document.getElementById('folder').value = r.folder;
    else say('No folder chosen — you can also paste the path above.');
  } finally { b.disabled = false; b.textContent = '📂 Browse'; }
}
function say(t, bad) {
  const m = document.getElementById('msg');
  m.textContent = t; m.className = 'msg' + (bad ? ' err' : '');
  setTimeout(() => { m.textContent = ''; }, 5000);
}
/* Creating the shoot here rather than sending somebody back to the panel —
   which is the one thing this window could not do, and the thing you need
   first, at the worst possible moment. */
async function newShoot() {
  const title = prompt('Name this live shoot (e.g. "Sharma Wedding")');
  if (!title || !title.trim()) return;
  const r = await fetch('/new-shoot', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ title: title.trim() }) });
  const d = await r.json();
  if (d.error) return say(d.error, true);
  await load();
  document.getElementById('album').value = d.album.id;
  say('Created — press Save');
}

async function save() {
  const body = {
    folder: document.getElementById('folder').value.trim(),
    albumId: Number(document.getElementById('album').value) || 0,
  };
  const t = document.getElementById('token').value.trim();
  if (t) body.token = t;
  const r = await fetch('/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json();
  say(d.error || 'Saved — press Start', !!d.error);
}
async function act(what) {
  const d = await (await fetch('/' + what, { method: 'POST' })).json();
  if (d.error) return say(d.error, true);
  say(what === 'start' ? 'Started' : 'Stopped');
  setTimeout(load, 700);
}
load();
setInterval(async () => paint((await (await fetch('/state')).json()).status), 3000);
</script></body></html>`;

/* ── the server ─────────────────────────────────────────────────────────── */

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  /* ⚠️ charset declared. Without it a browser guesses, and on a Windows
     machine it guessed wrong — every emoji came out as mojibake. The meta tag
     inside the page is not enough once a header is present. */
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }

  if (url === '/state') {
    const cfg = readCfg();
    /* The token is never sent to the page. It is on this machine either way,
       but a credential that does not travel cannot be read out of a browser
       history, an extension, or a screen shared over a call. */
    const { token, ...safe } = cfg;
    /* Whether one exists, never what it is. */
    return json(res, 200, { config: safe, hasToken: !!token, albums: await albums(cfg), status: status() });
  }

  if (url === '/browse' && req.method === 'POST') {
    return json(res, 200, { folder: await pickFolder() });
  }

  if (url === '/save' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    let want;
    try { want = JSON.parse(body); } catch { return json(res, 400, { error: 'Bad request' }); }

    const cfgNow = readCfg();
    /* A token pasted here goes straight into the file, so nobody opens it in
       Notepad — where the last attempt replaced the field NAME with the token
       and produced a config that was valid JSON and completely wrong. */
    if (want.token) {
      if (!String(want.token).startsWith('iwd_')) {
        return json(res, 400, { error: 'That does not look like a device token — they start with iwd_' });
      }
      writeCfg({ ...cfgNow, token: String(want.token).trim() });
    }

    if (!want.folder) return json(res, 400, { error: 'Choose a folder first.' });
    /* Checked here rather than left for the watcher to discover, because a
       typo in a path should say so now, not at a wedding. */
    if (!fs.existsSync(want.folder)) return json(res, 400, { error: 'That folder does not exist.' });
    if (!want.albumId) return json(res, 400, { error: 'Choose which live shoot to upload into.' });

    const cfg = readCfg();                               // re-read: the token may have just been written
    writeCfg({ ...cfg, folder: want.folder, albumId: want.albumId });

    /* A change of folder or album means the running watcher is watching the
       wrong thing. Restarting it is the honest response to a Save. */
    if (child && child.exitCode === null) { stop(); setTimeout(start, 400); }
    return json(res, 200, { ok: true });
  }

  if (url === '/new-shoot' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    let want;
    try { want = JSON.parse(body); } catch { return json(res, 400, { error: 'Bad request' }); }
    const cfg = readCfg();
    if (!cfg.token) return json(res, 400, { error: 'Add your device token first.' });
    try {
      const r = await fetch(`${cfg.server}/api/devices/albums`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: want.title }),
      });
      const d = await r.json();
      if (!r.ok) return json(res, 400, { error: d.error || 'Could not create it.' });
      return json(res, 200, d);
    } catch (e) { return json(res, 400, { error: 'Could not reach iwopo — ' + e.message }); }
  }

  if (url === '/start' && req.method === 'POST') {
    const cfg = readCfg();
    if (!cfg.token) return json(res, 400, { error: 'No device token in config.json yet.' });
    if (!cfg.folder || !cfg.albumId) return json(res, 400, { error: 'Choose a folder and a live shoot, then Save.' });
    start();
    return json(res, 200, { ok: true });
  }

  if (url === '/stop' && req.method === 'POST') { stop(); return json(res, 200, { ok: true }); }

  res.writeHead(404); res.end();
});

// 🔒 127.0.0.1, never 0.0.0.0 — this writes files and starts processes, and a
// laptop at a venue is on somebody else's wifi.
function startWindow() {
  server.listen(PORT, '127.0.0.1', () => {
  const at = `http://127.0.0.1:${PORT}`;
  console.log(`📸 iwopo watch — open ${at}`);
  const open = process.platform === 'win32' ? `start "" "${at}"`
    : process.platform === 'darwin' ? `open "${at}"` : `xdg-open "${at}"`;
    exec(open, () => {});
  });
}


/* ── which half runs ────────────────────────────────────────────────────── */

if (AS_WATCHER) {
  main().catch(e => { log('❌ ' + e.message); process.exit(1); });
} else {
  startWindow();
}
