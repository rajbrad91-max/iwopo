import { useState, useEffect, useRef, useCallback } from 'react';
import { api, authFetch } from '../lib/api';
import { fmtBytes } from './FileFlyerView.jsx';
import { useDialog } from '../lib/dialog.jsx';

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
export default function ShareDrive({ onStorage }) {
  const dialog = useDialog();
  const [folderId, setFolderId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [share, setShare] = useState(null);
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem('ff_view') || 'grid');
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const [emailFor, setEmailFor] = useState(null);   // folder whose link is being sent
  const [viewing, setViewing] = useState(-1);       // index into photos, -1 = closed
  const fileRef = useRef(null);

  // held in a ref so a parent passing an inline arrow cannot rebuild load()
  // every render and spin the effect below
  const onStorageRef = useRef(onStorage);
  useEffect(() => { onStorageRef.current = onStorage; }, [onStorage]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1800); };
  const chooseView = (v) => { setView(v); localStorage.setItem('ff_view', v); };

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
    try { await api.removeShareItem(it.id); load(folderId); flash('🗑️ Deleted'); }
    catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    try { await api.uploadShareFiles(files, folderId); load(folderId); flash(`✅ ${files.length} added`); }
    catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  /** Share the folder being viewed, or the one whose badge was pressed. */
  async function shareFolder(id, e) {
    e?.stopPropagation();
    try {
      const d = await api.shareFolder(id);
      await navigator.clipboard?.writeText(location.origin + '/f/' + d.share.token).catch(() => {});
      load(folderId);
      flash('🔗 Link created and copied');
    } catch (err) { dialog.alert(err.message, { error: true }); }
  }

  async function manageShare(id, token, e) {
    e?.stopPropagation();
    const url = location.origin + '/f/' + token;
    if (await dialog.confirm(`${url}\n\nAnyone with this link can open the folder and download what is in it.`,
      { title: 'This folder is shared', okLabel: 'Stop sharing', danger: true })) {
      try { await api.unshareFolder(id); load(folderId); flash('🔒 Link revoked'); }
      catch (err) { dialog.alert(err.message, { error: true }); }
    } else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      flash('🔗 Link copied');
    }
  }

  const photos = items.filter(i => looksImage(i.filename));
  const openPhoto = (it) => { const i = photos.findIndex(p => p.id === it.id); if (i > -1) setViewing(i); };

  const here = trail.length ? trail[trail.length - 1].name : 'My files';
  const isEmpty = !loading && !folders.length && !items.length;
  const pct = storage ? Math.min(100, Math.round(storage.used_bytes / storage.limit_bytes * 100)) : 0;

  return (
    <div className="fd"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); upload([...(e.dataTransfer?.files || [])]); }}>

      {/* one bar: where you are, what you can do, how full you are */}
      <div className="fd-bar">
        <nav className="fd-crumbs" aria-label="Location">
          <button className={`fd-crumb ${!folderId ? 'is-here' : ''}`} onClick={() => setFolderId(null)}>My files</button>
          {trail.map(t => (
            <span key={t.id} className="fd-crumb-wrap">
              <span className="fd-sep" aria-hidden="true">/</span>
              <button className={`fd-crumb ${t.id === folderId ? 'is-here' : ''}`}
                onClick={() => setFolderId(t.id)}>{t.name}</button>
            </span>
          ))}
          {folderId && (share
            ? <>
                <button className="fd-tag is-on" onClick={e => manageShare(folderId, share.token, e)}>🔗 Shared</button>
                <button className="fd-tag" onClick={() => setEmailFor({ id: share.id, title: here, password: share.has_password })}>✉️ Send</button>
              </>
            : <button className="fd-tag" onClick={e => shareFolder(folderId, e)}>Share</button>)}
        </nav>

        <div className="fd-actions">
          <button className="fd-b is-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload'}
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

      {storage && (
        <div className="fd-quota" title={`${fmtBytes(storage.used_bytes)} of ${storage.limit_mb} MB`}>
          <div className="fd-quota-bar"><span className={pct > 90 ? 'is-full' : ''} style={{ width: `${pct}%` }} /></div>
          <span className="fd-quota-t">{fmtBytes(storage.used_bytes)} of {storage.limit_mb} MB</span>
        </div>
      )}

      <input ref={fileRef} type="file" multiple hidden
        onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />

      {msg && <p className="fd-msg">{msg}</p>}

      {loading ? <p className="fd-quiet">Loading…</p>
        : isEmpty ? (
          <div className="fd-empty">
            <p className="fd-empty-t">Nothing here yet</p>
            <p className="fd-quiet">Drop files anywhere on this page, or use Upload.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="fd-grid">
            {folders.map(f => (
              <button key={'f' + f.id} className="fd-tile is-folder" onClick={() => setFolderId(f.id)}>
                <span className="fd-ic">📁</span>
                <span className="fd-name">{f.name}</span>
                <span className="fd-meta">{f.file_count} item{f.file_count === 1 ? '' : 's'}</span>
                {/* shared state lives on the folder — no second list below */}
                {f.share && <span className="fd-badge" title="Shared">🔗</span>}
                <span className="fd-acts">
                  {f.share
                    ? <>
                        <span className="fd-a" role="button" tabIndex={0} title="Send by email"
                          onClick={e => { e.stopPropagation(); setEmailFor({ id: f.share.id, title: f.name, password: f.share.has_password }); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setEmailFor({ id: f.share.id, title: f.name, password: f.share.has_password }); } }}>✉️</span>
                        <span className="fd-a" role="button" tabIndex={0} title="Manage link"
                          onClick={e => manageShare(f.id, f.share.token, e)}
                          onKeyDown={e => { if (e.key === 'Enter') manageShare(f.id, f.share.token, e); }}>🔗</span>
                      </>
                    : <span className="fd-a" role="button" tabIndex={0} title="Share"
                        onClick={e => shareFolder(f.id, e)}
                        onKeyDown={e => { if (e.key === 'Enter') shareFolder(f.id, e); }}>↗</span>}
                  <span className="fd-a" role="button" tabIndex={0} title="Rename"
                    onClick={e => renameFolder(f, e)}
                    onKeyDown={e => { if (e.key === 'Enter') renameFolder(f, e); }}>✏️</span>
                  <span className="fd-a is-del" role="button" tabIndex={0} title="Delete"
                    onClick={e => removeFolder(f, e)}
                    onKeyDown={e => { if (e.key === 'Enter') removeFolder(f, e); }}>🗑️</span>
                </span>
              </button>
            ))}
            {items.map(it => (
              <div key={'i' + it.id}
                className={`fd-tile ${looksImage(it.filename) ? 'is-photo' : ''}`}
                title={it.filename}
                onClick={() => looksImage(it.filename) && openPhoto(it)}>
                <span className="fd-ic">
                  {looksImage(it.filename) ? <Thumb itemId={it.id} name={it.filename} /> : iconFor(it.filename)}
                </span>
                <span className="fd-name">{it.filename}</span>
                <span className="fd-meta">{fmtBytes(it.size_bytes)}</span>
                <span className="fd-acts">
                  <span className="fd-a" role="button" tabIndex={0} title="Download"
                    onClick={() => download(`/files/item/${it.id}/download`, it.filename)}
                    onKeyDown={e => { if (e.key === 'Enter') download(`/files/item/${it.id}/download`, it.filename); }}>⬇</span>
                  <span className="fd-a is-del" role="button" tabIndex={0} title="Delete"
                    onClick={e => removeItem(it, e)}
                    onKeyDown={e => { if (e.key === 'Enter') removeItem(it, e); }}>🗑️</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <table className="fd-table">
            <thead><tr><th>Name</th><th>Size</th><th>Added by</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {folders.map(f => (
                <tr key={'f' + f.id} className="fd-row is-folder" onClick={() => setFolderId(f.id)}>
                  <td><span className="fd-row-ic">📁</span>{f.name}{f.share && <span className="fd-badge-in">🔗</span>}</td>
                  <td>{f.file_count} item{f.file_count === 1 ? '' : 's'}</td>
                  <td className="fd-quiet">—</td>
                  <td className="fd-row-acts">
                    {f.share
                      ? <button className="fd-a" title="Manage link" onClick={e => manageShare(f.id, f.share.token, e)}>🔗</button>
                      : <button className="fd-a" title="Share" onClick={e => shareFolder(f.id, e)}>↗</button>}
                    <button className="fd-a" title="Rename" onClick={e => renameFolder(f, e)}>✏️</button>
                    <button className="fd-a is-del" title="Delete" onClick={e => removeFolder(f, e)}>🗑️</button>
                  </td>
                </tr>
              ))}
              {items.map(it => (
                <tr key={'i' + it.id}
                  className={`fd-row ${looksImage(it.filename) ? 'is-photo' : ''}`}
                  onClick={() => looksImage(it.filename) && openPhoto(it)}>
                  <td><span className="fd-row-ic">{iconFor(it.filename)}</span>{it.filename}</td>
                  <td>{fmtBytes(it.size_bytes)}</td>
                  <td className="fd-quiet">{it.uploaded_by === 'client' ? (it.uploader_name || 'Client') : 'You'}</td>
                  <td className="fd-row-acts">
                    <button className="fd-a" title="Download"
                      onClick={() => download(`/files/item/${it.id}/download`, it.filename)}>⬇</button>
                    <button className="fd-a is-del" title="Delete" onClick={e => removeItem(it, e)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {dragging && <div className="fd-drop">Drop to upload into {here}</div>}

      {emailFor && <EmailShareModal share={emailFor} onClose={() => setEmailFor(null)} />}

      {viewing > -1 && (
        <Viewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(-1)} />
      )}
    </div>
  );
}

/**
 * ✉️ Send a share link to a client.
 *
 * Addresses are validated on the server too — this only catches the obvious
 * cases early so a typo does not cost a round trip.
 */
function EmailShareModal({ share, onClose }) {
  const dialog = useDialog();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const list = to.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!list.length) { dialog.alert('Add at least one email address.', { error: true }); return; }
    setSending(true);
    try {
      const d = await api.emailShare(share.id, { to: list, message: message.trim() || undefined });
      onClose();
      dialog.alert(
        `Sent to ${d.sent_to} ${d.sent_to === 1 ? 'person' : 'people'}` +
        (d.via === 'platform' ? ', using iwopo\u2019s mail server.' : ', from your own email.'),
        { title: 'On its way' });
    } catch (e) {
      // the server explains WHY when there is no mail server configured — pass
      // that through rather than a generic failure the vendor cannot act on
      dialog.alert(e.message, { title: 'Could not send', error: true });
    } finally { setSending(false); }
  }

  return (
    <div className="ff-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ff-modal">
        <h3 className="ff-modal-t">✉️ Send &ldquo;{share.title}&rdquo;</h3>
        <p className="ff-modal-sub">
          They&rsquo;ll get a link to open and download everything in this folder.
        </p>

        <label className="ff-label">Send to</label>
        <input className="ff-input" autoFocus placeholder="client@example.com, someone@else.com"
          value={to} onChange={e => setTo(e.target.value)} />
        <p className="ff-hint">Separate several addresses with a comma.</p>

        <label className="ff-label">Add a message (optional)</label>
        <textarea className="ff-input ff-ta" rows={3}
          placeholder="Here are the photos from Saturday!"
          value={message} onChange={e => setMessage(e.target.value)} />

        {share.password && (
          <p className="ff-hint">
            🔒 This link asks for a password. The email says so, but it will not
            include the password — send that separately.
          </p>
        )}

        <div className="ff-modal-acts">
          <button className="ff-btn" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="ff-btn is-primary" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send link'}
          </button>
        </div>
      </div>
    </div>
  );
}
