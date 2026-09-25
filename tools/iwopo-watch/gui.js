#!/usr/bin/env node
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
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CONFIG = path.join(HERE, 'config.json');
const LOG = path.join(HERE, 'watch.log');
const SENT = path.join(HERE, 'sent.json');
const PORT = 4577;

let child = null;                 // the running watcher

function readCfg() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}
function writeCfg(c) {
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
}

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
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      $d = New-Object System.Windows.Forms.FolderBrowserDialog
      $d.Description = 'Choose the folder your photos are exported to'
      $d.ShowNewFolderButton = $true
      if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }
    `;
    exec(`powershell -NoProfile -STA -Command "${ps.replace(/\n\s*/g, ' ').replace(/"/g, '\\"')}"`,
      { timeout: 120000 },
      (err, stdout) => resolve(err ? null : (stdout || '').trim() || null));
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
  child = spawn(process.execPath, [path.join(HERE, 'watch.js')], {
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
  <div class="row">
    <div>
      <label>Folder with your photos</label>
      <input id="folder" placeholder="Choose a folder…">
    </div>
    <button onclick="browse()" id="br">📂 Browse</button>
  </div>

  <label>Upload into</label>
  <select id="album"><option value="">Loading…</option></select>

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
  const sel = document.getElementById('album');
  sel.innerHTML = d.albums.length
    ? d.albums.map(a => '<option value="' + a.id + '"' + (a.id == cfg.albumId ? ' selected' : '') + '>' + a.title + '</option>').join('')
    : '<option value="">No live shoots found — create one in the panel</option>';
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
async function save() {
  const body = {
    folder: document.getElementById('folder').value.trim(),
    albumId: Number(document.getElementById('album').value) || 0,
  };
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

  if (url === '/' ) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGE); }

  if (url === '/state') {
    const cfg = readCfg();
    /* The token is never sent to the page. It is on this machine either way,
       but a credential that does not travel cannot be read out of a browser
       history, an extension, or a screen shared over a call. */
    const { token, ...safe } = cfg;                      // eslint-disable-line no-unused-vars
    return json(res, 200, { config: safe, albums: await albums(cfg), status: status() });
  }

  if (url === '/browse' && req.method === 'POST') {
    return json(res, 200, { folder: await pickFolder() });
  }

  if (url === '/save' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    let want;
    try { want = JSON.parse(body); } catch { return json(res, 400, { error: 'Bad request' }); }

    if (!want.folder) return json(res, 400, { error: 'Choose a folder first.' });
    /* Checked here rather than left for the watcher to discover, because a
       typo in a path should say so now, not at a wedding. */
    if (!fs.existsSync(want.folder)) return json(res, 400, { error: 'That folder does not exist.' });
    if (!want.albumId) return json(res, 400, { error: 'Choose which live shoot to upload into.' });

    const cfg = readCfg();
    writeCfg({ ...cfg, folder: want.folder, albumId: want.albumId });

    /* A change of folder or album means the running watcher is watching the
       wrong thing. Restarting it is the honest response to a Save. */
    if (child && child.exitCode === null) { stop(); setTimeout(start, 400); }
    return json(res, 200, { ok: true });
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
server.listen(PORT, '127.0.0.1', () => {
  const at = `http://127.0.0.1:${PORT}`;
  console.log(`📸 iwopo watch — open ${at}`);
  const open = process.platform === 'win32' ? `start "" "${at}"`
    : process.platform === 'darwin' ? `open "${at}"` : `xdg-open "${at}"`;
  exec(open, () => {});
});
