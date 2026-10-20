import { useState, useEffect, useRef, useCallback } from 'react';
import { api, authFetch } from '../lib/api';
import { fmtBytes } from './FileFlyerView.jsx';
import { useDialog } from '../lib/dialog.jsx';
import ShareDialog from './ShareDialog.jsx';

/** Icon for a file with no preview — from the extension, since the stored mime
 *  is whatever the uploading client claimed and is often just octet-stream. */
function iconFor(name) {
  const e = (String(name).split('.').pop() || '').toLowerCase();
  if (/^(mp4|mov|avi|mkv|webm|m4v)$/.test(e)) return '🎬';
  if (/^(mp3|wav|aac|flac|m4a|ogg)$/.test(e)) return '🎵';
  if (/^pdf$/.test(e)) return '📕';
  if (/^(doc|docx|odt|rtf|txt|md)$/.test(e)) return '📄';
  if (/^(xls|xlsx|csv|ods)$/.test(e)) return '📊';
  if (/^(ppt|pptx|odp)$/.test(e)) return '📑';
  if (/^(zip|rar|7z|tar|gz)$/.test(e)) return '🗜️';
  if (/^(psd|ai|indd|xd|fig|sketch)$/.test(e)) return '🎨';
  if (/^(raw|cr2|nef|arw|dng)$/.test(e)) return '📷';
  return '📎';
}

/** ⋯ The quieter actions for one row. Destructive ones live here, never one click from the main action. */
function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="fd-more" ref={ref}>
      <button type="button" className="fd-act fd-more-btn" aria-label={`More for ${label}`} aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>⋯</button>
      {open && (
        <span className="fd-menu" role="menu">
          {items.map(i => (
            <button key={i.label} type="button" role="menuitem" className={`fd-menu-i ${i.danger ? 'is-del' : ''}`}
              onClick={e => { e.stopPropagation(); setOpen(false); i.run(e); }}>{i.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}

const looksVideo = (n) => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(String(n));

/** 🎬 A still frame from a video on the vendor's own computer (no upload needed to make it). null if the
    browser cannot read the video — the tile then keeps its film icon. */
function videoPoster(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (b) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(b || null); };
    v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = url;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 3) / 3); };
    v.onseeked = () => {
      try {
        const k = Math.min(1, 640 / (v.videoWidth || 640));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((v.videoWidth || 640) * k)); c.height = Math.max(1, Math.round((v.videoHeight || 360) * k));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(finish, 'image/jpeg', 0.82);
      } catch { finish(null); }
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 10000);
  });
}

const looksImage = (n) => /\.(jpe?g|png|webp|gif|avif|tiff?|bmp)$/i.test(String(n));

/**
 * 🖼️ A thumbnail behind an authenticated route.
 *
 * An img src cannot carry an Authorization header and these are a vendor's
 * private client files, so the bytes are fetched with the token and handed over
 * as a blob URL. Not a token in the query string — that writes the JWT into
 * server logs and referrer headers for every thumbnail on the page.
 */
function Thumb({ itemId, name }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false, objectUrl = null;
    (async () => {
      try {
        const res = await authFetch(`/files/item/${itemId}/thumb`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch { if (!dead) setFailed(true); }
    })();
    return () => { dead = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [itemId]);
  if (failed) return <>{iconFor(name)}</>;
  if (!url) return <span className="fd-wait" aria-hidden="true" />;
  return <img src={url} alt="" loading="lazy" />;
}

/**
 * 🔍 Full-screen viewer.
 *
 * Given the photographs in the folder and which one was opened, it steps
 * between them. Keyboard first — arrows and Escape are what anyone reaching
 * for a photo viewer expects, and a vendor checking a delivery will hold an
 * arrow key rather than aim at a button.
 *
 * The neighbours are prefetched so pressing right does not blank the screen
 * while a 1800px webp arrives. Each blob URL is revoked when the viewer closes;
 * without that, walking a folder of two hundred photographs would hold every
 * one of them in memory until the tab was closed.
 */
function Viewer({ photos, index, onIndex, onClose }) {
  const [url, setUrl] = useState(null);
  const cache = useRef(new Map());
  const photo = photos[index];

  const fetchOne = useCallback(async (it) => {
    if (!it) return null;
    if (cache.current.has(it.id)) return cache.current.get(it.id);
    try {
      const res = await authFetch('/files/item/' + it.id + '/thumb?size=lg');
      if (!res.ok) throw new Error(String(res.status));
      const u = URL.createObjectURL(await res.blob());
      cache.current.set(it.id, u);
      return u;
    } catch { return null; }
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      const u = await fetchOne(photo);
      if (!dead) setUrl(u);
      // the two you are most likely to ask for next
      fetchOne(photos[index + 1]);
      fetchOne(photos[index - 1]);
    })();
    return () => { dead = true; };
  }, [photo, index, photos, fetchOne]);

  // every object URL made here is released together when the viewer closes
  useEffect(() => {
    const made = cache.current;
    return () => { for (const u of made.values()) URL.revokeObjectURL(u); made.clear(); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);

  if (!photo) return null;
  return (
    <div className="fv" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="fv-x" onClick={onClose} aria-label="Close">✕</button>
      <span className="fv-count">{index + 1} of {photos.length}</span>

      {index > 0 && (
        <button className="fv-nav is-prev" onClick={() => onIndex(index - 1)} aria-label="Previous">‹</button>
      )}
      <figure className="fv-stage">
        {url
          ? <img src={url} alt={photo.filename} />
          : <span className="fv-wait" aria-hidden="true" />}
        <figcaption className="fv-cap">{photo.filename}</figcaption>
      </figure>
      {index < photos.length - 1 && (
        <button className="fv-nav is-next" onClick={() => onIndex(index + 1)} aria-label="Next">›</button>
      )}
    </div>
  );
}

/**
 * 🗂️ The vendor's drive.
 *
 * One header, not three. Whether a folder is shared is shown on the folder
 * itself rather than in a separate list underneath — a shared folder is still
 * just a folder, and repeating it below was saying the same thing twice while
 * making both harder to read.
 */
export default function ShareDrive({onStorage, tabs }) {
  const dialog = useDialog();
  // 🔗 every folder has its own address (/panel/fileflyer/<id>): bookmarkable, and the Back button works
  const [folderId, setFolderIdState] = useState(() => { const m = location.pathname.match(/^\/panel\/fileflyer\/(\d+)/); return m ? Number(m[1]) : null; });
  const setFolderId = useCallback((id) => {
    setFolderIdState(id || null);
    const path = id ? `/panel/fileflyer/${id}` : '/panel/fileflyer';
    if (location.pathname !== path) history.pushState(null, '', path);
  }, []);
  useEffect(() => {
    const back = () => { const m = location.pathname.match(/^\/panel\/fileflyer\/(\d+)/); setFolderIdState(m ? Number(m[1]) : null); };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const [trail, setTrail] = useState([]);
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [share, setShare] = useState(null);
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem('ff_view') || 'grid');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState(() => localStorage.getItem('ff_sort') || 'modified');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [everywhere, setEverywhere] = useState(false);
  const [found, setFound] = useState(null);       // search results across the whole drive
  const [moving, setMoving] = useState(null);     // { kind: 'file' | 'folder', id, name }
  const [queue, setQueue] = useState([]);         // uploads: { key, name, size, status, done, total, error }
  const [prog, setProg] = useState('');          // part x of y, while a big file uploads
  const [pending, setPending] = useState([]);    // uploads that never finished
  const resumeInput = useRef(null);
  const resumeFor = useRef(null);
  const [zipping, setZipping] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const [sharing, setSharing] = useState(null);    // { folder, share } open in the Share dialog
  const [viewing, setViewing] = useState(-1);       // index into photos, -1 = closed
  const fileRef = useRef(null);

  // held in a ref so a parent passing an inline arrow cannot rebuild load()
  // every render and spin the effect below
  const onStorageRef = useRef(onStorage);
  useEffect(() => { onStorageRef.current = onStorage; }, [onStorage]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1800); };
  const chooseView = (v) => { setView(v); localStorage.setItem('ff_view', v); };
  const chooseSort = (v) => { setSort(v); localStorage.setItem('ff_sort', v); };
  useEffect(() => {
    const term = q.trim();
    if (!everywhere || !term) { setFound(null); return undefined; }
    const t = setTimeout(() => { api.searchFiles(term).then(setFound).catch(() => setFound({ folders: [], items: [] })); }, 250);
    return () => clearTimeout(t);
  }, [q, everywhere]);

  const load = useCallback(async (fid) => {
    setLoading(true);
    try {
      const d = await api.drive(fid);
      setTrail(d.trail || []); setFolders(d.folders || []); setItems(d.items || []);
      setShare(d.share || null);
      if (d.storage) { setStorage(d.storage); onStorageRef.current?.(d.storage); }
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(folderId); }, [folderId, load]);

  async function download(pathname, filename) {
    setZipping(true);
    try {
      const res = await authFetch(pathname);
      if (!res.ok) throw new Error('That could not be fetched.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setZipping(false); }
  }

  async function newFolder() {
    const name = await dialog.prompt('What should it be called?', '', { title: 'New folder', okLabel: 'Create' });
    if (!name?.trim()) return;
    try { await api.createFolder({ name: name.trim(), parent_id: folderId }); load(folderId); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  async function renameFolder(f, e) {
    e.stopPropagation();
    const name = await dialog.prompt('New name', f.name, { title: 'Rename folder', okLabel: 'Rename' });
    if (!name?.trim() || name.trim() === f.name) return;
    try { await api.renameFolder(f.id, name.trim()); load(folderId); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function removeFolder(f, e) {
    e.stopPropagation();
    if (!await dialog.confirm(`"${f.name}" and everything inside it will be deleted. This cannot be undone.`,
      { title: 'Delete folder?', okLabel: 'Delete' })) return;
    try { await api.deleteFolder(f.id); load(folderId); flash('🗑️ Deleted'); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function removeItem(it, e) {
    e.stopPropagation();
    if (!await dialog.confirm(`"${it.filename}" will be deleted.`, { title: 'Delete file?', okLabel: 'Delete' })) return;
    try { await api.deleteShareItem(it.id); load(folderId); flash('🗑️ Deleted'); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function upload(files) {
    if (!files?.length) return;
    const add = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, name: f.name, size: f.size, status: 'waiting', done: 0, total: 0 }));
    setQueue(qu => [...qu.filter(x => x.status !== 'done'), ...add]);
    setBusy(true);
    let ok = 0;
    for (const job of add) {
      const set = (patch) => setQueue(qu => qu.map(x => (x.key === job.key ? { ...x, ...patch } : x)));
      set({ status: 'uploading' });
      try {
        const poster = looksVideo(job.name) ? await videoPoster(job.file) : null;
        await api.uploadShareFiles([job.file], folderId, (name, done, total) => set({ done, total }));
        if (poster) {
          const d = await api.drive(folderId).catch(() => null);
          const mine = (d?.items || []).filter(i => i.filename === job.name).sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
          if (mine) await api.uploadPoster(mine.id, poster).catch(() => {});   // no poster is fine: the film icon stays
        }
        set({ status: 'done' }); ok++;
      } catch (e) { set({ status: 'failed', error: e.message }); }
    }
    load(folderId); loadPending();
    setBusy(false); setProg('');
    if (ok) flash(`✅ ${ok} added`);
  }

  /** Uploads that started and never finished — shown so they are not lost.
      useCallback so the effect below can depend on it honestly rather than
      silencing the warning that it does not. */
  const loadPending = useCallback(async () => {
    try { setPending((await api.bigPending()).pending || []); } catch { /* not fatal */ }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  /** Carry on one of them. The file has to be picked again; only the missing
      parts are sent. */
  async function resume(p, file) {
    setBusy(true);
    try {
      await api.resumeBigUpload(p.id, file,
        (name, done, total) => setProg(`${name} — part ${done} of ${total}`));
      load(folderId); loadPending(); flash('✅ Finished');
    }
    catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); setProg(''); }
  }

  async function discard(p) {
    if (!await dialog.confirm(`"${p.filename}" was never finished. Throw it away?`,
      { title: 'Discard upload?', okLabel: 'Discard' })) return;
    try { await api.bigDiscard(p.id); loadPending(); flash('🗑️ Discarded'); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  /** 🔗 Open the Share dialog: nothing becomes public until the dialog's "Create link" is pressed. */
  const openShare = (folder, folderShare, e) => { e?.stopPropagation(); setSharing({ folder, share: folderShare || null }); };

  const photos = items.filter(i => looksImage(i.filename));
  const openPhoto = (it) => { const i = photos.findIndex(p => p.id === it.id); if (i > -1) setViewing(i); };

  const here = trail.length ? trail[trail.length - 1].name : 'My files';
  const isEmpty = !loading && !found && !folders.length && !items.length;
  const byDate = (x) => new Date(x.modified_at || x.created_at || 0).getTime();
  const order = (a, b, nameKey) => (sort === 'name' ? String(a[nameKey]).localeCompare(String(b[nameKey]))
    : sort === 'size' ? (b.size_bytes || 0) - (a.size_bytes || 0) : byDate(b) - byDate(a));
  const needle = q.trim().toLowerCase();
  const srcFolders = found ? found.folders : folders;
  const srcItems = found ? found.items : items;
  const shownFolders = filter === 'files' ? [] : srcFolders
    .filter(f => (!needle || f.name.toLowerCase().includes(needle)) && (filter !== 'shared' || f.share))
    .sort((a, b) => order(a, b, 'name'));
  const shownItems = filter === 'folders' || filter === 'shared' ? [] : srcItems
    .filter(i => !needle || i.filename.toLowerCase().includes(needle))
    .sort((a, b) => order(a, b, 'filename'));
  const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const pct = storage ? Math.min(100, Math.round(storage.used_bytes / storage.limit_bytes * 100)) : 0;
  const noMatch = !loading && !isEmpty && !shownFolders.length && !shownItems.length;

  return (
    <div className="fd"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); upload([...(e.dataTransfer?.files || [])]); }}>

      {/* one bar: where you are, what you can do, how full you are */}
      {/* 🔄 Uploads that started and never finished. Shown rather than
          silently forgotten: a delivery that died at ninety per cent is worth
          an hour of somebody's evening, and the parts are sitting in the bucket
          either way until they are used or discarded. */}
      {pending.length > 0 && (
        <div className="fd-resume">
          {pending.map(p => (
            <div key={p.id} className="fd-resume-row">
              <span className="fd-resume-ic">🔄</span>
              <span className="fd-resume-name">{p.filename}</span>
              <span className="fd-resume-at">
                {fmtBytes(p.bytes_done)} of {fmtBytes(p.size_bytes)} sent
              </span>
              <button className="fd-resume-go" disabled={busy}
                onClick={() => { resumeFor.current = p; resumeInput.current?.click(); }}>
                Pick the file to carry on
              </button>
              <button className="fd-resume-x" onClick={() => discard(p)} aria-label="Discard">✕</button>
            </div>
          ))}
          {/* The browser cannot hold a file across a reload, so it has to be
              chosen again — but only the missing parts are sent. */}
          <input ref={resumeInput} type="file" hidden onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f && resumeFor.current) resume(resumeFor.current, f);
          }} />
        </div>
      )}

      <div className="fd-sticky">
      <div className="fd-bar">
        {tabs}
        <nav className="fd-crumbs" aria-label="Location">
          <button className={`fd-crumb ${!folderId ? 'is-here' : ''}`} onClick={() => setFolderId(null)}>My files</button>
          {trail.map(t => (
            <span key={t.id} className="fd-crumb-wrap">
              <span className="fd-sep" aria-hidden="true">/</span>
              <button className={`fd-crumb ${t.id === folderId ? 'is-here' : ''}`}
                onClick={() => setFolderId(t.id)}>{t.name}</button>
            </span>
          ))}
          {folderId && (
            <button className={`fd-tag ${share ? 'is-on' : ''}`} onClick={e => openShare({ id: folderId, name: here }, share, e)}>
              {share ? 'Shared · link' : 'Share'}
            </button>
          )}
        </nav>

        <div className="fd-find">
          <input className="fd-search" type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search"
            placeholder={everywhere ? 'Search all your files' : 'Search this folder'} />
          <label className="fd-everywhere"><input type="checkbox" checked={everywhere} onChange={e => setEverywhere(e.target.checked)} /> everywhere</label>
        </div>

        <div className="fd-actions">
          <button className="fd-b is-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? (prog || 'Uploading…') : 'Upload'}
          </button>
          <button className="fd-b" onClick={newFolder}>New folder</button>
          {/* only offered inside a folder — zipping the entire drive is rarely
              what anyone wants and it crowded the one action that matters */}
          {folderId && (
            <button className="fd-b" disabled={zipping}
              onClick={() => download(`/files/zip?folder=${folderId}`, here + '.zip')}>
              {zipping ? 'Preparing…' : 'Download'}
            </button>
          )}
          <div className="fd-view" role="group" aria-label="View">
            <button className={`fd-v ${view === 'grid' ? 'is-on' : ''}`} onClick={() => chooseView('grid')} title="Thumbnails">▦</button>
            <button className={`fd-v ${view === 'list' ? 'is-on' : ''}`} onClick={() => chooseView('list')} title="List">☰</button>
          </div>
        </div>
      </div>

      <div className="fd-chips">
        {[['all', 'All'], ['folders', 'Folders'], ['files', 'Files'], ['shared', 'Shared']].map(([k, l]) => (
          <button key={k} type="button" className={`fd-chip ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <span className="fd-spacer" />
        <label className="fd-sort">Sort
          <select value={sort} onChange={e => chooseSort(e.target.value)}>
            <option value="modified">Recently modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </label>
      </div>
      </div>

      {/* the sidebar already shows storage; here only as a warning when it is nearly full */}
      {storage && pct > 80 && (
        <div className="fd-quota">
          <div className="fd-quota-bar"><span className={pct > 90 ? 'is-full' : ''} style={{ width: `${pct}%` }} /></div>
          <span className="fd-quota-t">⚠️ {fmtBytes(storage.used_bytes)} of {fmtBytes(storage.limit_bytes)} used ({pct}%)</span>
        </div>
      )}

      <input ref={fileRef} type="file" multiple hidden
        onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />

      {msg && <p className="fd-msg">{msg}</p>}

      {queue.length > 0 && (
        <div className="fd-queue" aria-live="polite">
          <div className="fd-queue-h">
            <b>Uploads</b>
            <span className="fd-quiet">Up to 2 GB goes up in one go; bigger files go up in parts and can resume.</span>
            {!busy && <button type="button" className="fd-act" onClick={() => setQueue([])}>Clear</button>}
          </div>
          {queue.map(j => (
            <div key={j.key} className={`fd-q is-${j.status}`}>
              <span className="fd-q-n" title={j.name}>{j.name}</span>
              <span className="fd-q-s">{fmtBytes(j.size)}</span>
              <progress className="fd-q-bar" max={100} value={j.status === 'done' ? 100 : j.status === 'waiting' ? 0 : j.total ? Math.round(j.done / j.total * 100) : undefined} />
              <span className="fd-q-st">{j.status === 'done' ? 'Done' : j.status === 'failed' ? (j.error || 'Failed') : j.status === 'waiting' ? 'Waiting' : j.total ? `${Math.round(j.done / j.total * 100)}%` : 'Uploading…'}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? <p className="fd-quiet">Loading…</p>
        : isEmpty ? (
          <div className="fd-empty">
            <div className="fd-empty-art" aria-hidden="true">📂</div>
            <p className="fd-empty-t">Nothing here yet</p>
            <p className="fd-quiet">Drag files onto this page, or:</p>
            <div className="fd-empty-acts">
              <button type="button" className="fd-b is-primary" onClick={() => fileRef.current?.click()}>Upload files</button>
              <button type="button" className="fd-b" onClick={newFolder}>New folder</button>
            </div>
            <p className="fd-quiet fd-limit">Any file type. Up to 2 GB goes up in one go; bigger files go up in parts and can resume.</p>
          </div>
        ) : noMatch ? (
          <p className="fd-quiet">Nothing matches{needle ? ` "${q.trim()}"` : ''}{filter !== 'all' ? ` in ${filter}` : ''}.</p>
        ) : view === 'grid' ? (
          <div className="fd-grid">
            {shownFolders.map(f => (
              <div key={'f' + f.id} className="fd-tile is-folder" role="button" tabIndex={0}
                onClick={() => setFolderId(f.id)}
                onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setFolderId(f.id); }}>
                {f.previews?.length ? (
                  <span className={`fd-ic fd-collage is-n${Math.min(4, f.previews.length)}`}>
                    {f.previews.slice(0, 4).map(id => <span key={id} className="fd-collage-cell"><Thumb itemId={id} name="" /></span>)}
                    <span className="fd-folder-badge" aria-hidden="true">📁</span>
                  </span>
                ) : <span className="fd-ic">📁</span>}
                <span className="fd-name">{f.name}</span>
                <span className="fd-meta">{f.file_count} item{f.file_count === 1 ? '' : 's'} · {when(f.modified_at)}{f.in_folder ? ` · in ${f.in_folder}` : ''}</span>
                {f.share && <span className="fd-pill">Shared · link</span>}
                <span className="fd-acts">
                  <button type="button" className="fd-act" onClick={e => openShare(f, f.share, e)}>{f.share ? 'Shared' : 'Share'}</button>
                  <RowMenu label={f.name} items={[
                    { label: 'Rename', run: e => renameFolder(f, e) },
                    { label: 'Download', run: () => download(`/files/zip?folder=${f.id}`, f.name + '.zip') },
                    { label: 'Move to…', run: () => setMoving({ kind: 'folder', id: f.id, name: f.name }) },
                    { label: 'Delete…', run: e => removeFolder(f, e), danger: true },
                  ]} />
                </span>
              </div>
            ))}
            {shownItems.map(it => (
              <div key={'i' + it.id}
                className={`fd-tile ${looksImage(it.filename) ? 'is-photo' : ''}`}
                title={it.filename}
                onClick={() => looksImage(it.filename) && openPhoto(it)}>
                <span className="fd-ic">
                  {looksImage(it.filename) || looksVideo(it.filename) ? <Thumb itemId={it.id} name={it.filename} /> : iconFor(it.filename)}
                  {looksVideo(it.filename) && <span className="fd-play" aria-hidden="true">▶</span>}
                </span>
                <span className="fd-name">{it.filename}</span>
                <span className="fd-meta">{fmtBytes(it.size_bytes)} · {when(it.created_at)}{it.in_folder ? ` · in ${it.in_folder}` : ''}</span>
                <span className="fd-acts">
                  <button type="button" className="fd-act" onClick={e => { e.stopPropagation(); download(`/files/item/${it.id}/download`, it.filename); }}>Download</button>
                  <RowMenu label={it.filename} items={[{ label: 'Move to…', run: () => setMoving({ kind: 'file', id: it.id, name: it.filename }) }, { label: 'Delete…', run: e => removeItem(it, e), danger: true }]} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <table className="fd-table">
            <thead><tr><th>Name</th><th>Modified</th><th>Size</th><th>Added by</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {shownFolders.map(f => (
                <tr key={'f' + f.id} className="fd-row is-folder" onClick={() => setFolderId(f.id)}>
                  <td><span className="fd-row-ic">📁</span>{f.name}<span className="fd-sub">{f.file_count} item{f.file_count === 1 ? '' : 's'}{f.in_folder ? ` · in ${f.in_folder}` : ''}</span>{f.share && <span className="fd-pill is-inline">Shared · link</span>}</td>
                  <td className="fd-quiet">{when(f.modified_at)}</td>
                  <td>{f.size_bytes ? fmtBytes(f.size_bytes) : '—'}</td>
                  <td className="fd-quiet">—</td>
                  <td className="fd-row-acts">
                    <button type="button" className="fd-act" onClick={e => openShare(f, f.share, e)}>{f.share ? 'Shared' : 'Share'}</button>
                    <RowMenu label={f.name} items={[
                      { label: 'Rename', run: e => renameFolder(f, e) },
                      { label: 'Download', run: () => download(`/files/zip?folder=${f.id}`, f.name + '.zip') },
                    { label: 'Move to…', run: () => setMoving({ kind: 'folder', id: f.id, name: f.name }) },
                      { label: 'Delete…', run: e => removeFolder(f, e), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
              {shownItems.map(it => (
                <tr key={'i' + it.id}
                  className={`fd-row ${looksImage(it.filename) ? 'is-photo' : ''}`}
                  onClick={() => looksImage(it.filename) && openPhoto(it)}>
                  <td><span className="fd-row-ic">{iconFor(it.filename)}</span>{it.filename}</td>
                  <td className="fd-quiet">{when(it.created_at)}</td>
                  <td>{fmtBytes(it.size_bytes)}{it.in_folder ? <span className="fd-sub">in {it.in_folder}</span> : null}</td>
                  <td className="fd-quiet">{it.uploaded_by === 'client' ? (it.uploader_name || 'Client') : 'You'}</td>
                  <td className="fd-row-acts">
                    <button type="button" className="fd-act" onClick={e => { e.stopPropagation(); download(`/files/item/${it.id}/download`, it.filename); }}>Download</button>
                    <RowMenu label={it.filename} items={[{ label: 'Move to…', run: () => setMoving({ kind: 'file', id: it.id, name: it.filename }) }, { label: 'Delete…', run: e => removeItem(it, e), danger: true }]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {dragging && <div className="fd-drop">Drop to upload into {here}</div>}

      {moving && <MoveDialog what={moving} onClose={() => setMoving(null)} onMoved={() => { setMoving(null); load(folderId); flash('↪️ Moved'); }} />}
      {sharing && <ShareDialog folder={sharing.folder} share={sharing.share} onClose={() => setSharing(null)} onChanged={() => load(folderId)} />}

      {viewing > -1 && (
        <Viewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(-1)} />
      )}
    </div>
  );
}

/** ↪️ Move a file or folder: pick where. A folder is never offered itself or its own sub-folders. */
function MoveDialog({ what, onClose, onMoved }) {
  const dialog = useDialog();
  const [folders, setFolders] = useState(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.allFolders().then(d => setFolders(d.folders || [])).catch(e => { setFolders([]); dialog.alert(e.message, { error: true }); }); }, [dialog]);
  const byId = Object.fromEntries((folders || []).map(f => [f.id, f]));
  const pathOf = (f) => { const names = []; for (let c = f, i = 0; c && i < 50; c = byId[c.parent_id], i++) names.unshift(c.name); return names.join(' / '); };
  const inside = (f) => { for (let c = f, i = 0; c && i < 50; c = byId[c.parent_id], i++) if (c.id === what.id) return true; return false; };
  const options = (folders || []).filter(f => !(what.kind === 'folder' && inside(f))).map(f => ({ id: f.id, label: pathOf(f) })).sort((a, b) => a.label.localeCompare(b.label));
  async function move() {
    setBusy(true);
    try {
      const target = to === '' ? null : Number(to);
      if (what.kind === 'folder') await api.moveFolder(what.id, target); else await api.moveItem(what.id, target);
      onMoved();
    } catch (e) { dialog.alert(e.message, { error: true }); setBusy(false); }
  }
  return (
    <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg-panel" role="dialog" aria-label={`Move ${what.name}`}>
        <h3 className="dlg-title">Move &ldquo;{what.name}&rdquo;</h3>
        <p className="dlg-msg">Choose where it should go.</p>
        <select className="dlg-input" value={to} onChange={e => setTo(e.target.value)} disabled={!folders}>
          <option value="">My files (top level)</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="dlg-actions">
          <button type="button" className="dlg-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="dlg-btn is-primary" onClick={move} disabled={busy || !folders}>{busy ? 'Moving…' : 'Move'}</button>
        </div>
      </div>
    </div>
  );
}
