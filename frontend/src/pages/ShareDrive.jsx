import { useState, useEffect, useRef, useCallback } from 'react';
import { api, authFetch } from '../lib/api';
import { fmtBytes } from './FileFlyerView.jsx';
import { useDialog } from '../lib/dialog.jsx';

/** Icon for a file we can't preview — picked from the extension, not the mime,
 *  because the mime is whatever the uploading client claimed. */
function iconFor(name) {
  const e = (String(name).split('.').pop() || '').toLowerCase();
  if (/^(mp4|mov|avi|mkv|webm|m4v)$/.test(e)) return '🎬';
  if (/^(mp3|wav|aac|flac|m4a|ogg)$/.test(e)) return '🎵';
  if (/^(pdf)$/.test(e)) return '📕';
  if (/^(doc|docx|odt|rtf|txt|md)$/.test(e)) return '📄';
  if (/^(xls|xlsx|csv|ods)$/.test(e)) return '📊';
  if (/^(ppt|pptx|odp)$/.test(e)) return '📑';
  if (/^(zip|rar|7z|tar|gz)$/.test(e)) return '🗜️';
  if (/^(psd|ai|indd|xd|fig|sketch)$/.test(e)) return '🎨';
  if (/^(raw|cr2|nef|arw|dng)$/.test(e)) return '📷';
  return '📎';
}

const looksImage = (n) => /\.(jpe?g|png|webp|gif|avif|tiff?|bmp)$/i.test(String(n));

/**
 * 🖼️ A thumbnail behind an authenticated endpoint.
 *
 * An <img src> cannot carry an Authorization header, and these previews are a
 * vendor's private client files — the site-photo and logo routes elsewhere in
 * the app are unauthenticated because those assets are public, which is not
 * true here. So the bytes are fetched with the token and handed to the <img>
 * as a blob URL.
 *
 * Deliberately NOT a token in the query string: that writes the JWT into
 * server logs and referrer headers for every thumbnail on the page.
 *
 * The object URL is revoked on unmount, and the fetch is abandoned if the
 * component goes away first — scrolling a large folder would otherwise leave
 * dozens of resolved requests writing to elements that no longer exist.
 */
function Thumb({ itemId, name }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    let objectUrl = null;
    (async () => {
      try {
        const res = await authFetch(`/files/item/${itemId}/thumb`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (dead) return;                       // unmounted mid-flight
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch { if (!dead) setFailed(true); }   // not an image, or gone — icon instead
    })();
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId]);

  if (failed) return <>{iconFor(name)}</>;
  if (!url) return <span className="ff-thumb-wait" aria-hidden="true" />;
  return <img src={url} alt="" loading="lazy" />;
}

/**
 * 🗂️ One share, browsed like a drive.
 *
 * Folders and files are fetched a level at a time rather than as a whole tree —
 * a share holding thousands of files should not serialise all of them to draw a
 * window showing twenty.
 */
export default function ShareDrive({ share, onBack, onStorage }) {
  const dialog = useDialog();
  const [folderId, setFolderId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem('ff_view') || 'grid');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const fileRef = useRef(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1800); };

  /**
   * Pull a file or zip through the authenticated fetch, then hand the blob to
   * a temporary link. A plain href cannot send the token, so it would save the
   * 401 body to disk under the right filename — a broken file that looks like
   * it downloaded fine.
   */
  async function download(pathname, filename) {
    setZipping(true);
    try {
      const res = await authFetch(pathname);
      if (!res.ok) throw new Error('That file could not be fetched.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setZipping(false); }
  }
  const chooseView = (v) => { setView(v); localStorage.setItem('ff_view', v); };

  const load = useCallback(async (fid = folderId) => {
    setLoading(true);
    try {
      const d = await api.browseShare(share.id, fid);
      setTrail(d.trail || []); setFolders(d.folders || []); setItems(d.items || []);
      if (d.storage) onStorage?.(d.storage);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setLoading(false); }
  }, [share.id, folderId, onStorage]);

  useEffect(() => { load(folderId); }, [folderId, load]);

  function openFolder(id) { setFolderId(id); }

  async function newFolder() {
    const name = await dialog.prompt('What should it be called?', '',
      { title: 'New folder', okLabel: 'Create' });
    if (!name?.trim()) return;
    try {
      await api.createFolder(share.id, { name: name.trim(), parent_id: folderId });
      load(); flash('📁 Folder created');
    } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  async function renameFolder(f, e) {
    e.stopPropagation();
    const name = await dialog.prompt('New name', f.name, { title: 'Rename folder', okLabel: 'Rename' });
    if (!name?.trim() || name.trim() === f.name) return;
    try { await api.renameFolder(f.id, name.trim()); load(); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function removeFolder(f, e) {
    e.stopPropagation();
    if (!await dialog.confirm(
      `"${f.name}" and everything inside it will be deleted. This cannot be undone.`,
      { title: 'Delete folder?', okLabel: 'Delete' })) return;
    try { const d = await api.deleteFolder(f.id); load(); onStorage?.(d.storage); flash('🗑️ Deleted'); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function removeItem(it, e) {
    e.stopPropagation();
    if (!await dialog.confirm(`"${it.filename}" will be deleted.`,
      { title: 'Delete file?', okLabel: 'Delete' })) return;
    try { const d = await api.removeShareItem(it.id); load(); onStorage?.(d.storage); flash('🗑️ Deleted'); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const d = await api.uploadShareFiles(share.id, files, folderId);
      onStorage?.(d.storage); load();
      flash(`✅ ${files.length} file${files.length === 1 ? '' : 's'} added`);
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  /* Dropping anywhere on the pane uploads into the folder currently open —
     the same rule as the Upload button, so the two cannot disagree. */
  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    upload([...(e.dataTransfer?.files || [])]);
  }

  const isEmpty = !loading && !folders.length && !items.length;

  return (
    <div className="ff-drive"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}>

      <div className="ff-bar-top">
        <button className="ff-back" onClick={onBack}>← All links</button>
        <div className="ff-crumbs">
          <button className={`ff-crumb ${!folderId ? 'is-here' : ''}`} onClick={() => openFolder(null)}>
            🗂️ {share.title}
          </button>
          {trail.map(t => (
            <span key={t.id}>
              <span className="ff-crumb-sep">›</span>
              <button className={`ff-crumb ${t.id === folderId ? 'is-here' : ''}`}
                onClick={() => openFolder(t.id)}>{t.name}</button>
            </span>
          ))}
        </div>
      </div>

      <div className="ff-toolbar">
        <button className="ff-btn is-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : '⬆️ Upload files'}
        </button>
        <button className="ff-btn" onClick={newFolder}>📁 New folder</button>
        <button className="ff-btn" disabled={zipping}
          onClick={() => download(
            folderId ? `/files/folder/${folderId}/zip` : `/files/${share.id}/zip`,
            (folderId ? (trail[trail.length - 1]?.name || 'folder') : share.title) + '.zip')}>
          {zipping ? 'Preparing…' : `⬇️ Download ${folderId ? 'folder' : 'all'}`}
        </button>
        <span className="ff-tool-gap" />
        <div className="ff-viewtog" role="group" aria-label="View">
          <button className={`ff-vt ${view === 'grid' ? 'is-on' : ''}`}
            onClick={() => chooseView('grid')} title="Thumbnails">▦</button>
          <button className={`ff-vt ${view === 'list' ? 'is-on' : ''}`}
            onClick={() => chooseView('list')} title="List">☰</button>
        </div>
      </div>

      <input ref={fileRef} type="file" multiple hidden
        onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />

      {msg && <p className="ff-msg">{msg}</p>}

      {loading ? <p className="ff-empty">Loading…</p>
        : isEmpty ? (
          <div className="ff-drop-hint">
            <p className="ff-empty">This folder is empty.</p>
            <p className="ff-empty-sub">Drop files here, or use Upload files.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="ff-grid">
            {folders.map(f => (
              <div key={'f' + f.id} className="ff-tile is-folder" onDoubleClick={() => openFolder(f.id)}
                onClick={() => openFolder(f.id)} title={f.name}>
                <div className="ff-tile-ic">📁</div>
                <p className="ff-tile-name">{f.name}</p>
                <p className="ff-tile-meta">{f.file_count} item{f.file_count === 1 ? '' : 's'}</p>
                <div className="ff-tile-acts">
                  <button className="ff-mini" onClick={e => renameFolder(f, e)} title="Rename">✏️</button>
                  <button className="ff-mini is-del" onClick={e => removeFolder(f, e)} title="Delete">🗑️</button>
                </div>
              </div>
            ))}
            {items.map(it => (
              <div key={'i' + it.id} className="ff-tile" title={it.filename}>
                <div className="ff-tile-ic">
                  {looksImage(it.filename)
                    ? <Thumb itemId={it.id} name={it.filename} />
                    : iconFor(it.filename)}
                </div>
                <p className="ff-tile-name">{it.filename}</p>
                <p className="ff-tile-meta">{fmtBytes(it.size_bytes)}</p>
                <div className="ff-tile-acts">
                  <button className="ff-mini" title="Download"
                    onClick={() => download(`/files/item/${it.id}/download`, it.filename)}>⬇️</button>
                  <button className="ff-mini is-del" onClick={e => removeItem(it, e)} title="Delete">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="ff-table">
              <thead><tr><th>Name</th><th>Size</th><th>Added by</th><th className="ff-col-act"></th></tr></thead>
              <tbody>
                {folders.map(f => (
                  <tr key={'f' + f.id} className="ff-row is-folder" onClick={() => openFolder(f.id)}>
                    <td><span className="ff-row-ic">📁</span>{f.name}</td>
                    <td>{f.file_count} item{f.file_count === 1 ? '' : 's'}</td>
                    <td>—</td>
                    <td className="ff-col-act">
                      <button className="ff-mini" onClick={e => renameFolder(f, e)} title="Rename">✏️</button>
                      <button className="ff-mini is-del" onClick={e => removeFolder(f, e)} title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
                {items.map(it => (
                  <tr key={'i' + it.id} className="ff-row">
                    <td><span className="ff-row-ic">{iconFor(it.filename)}</span>{it.filename}</td>
                    <td>{fmtBytes(it.size_bytes)}</td>
                    <td>{it.uploaded_by === 'client' ? (it.uploader_name || 'Client') : 'You'}</td>
                    <td className="ff-col-act">
                      <button className="ff-mini" title="Download"
                        onClick={() => download(`/files/item/${it.id}/download`, it.filename)}>⬇️</button>
                      <button className="ff-mini is-del" onClick={e => removeItem(it, e)} title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {dragging && <div className="ff-dropzone">Drop to upload into {trail.length ? trail[trail.length - 1].name : share.title}</div>}
    </div>
  );
}
