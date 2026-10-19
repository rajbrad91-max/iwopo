"""
🖥️ PC Agent — lets Tornado work on this PC (Raj, 2026-10-12).

It connects OUT to the iwopo server (no port is opened on this PC), asks for jobs
(long-poll), runs them with plain, reliable code and reports back:
  status · find_files · list_folder · make_folder · copy · move · upload_drive · make_proxies ·
  upload_to_gallery (a video into a client gallery's Videos folder, straight to R2)

• find_files uses an index of the NAS shares and drives (rebuilt every 6 hours in the
  background, so a search answers in milliseconds instead of crawling 7 TB).
• upload_drive copies into Google Drive for desktop (G:\\My Drive) — Drive syncs it.
• make_proxies writes H.264 proxies with the best encoder this PC has (NVIDIA NVENC →
  Intel Quick Sync → CPU) into a "Proxy" folder next
  to the clips — the layout DaVinci Resolve links automatically.
• Nothing is ever deleted, except the original of a "move" — and only after its copy is
  complete; Tornado asks the owner before every move.
• It keeps itself up to date: the server says which version is current, and a newer
  agent.py replaces this one and restarts — nothing to reinstall on the PC.
Config: config.json next to this file (server, token, roots, drive_dir, ffmpeg).
"""
import hashlib, json, os, re, shutil, sqlite3, subprocess, sys, threading, time, traceback, ctypes
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent
CFG = json.loads((HERE / 'config.json').read_text(encoding='utf-8-sig'))
SERVER, TOKEN = CFG['server'].rstrip('/'), CFG['token']
# 🧳 moved to iwopo.com (Raj, 2026-10-19): alphabetaone is for testing (a developer works there), so the PCs take
# their jobs from the live server only. One time: rewrite this PC's own config, keeping everything else in it.
if 'alphabetaone.com' in SERVER:
    SERVER = 'https://iwopo.com'
    try:
        CFG['server'] = SERVER
        (HERE / 'config.json').write_text(json.dumps(CFG, indent=2), encoding='utf-8')
    except OSError:
        pass   # the other copy (helper / agent) may be writing it at the same moment — it ends up the same
H = {'X-PC-Token': TOKEN, 'Content-Type': 'application/json'}
DATA = Path(os.environ.get('LOCALAPPDATA', str(HERE))) / 'PCAgent'
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'index.db'
LOG = DATA / ('helper.log' if '--helper' in sys.argv else 'agent.log')
VIDEO = {'.mp4', '.mov', '.mxf', '.mts', '.m2ts', '.avi', '.mkv', '.braw', '.r3d', '.mpg', '.wmv', '.m4v', '.insv'}
PHOTO = {'.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff', '.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.orf', '.rw2', '.psd'}


def log(*a):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def post(path, body):
    try:
        requests.post(SERVER + path, headers=H, json=body, timeout=20)
    except requests.RequestException as e:
        log('post failed', path, e)


def gb(n):
    return round(n / 1e9, 1)


def size_text(n):
    """MB under one gigabyte, GB from one gigabyte up (the owner's note: "0.0 GB" helps nobody)."""
    n = int(n or 0)
    if n >= 1e9:
        return f'{n / 1e9:.1f} GB'
    if n >= 1e6:
        return f'{round(n / 1e6)} MB'
    return f'{max(1, round(n / 1e3))} KB'


# ── 🧭 paths: the NAS shares under their drive letters too, and the closest real folder for a guess ──
def drive_map():
    r"""V: → \\PPCloud\Almirah and so on — Tornado may say either."""
    out = {}
    try:
        r = subprocess.run(['net', 'use'], capture_output=True, text=True, creationflags=0x08000000).stdout
        for line in r.splitlines():
            parts = line.split()
            for i, p in enumerate(parts):
                if len(p) == 2 and p[1] == ':' and i + 1 < len(parts) and parts[i + 1].startswith('\\\\'):
                    out[p.upper()] = parts[i + 1]
    except OSError:
        pass
    return out


def norm_words(t):
    """Words for matching: lower case, punctuation gone, "26 27" and "2026-27" alike."""
    t = str(t).lower().replace('_', ' ').replace('-', ' ')
    t = ''.join(ch if ch.isalnum() or ch.isspace() else ' ' for ch in t)
    words = []
    for w in t.split():
        if w.isdigit() and len(w) == 4 and w.startswith('20'):
            w = w[2:]                          # 2026 → 26
        words.append(w)
    return words


def real_path(p):
    """The path as given if it exists; with its drive letter swapped for the share (or back); else None."""
    if not p:
        return None
    p = str(p).strip().strip('"')
    if os.path.exists(p):
        return p
    m = drive_map()
    for letter, unc in m.items():
        if p.upper().startswith(letter):
            alt = unc + p[2:]
            if os.path.exists(alt):
                return alt
        if p.lower().startswith(unc.lower()):
            alt = letter + p[len(unc):]
            if os.path.exists(alt):
                return alt
    return None


# ── 🗂️ the index ─────────────────────────────────────────────────────────────
def db():
    c = sqlite3.connect(DB, timeout=30)
    c.execute('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, name TEXT, ext TEXT, size INTEGER, mtime REAL, seen REAL)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_name ON files(name)')
    c.execute('CREATE TABLE IF NOT EXISTS dirs (path TEXT PRIMARY KEY, words TEXT, seen REAL)')
    return c


def build_index():
    """Walk every root and refresh the index (files not seen any more are dropped)."""
    started = time.time()
    c = db()
    count = 0
    for root in CFG.get('roots', []):
        stack = [root]
        while stack:
            d = stack.pop()
            try:
                with os.scandir(d) as it:
                    for e in it:
                        try:
                            if e.is_dir(follow_symlinks=False):
                                if not e.name.startswith(('#', '.', '@')) and e.name not in ('$RECYCLE.BIN', 'System Volume Information'):
                                    stack.append(e.path)
                                    c.execute('INSERT OR REPLACE INTO dirs VALUES (?,?,?)', (e.path, ' '.join(norm_words(e.path)), started))
                            else:
                                st = e.stat()
                                ext = os.path.splitext(e.name)[1].lower()
                                c.execute('INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?)', (e.path, e.name.lower(), ext, st.st_size, st.st_mtime, started))
                                count += 1
                                if count % 5000 == 0:
                                    c.commit()
                        except OSError:
                            continue
            except OSError:
                continue
    c.execute('DELETE FROM files WHERE seen < ?', (started,))
    c.execute('DELETE FROM dirs WHERE seen < ?', (started,))
    c.commit()
    c.close()
    log(f'index: {count} files in {round(time.time() - started)} s')


def index_loop():
    while True:
        try:
            build_index()
        except Exception:
            log('index error', traceback.format_exc())
        time.sleep(6 * 3600)


# ── 🧰 the actions ───────────────────────────────────────────────────────────
def status(_p):
    """Is the PC on? — just that (owner's note: no drives, Resolve or indexing unless he asks)."""
    return {'on': True, 'pc': os.environ.get('COMPUTERNAME'), 'summary': f"{os.environ.get('COMPUTERNAME')} is on"}


def details(_p):
    """Only when he asks: drives and free space, what's open, the NAS letters, how much is indexed."""
    drives = []
    for letter in 'CDEFGHIJKLMNOPQRSTUVWXYZ':
        root = f'{letter}:\\'
        if os.path.exists(root):
            try:
                u = shutil.disk_usage(root)
                drives.append({'drive': letter, 'free_gb': gb(u.free), 'size_gb': gb(u.total)})
            except OSError:
                pass
    tasks = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True, creationflags=0x08000000).stdout.lower()
    c = db()
    n = c.execute('SELECT COUNT(*) FROM files').fetchone()[0]
    c.close()
    return {'pc': os.environ.get('COMPUTERNAME'), 'drives': drives, 'nas_letters': drive_map(), 'resolve_open': 'resolve.exe' in tasks, 'lightroom_open': 'lightroom.exe' in tasks, 'files_indexed': n,
            'summary': f"{os.environ.get('COMPUTERNAME')} is on"}   # Resolve only when asked (owner's note) — resolve_open is still in the data


def find_files(p):
    words = [w for w in str(p.get('query', '')).lower().split() if w]
    kind, sort, limit = p.get('kind', 'any'), p.get('sort', 'size'), min(int(p.get('limit') or 8), 25)
    sql, args = 'SELECT path, size, mtime FROM files WHERE 1=1', []
    for w in words:
        sql += ' AND (name LIKE ? OR path LIKE ?)'
        args += [f'%{w}%', f'%{w}%']
    if kind in ('video', 'photo'):
        exts = VIDEO if kind == 'video' else PHOTO
        sql += f" AND ext IN ({','.join('?' * len(exts))})"
        args += list(exts)
    sql += {'size': ' ORDER BY size DESC', 'date': ' ORDER BY mtime DESC', 'name': ' ORDER BY name'}.get(sort, ' ORDER BY size DESC') + f' LIMIT {limit}'
    c = db()
    rows = c.execute(sql, args).fetchall()
    c.close()
    more = bool(p.get('details'))
    found = [{'path': r[0], **({'size': size_text(r[1]), 'modified': time.strftime('%Y-%m-%d', time.localtime(r[2]))} if more else {})} for r in rows]
    return {'found': found, 'summary': (f"Yes — {found[0]['path']}" + (f' (and {len(found) - 1} more)' if len(found) > 1 else '')) if found else 'Nothing by that name'}


def find_folder(p):
    """Folders whose path contains the words asked for — best match first (fewest extra words, shortest)."""
    want = [w for w in norm_words(p.get('query') or p.get('path') or '') if w not in ('ppcloud', 'v', 'w', 'x', 'y', 'z', 'c', 'd', 'e', 'f')]
    if not want:
        raise ValueError('Which folder?')
    c = db()
    sql = 'SELECT path, words FROM dirs WHERE ' + ' AND '.join(['words LIKE ?'] * len(want))
    rows = c.execute(sql + ' LIMIT 400', [f'%{w}%' for w in want]).fetchall()
    if not rows:                               # none has every word — the folders with the most of them
        rows = c.execute('SELECT path, words FROM dirs WHERE ' + ' OR '.join(['words LIKE ?'] * len(want)) + ' LIMIT 2000', [f'%{w}%' for w in want]).fetchall()
    c.close()
    def score(r):
        words = r[1].split()
        hits = sum(1 for w in want if any(w in x for x in words))
        return (-hits, len(words), len(r[0]))
    best = sorted(rows, key=score)[:int(p.get('limit') or 5)]
    found = [r[0] for r in best]
    return {'found': found, 'summary': (f'Yes — {found[0]}' + (f' (and {len(found) - 1} more)' if len(found) > 1 else '')) if found else 'No folder by that name'}


def list_folder(p):
    asked = p.get('path')
    path = real_path(asked)
    note = None
    if not path or not os.path.isdir(path):
        # a guessed path: the closest real folder, and say so
        guess = find_folder({'query': asked, 'limit': 1}).get('found') or []
        if not guess:
            raise ValueError(f'No folder at {asked}, and nothing similar — try find_folder with a few words')
        path, note = guess[0], f'No folder at {asked}; showing the closest match'
    items = []
    with os.scandir(path) as it:
        for e in sorted(it, key=lambda x: x.name.lower())[:200]:
            try:
                items.append({'name': e.name, 'folder': e.is_dir(), **({'size': None if e.is_dir() else size_text(e.stat().st_size)} if p.get('details') else {})})
            except OSError:
                pass
    return {'path': path, 'note': note, 'items': items, 'summary': (note + ': ' if note else '') + f'{len(items)} items in {path}'}


def make_folder(p):
    path = p.get('path')
    if not path:
        raise ValueError('Which folder?')
    os.makedirs(path, exist_ok=True)
    return {'summary': f'Folder ready: {path}'}


def copy_with_progress(src, dest, job, label):
    """Copy a file or a folder, reporting progress about every 10 s. Never overwrites."""
    src, dest = Path(src), Path(dest)
    if not src.exists():
        raise ValueError(f'Nothing at {src}')
    target = dest / src.name if dest.is_dir() or str(dest).endswith(('\\', '/')) else dest
    if target.exists():
        raise ValueError(f'{target} already exists — not overwriting')
    files = [src] if src.is_file() else [f for f in src.rglob('*') if f.is_file()]
    total = sum(f.stat().st_size for f in files) or 1
    done, last = 0, 0.0
    for f in files:
        out = target if src.is_file() else target / f.relative_to(src)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(f, 'rb') as a, open(out, 'wb') as b:
            while True:
                chunk = a.read(8 * 1024 * 1024)
                if not chunk:
                    break
                b.write(chunk)
                done += len(chunk)
                if time.time() - last > 10:
                    last = time.time()
                    post(f'/api/pc/jobs/{job}', {'status': 'running', 'progress': f'{label}: {round(done * 100 / total)}% ({gb(done)} of {size_text(total)})'})
        shutil.copystat(f, out)
    return target, total


def copy(p, job):
    p = {**p, 'path': real_path(p.get('path')) or p.get('path')}
    target, total = copy_with_progress(p.get('path'), p.get('dest'), job, 'Copying')
    return {'summary': f'Copied {size_text(total)} to {target}'}


def move(p, job):
    p = {**p, 'path': real_path(p.get('path')) or p.get('path')}
    src = p.get('path')
    target, total = copy_with_progress(src, p.get('dest'), job, 'Moving')
    # the original goes only after the copy is complete — moved, never lost
    if Path(src).is_file():
        os.remove(src)
    else:
        shutil.rmtree(src)
    return {'summary': f'Moved {size_text(total)} to {target}'}


def upload_drive(p, job):
    p = {**p, 'path': real_path(p.get('path')) or p.get('path')}
    drive = Path(CFG.get('drive_dir', r'G:\My Drive'))
    dest = drive / str(p.get('dest') or '').strip('\\/') if p.get('dest') else drive
    src = Path(p.get('path') or '')
    size = src.stat().st_size if src.is_file() else sum(f.stat().st_size for f in src.rglob('*') if f.is_file())
    free = shutil.disk_usage(drive.anchor).free
    if size > free:
        raise ValueError(f'Google Drive has {gb(free)} GB free — this is {gb(size)} GB. Free up space or upgrade the Drive plan first.')
    dest.mkdir(parents=True, exist_ok=True)
    target, total = copy_with_progress(src, dest, job, 'Uploading to Drive')
    return {'summary': f'{size_text(total)} is in Google Drive at {target} — Drive for desktop is syncing it now'}


_ENCODER = None


def encoder():
    """The fastest H.264 encoder that really works on this PC — tried once, then remembered."""
    global _ENCODER
    if _ENCODER:
        return _ENCODER
    for enc, extra in (('h264_nvenc', ['-preset', 'p4']), ('h264_qsv', ['-preset', 'faster']), ('libx264', ['-preset', 'veryfast'])):
        r = subprocess.run([CFG['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=1280x720:rate=25',
                            '-pix_fmt', 'yuv420p', '-c:v', enc, *extra, '-f', 'null', '-'], capture_output=True, text=True, creationflags=0x08000000)
        if r.returncode == 0:
            _ENCODER = (enc, extra)
            log('proxy encoder:', enc)
            return _ENCODER
    raise RuntimeError('No working H.264 encoder in ffmpeg')


def make_proxies(p, job):
    p = {**p, 'path': real_path(p.get('path')) or p.get('path')}
    folder = Path(p.get('path') or '')
    if not folder.is_dir():
        raise ValueError(f'No folder at {folder}')
    clips = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in VIDEO - {'.braw', '.r3d'})
    if not clips:
        raise ValueError('No video clips in that folder')
    out = folder / 'Proxy'
    out.mkdir(exist_ok=True)
    made = skipped = 0
    for i, clip in enumerate(clips, 1):
        target = out / (clip.stem + '.mov')
        if target.exists():
            skipped += 1
            continue
        post(f'/api/pc/jobs/{job}', {'status': 'running', 'progress': f'Proxy {i} of {len(clips)}: {clip.name}'})
        enc, extra = encoder()
        hw = ['-hwaccel', 'cuda'] if enc == 'h264_nvenc' else []
        cmd = [CFG['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-y', *hw, '-i', str(clip),
               '-map', '0:v:0', '-map', '0:a?', '-vf', "scale='min(1920,iw)':-2", '-pix_fmt', 'yuv420p', '-c:v', enc, *extra, '-b:v', '10M',
               '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '0', str(target)]
        r = subprocess.run(cmd, capture_output=True, text=True, creationflags=0x08000000)
        if r.returncode != 0 and hw:
            # no CUDA decode for this codec — decode on the CPU, still encode on the GPU
            r = subprocess.run([x for x in cmd if x not in hw], capture_output=True, text=True, creationflags=0x08000000)
        if r.returncode != 0:
            raise RuntimeError(f'{clip.name}: {r.stderr.strip()[-300:]}')
        made += 1
    return {'made': made, 'skipped': skipped, 'folder': str(out), 'encoder': encoder()[0], 'summary': f'{made} proxies made in {out}' + (f' ({skipped} already there)' if skipped else '')}


def upload_to_gallery(p, job):
    p = {**p, 'path': real_path(p.get('path')) or p.get('path')}
    """A video into a client gallery's Videos folder — the very same direct-to-R2 upload the
    panel uses (begin → signed parts → complete), with a poster frame and the duration."""
    src = Path(p.get('path') or '')
    album = int(p.get('album_id') or 0)
    if not src.is_file():
        raise ValueError(f'No file at {src}')
    if not album:
        raise ValueError('Which gallery? (album_id)')
    size = src.stat().st_size
    tok = requests.post(SERVER + '/api/pc/vendor-token', headers=H, timeout=20).json().get('token')
    if not tok:
        raise RuntimeError('The server did not give an upload login')
    A = {'Authorization': f'Bearer {tok}'}
    api = f'{SERVER}/api/albums/{album}/videos'
    # poster (a frame 1 s in — films open on black) and duration, made here with ffmpeg
    poster = DATA / f'poster-{job}.jpg'
    ffprobe = str(Path(CFG['ffmpeg']).with_name('ffprobe.exe'))
    subprocess.run([CFG['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', str(src), '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", str(poster)],
                   capture_output=True, creationflags=0x08000000)
    dur = 0
    try:
        dur = float(subprocess.run([ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(src)],
                                   capture_output=True, text=True, creationflags=0x08000000).stdout.strip() or 0)
    except (OSError, ValueError):
        pass
    b = requests.post(api + '/begin', headers=A, json={'size_bytes': size, 'filename': src.name, 'content_type': 'video/mp4'}, timeout=60)
    if b.status_code != 200:
        raise RuntimeError(f"Upload refused: {b.json().get('error', b.status_code)}")
    meta = b.json()
    key, upload_id, part = meta['key'], meta['upload_id'], int(meta.get('part_size') or 64 * 1024 * 1024)
    try:
        sent, last, n = 0, 0.0, 0
        with open(src, 'rb') as fh:
            while True:
                chunk = fh.read(part)
                if not chunk:
                    break
                n += 1
                for attempt in range(4):
                    try:
                        url = requests.post(api + '/sign', headers=A, json={'key': key, 'upload_id': upload_id, 'part_number': n}, timeout=60).json()['url']
                        r = requests.put(url, data=chunk, timeout=900)
                        if r.status_code == 200:
                            break
                        raise RuntimeError(f'part {n}: {r.status_code}')
                    except (requests.RequestException, RuntimeError, KeyError):
                        if attempt == 3:
                            raise
                        time.sleep(2 * (attempt + 1))
                sent += len(chunk)
                if time.time() - last > 10:
                    last = time.time()
                    post(f'/api/pc/jobs/{job}', {'status': 'running', 'progress': f'Uploading {src.name}: {round(sent * 100 / size)}% ({gb(sent)} of {gb(size)} GB)'})
        # always a multipart form — the same shape the panel sends (the poster is optional)
        form = {'key': (None, key), 'upload_id': (None, upload_id), 'filename': (None, src.name), 'duration_s': (None, str(round(dur)))}
        fh_poster = open(poster, 'rb') if poster.exists() else None
        if fh_poster:
            form['poster'] = ('poster.jpg', fh_poster, 'image/jpeg')
        try:
            c = requests.post(api + '/complete', headers=A, files=form, timeout=600)
        finally:
            if fh_poster:
                fh_poster.close()
        if c.status_code != 200:
            raise RuntimeError(f"Finishing the upload failed: {c.json().get('error', c.status_code)}")
    except Exception:
        requests.post(api + '/abort', headers=A, json={'key': key, 'upload_id': upload_id}, timeout=60)   # no half film left in the bucket
        raise
    finally:
        poster.unlink(missing_ok=True)
    post('/api/pc/delivered', {'album_id': album, 'file_name': src.name, 'size_bytes': size, 'source_path': str(src)})
    return {'summary': f'{src.name} ({size_text(size)}) is in the gallery\'s Videos folder — the client can watch and download it with their usual login'}


# ── ⏻ power and apps (Raj, 2026-10-13: "it should be able to turn my computer off") ──
def power(p):
    """Shut down / restart in 60 s (cancellable), sleep, lock, or cancel a pending shutdown."""
    what = str(p.get('power') or p.get('query') or '').lower()
    hide = 0x08000000
    if what in ('shutdown', 'off', 'turn off', 'shut down'):
        subprocess.run(['shutdown', '/s', '/t', '60', '/c', 'Tornado: shutting down in 60 seconds. Say "cancel" to stop it.'], creationflags=hide)
        return {'summary': 'Shutting down in 60 seconds — say "cancel" to stop it'}
    if what in ('restart', 'reboot'):
        subprocess.run(['shutdown', '/r', '/t', '60', '/c', 'Tornado: restarting in 60 seconds. Say "cancel" to stop it.'], creationflags=hide)
        return {'summary': 'Restarting in 60 seconds — say "cancel" to stop it'}
    if what in ('cancel', 'abort', 'stop'):
        r = subprocess.run(['shutdown', '/a'], capture_output=True, text=True, creationflags=hide)
        return {'summary': 'Cancelled — the PC stays on' if r.returncode == 0 else 'There was no shutdown to cancel'}
    if what == 'lock':
        subprocess.run(['rundll32.exe', 'user32.dll,LockWorkStation'], creationflags=hide)
        return {'summary': 'Locked'}
    if what == 'sleep':
        threading.Timer(3, lambda: subprocess.run(['rundll32.exe', 'powrprof.dll,SetSuspendState', '0,1,0'], creationflags=hide)).start()
        return {'summary': 'Going to sleep now'}
    raise ValueError('power: shutdown, restart, sleep, lock or cancel')


def apps(_p):
    """What is open right now: the apps with a window on screen — names only (owner's note: no extras)."""
    ps = "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { if ($_.Description) { $_.Description } else { $_.ProcessName } }"
    out = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True, creationflags=0x08000000).stdout
    # Windows' own background pieces are not "apps he has open"
    skip = {'windows explorer', 'explorer', 'settings', 'windows input experience', 'text input application', 'program manager', 'python', 'pythonw',
            'application frame host', 'applicationframehost', 'textinputhost', 'shellexperiencehost', 'windows shell experience host', 'search', 'start',
            'nvidia app', 'nvidia overlay', 'nvidia share', 'lockapp', 'systemsettings', 'microsoft text input application', 'widgets'}
    def tidy(n):
        n = re.sub(r'\.root$', '', n.strip(), flags=re.I)              # "WhatsApp.Root" → "WhatsApp"
        return {'google chrome': 'Chrome', 'microsoft edge': 'Edge', 'parsecd': 'Parsec'}.get(n.lower(), n)
    names = sorted({tidy(n) for n in out.splitlines() if n.strip() and n.strip().lower() not in skip
                    and not n.strip().lower().endswith(' host') and 'webview' not in n.lower()})
    return {'open': names, 'summary': (', '.join(names) + ' — open') if names else 'Nothing is open'}


def _start_menu_apps():
    """Every Start-menu shortcut: name → path (the apps a person would open by name)."""
    roots = [os.path.join(os.environ.get('ProgramData', r'C:\ProgramData'), r'Microsoft\Windows\Start Menu\Programs'),
             os.path.join(os.environ.get('APPDATA', ''), r'Microsoft\Windows\Start Menu\Programs')]
    apps = {}
    for r in roots:
        for dp, _dn, files in os.walk(r):
            for fn in files:
                if fn.lower().endswith(('.lnk', '.url')) and 'uninstall' not in fn.lower():
                    apps[os.path.splitext(fn)[0]] = os.path.join(dp, fn)
    # Microsoft Store apps (e.g. WhatsApp) have no shortcut file: Windows lists them with their app id
    try:
        out = subprocess.run(['powershell', '-NoProfile', '-Command', 'Get-StartApps | ForEach-Object { $_.Name + "|" + $_.AppID }'],
                             capture_output=True, text=True, creationflags=0x08000000, timeout=20).stdout
        for line in out.splitlines():
            name, _, appid = line.partition('|')
            if name.strip() and appid.strip() and name.strip() not in apps and 'uninstall' not in name.lower():
                apps[name.strip()] = 'shell:AppsFolder\\' + appid.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return apps


def app_name(p):
    return p.get('query') or p.get('name') or p.get('app') or p.get('path') or ''


def open_app(p):
    want = norm_words(app_name(p))
    if not want:
        raise ValueError('Which app?')
    apps = _start_menu_apps()
    best = sorted(((sum(1 for w in want if w in ' '.join(norm_words(n))), -len(n), n) for n in apps), reverse=True)
    if not best or best[0][0] == 0:
        raise ValueError(f"No app called {' '.join(want)} in the Start menu")
    name = best[0][2]
    target = apps[name]
    if target.startswith('shell:AppsFolder'):
        subprocess.Popen(['explorer.exe', target], creationflags=0x08000000)   # a Store app
    else:
        os.startfile(target)
    return {'summary': f'Opening {name}'}


def close_app(p):
    """Closes it the normal way (so it can ask to save) — never force-killed."""
    want = norm_words(app_name(p))
    if not want:
        raise ValueError('Which app?')
    tasks = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True, creationflags=0x08000000).stdout
    names = sorted({line.split('","')[0].strip('"') for line in tasks.splitlines() if line})
    hits = [n for n in names if all(w in n.lower() for w in want)] or [n for n in names if any(w in n.lower() for w in want)]
    if not hits:
        return {'summary': f"{' '.join(want)} isn't open"}
    for n in hits[:3]:
        subprocess.run(['taskkill', '/im', n], capture_output=True, creationflags=0x08000000)
    return {'summary': f"Closing {', '.join(hits[:3])}"}


def setup_wake(_p):
    """Lets a Wake-on-LAN packet wake the PC from sleep too: the wired network card may wake it, on a magic packet only."""
    ps = r'''
$out = @()
Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.MediaType -eq '802.3' } | ForEach-Object {
  $n = $_.Name
  try { Set-NetAdapterPowerManagement -Name $n -WakeOnMagicPacket Enabled -ErrorAction Stop; $out += "$n magic packet: on" } catch { $out += "$n magic packet: $($_.Exception.Message)" }
  try { Set-NetAdapterAdvancedProperty -Name $n -DisplayName 'Wake on Magic Packet' -DisplayValue 'Enabled' -ErrorAction Stop } catch {}
  powercfg /deviceenablewake "$($_.InterfaceDescription)" 2>$null | Out-Null
  $out += "$n may wake the PC: $((powercfg /devicequery wake_armed) -contains $_.InterfaceDescription)"
}
$out -join '; '
'''
    r = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True, creationflags=0x08000000, timeout=60)
    return {'summary': (r.stdout.strip() or r.stderr.strip() or 'done')[:300]}


ACTIONS = {'status': lambda p, j: status(p), 'details': lambda p, j: details(p), 'find_files': lambda p, j: find_files(p), 'list_folder': lambda p, j: list_folder(p),
           'make_folder': lambda p, j: make_folder(p), 'find_folder': lambda p, j: find_folder(p), 'copy': copy, 'move': move, 'upload_drive': upload_drive, 'make_proxies': make_proxies,
           'upload_to_gallery': upload_to_gallery,
           'power': lambda p, j: power(p), 'apps': lambda p, j: apps(p), 'setup_wake': lambda p, j: setup_wake(p), 'open_app': lambda p, j: open_app(p), 'close_app': lambda p, j: close_app(p)}


def run(job):
    jid, action, params = job['id'], job['action'], job.get('params') or {}
    log('job', jid, action, params)
    awake(True)
    try:
        fn = ACTIONS.get(action)
        if not fn:
            raise ValueError(f'Unknown action {action}')
        result = fn(params, jid)
        post(f'/api/pc/jobs/{jid}', {'status': 'done', 'result': result, 'summary': result.get('summary', 'done')})
    except Exception as e:
        log('job failed', jid, traceback.format_exc())
        post(f'/api/pc/jobs/{jid}', {'status': 'failed', 'result': {'error': str(e)}, 'summary': str(e)[:300]})
    finally:
        awake(False)


MY_VERSION = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]


# ✍️ SIGNED UPDATES (Raj, 2026-10-19): a new agent is installed only if it carries Raj's signature. The private
# key lives only on Raj's Windows PC (C:/Users/rajbr/pc-agent-signing) — never on a server, never on GitHub — so
# nobody who can change a server or the code can make this PC run their program. RSA-3072, SHA-256, PKCS#1 v1.5.
UPDATE_KEY_N = int('d343c3e6f4da3edefc33b2551b3d61fab2a9948b7e24a93fcde29997f399790c1eb152143e248721165a1a10b23baef1426020e1c7c5197775c67542dacdfacd45a10f8ce8332b55d0c148caf402db6d506e8fd05b2e1e592853c2fa8f8f62302aeaed7003faaa802c1adf15463991615176709a8242e6f526619ef05e8b0784fbbc0c5086e115a13805c4b76ff77906ab33e044cbbf6ba636b9d0a7e8066226188079e85a3fa25c92a6c49fb869ac5d79ef10b1dd79cea325d14543273590a421778e4a13cd792c28e4752251fa0fb6ee6a4c03441e751131206a4baf74ee655b23392635292506768a2c35ab29c5dcf0ca6cd20ff4036e07bbf8f542217039d3dc8736cc3c7e6f0455ae022fe27f10435dabf66bf5a695d0a5bc6ce1bf43fdacf5d410f8c71262529af4a669f10f171394160e66ff412ee95442840e014457d50f512d059538f8e51bedf9e37a66f07eb711809789f056de8b53f30d076a227c6c02dce4c9ddf9534aaef3fc63126a4bbd00d6697562bd1ea876bdaf91cbdf', 16)
UPDATE_KEY_E = 65537
_SHA256_INFO = bytes.fromhex('3031300d060960864801650304020105000420')


def signed_by_raj(code, sig_b64):
    """True only when sig_b64 is Raj's signature of exactly these bytes."""
    import base64, hmac
    try:
        s = int.from_bytes(base64.b64decode(sig_b64 or '', validate=True), 'big')
    except Exception:
        return False
    k = (UPDATE_KEY_N.bit_length() + 7) // 8
    if not 0 < s < UPDATE_KEY_N:
        return False
    em = pow(s, UPDATE_KEY_E, UPDATE_KEY_N).to_bytes(k, 'big')
    info = _SHA256_INFO + hashlib.sha256(code).digest()
    expected = b'\x00\x01' + b'\xff' * (k - len(info) - 3) + b'\x00' + info
    return hmac.compare_digest(em, expected)


def update_if_newer(current):
    """The server holds the current agent.py; when it differs, replace this file and restart."""
    if not current or current == MY_VERSION:
        return
    r = requests.get(SERVER + '/api/pc/agent', headers=H, timeout=60)
    if r.status_code != 200:
        return
    code = r.content
    if hashlib.sha256(code).hexdigest()[:16] != current:
        log('update: download did not match the version — skipped')
        return
    if not signed_by_raj(code, r.headers.get('X-Agent-Signature', '')):
        log('update REFUSED: not signed by Raj - this PC keeps running the version it has')   # ✍️
        return
    me = Path(__file__)
    me.with_suffix('.py.bak').write_bytes(me.read_bytes())
    me.write_bytes(code)
    log('updated', MY_VERSION, '->', current, '— restarting')
    os.execv(sys.executable, [sys.executable, str(me)] + (['--helper'] if HELPER else []))


def hello_loop():
    while True:
        try:
            r = requests.post(SERVER + '/api/pc/hello', headers=H, json={**details({}), 'version': MY_VERSION}, timeout=20)
            if r.status_code == 200:
                update_if_newer((r.json() or {}).get('agent_version'))
        except Exception:
            log('hello error', traceback.format_exc())
        time.sleep(30)


def awake(on):
    """While a job runs, Windows doesn't fall asleep in the middle of it; afterwards it may sleep as usual."""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | (0x00000001 if on else 0))
    except Exception:
        pass


HELPER = '--helper' in sys.argv     # 🔌 the startup helper: runs from boot (even at the sign-in screen), status + power only


def helper_hello_loop():
    """The startup helper only says "I'm on" (and keeps itself up to date) — the full agent says the rest."""
    while True:
        try:
            r = requests.post(SERVER + '/api/pc/hello', headers=H, json={'version': MY_VERSION, 'helper': True, 'summary': f"{os.environ.get('COMPUTERNAME')} is on"}, timeout=20)
            if r.status_code == 200:
                update_if_newer((r.json() or {}).get('agent_version'))
        except Exception:
            log('helper hello error', traceback.format_exc())
        time.sleep(30)


def main():
    log('helper start' if HELPER else 'agent start')
    if HELPER:
        threading.Thread(target=helper_hello_loop, daemon=True).start()
    else:
        threading.Thread(target=index_loop, daemon=True).start()
        threading.Thread(target=hello_loop, daemon=True).start()
    while True:
        try:
            r = requests.get(SERVER + '/api/pc/next' + ('?can=status,power,setup_wake' if HELPER else ''), headers=H, timeout=40)
            if r.status_code == 200:
                threading.Thread(target=run, args=(r.json(),), daemon=True).start()
            elif r.status_code == 401:
                log('server refused the token — check config.json'); time.sleep(60)
        except requests.RequestException:
            time.sleep(5)


if __name__ == '__main__':
    if '--index-once' in sys.argv:
        build_index(); print(open(LOG, encoding='utf-8').read().splitlines()[-1])
    else:
        main()
