import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import './fileflyer.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function fmtBytes(n) {
  const b = Number(n || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 🌐 What a client sees when a vendor sends them a File Flyer link.
 *
 * No account, no login — the link is the key. Deliberately plain: someone
 * arriving here wants their files, not an interface to learn.
 */
export default function FileFlyerPublic({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  /* A large file goes up in parts, and without this the button says "Uploading…"
     for an hour with no sign of life. */
  const [prog, setProg] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  useDocumentTitle(data?.business_name);

  /* 🗂️ Which folder the client is looking at. The share's own folder is the
     root, and null means exactly that — the breadcrumb never walks above it,
     because the folders above were not shared. */
  const [folderId, setFolderId] = useState(null);
  const [browse, setBrowse] = useState(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => { load(); }, [token]);
  /* ⚠️ The dependency is a BOOLEAN that actually changes. Depending on
     data?.gated looked right and never fired: on an unlocked share the key is
     absent, so it went from undefined to undefined, React saw no change, and
     the folder contents were never fetched — a share rendered with its files
     missing and no error anywhere. */
  const ready = !!data && !data.gated;
  useEffect(() => { if (ready) loadFolder(folderId); }, [ready, folderId]);

  async function load() {
    try { setData(await api.publicShare(token)); }
    catch (e) { setErr(e.message); }
  }

  /* The files and folders at this level. Kept apart from the share itself so
     moving between folders does not re-fetch the logo and the title. */
  async function loadFolder(id) {
    try { setBrowse(await api.shareBrowse(token, id)); }
    catch { setBrowse({ folders: [], items: [], trail: [] }); }
  }

  async function unlock(e) {
    e.preventDefault();
    setPwErr(''); setBusy(true);
    try { await api.unlockShare(token, pw); await load(); }
    catch (er) { setPwErr(er.message); }
    finally { setBusy(false); setProg(''); }
  }

  async function onPick(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true); setMsg('');
    try {
      await api.clientUploadFiles(token, files, name, folderId, (fname, done, total) =>
        setProg(`${fname} — ${done} of ${total} parts sent`));
      await load();
      await loadFolder(folderId);
      setMsg(`✅ Sent ${files.length} file${files.length === 1 ? '' : 's'} — thank you!`);
    } catch (er) { setMsg('⚠️ ' + er.message); }
    finally {
      setBusy(false); setProg('');
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => setMsg(''), 4000);
    }
  }

  /* A zip is built as it streams, so there is no progress to report — the
     button just stops the client pressing it four times while they wait. */
  function downloadAll() {
    setZipping(true);
    window.location.href = `/api/f/${token}/zip${folderId ? '?folder=' + folderId : ''}`;
    setTimeout(() => setZipping(false), 4000);
  }

  const isImage = (it) => /^image\//.test(it.mime || '');

  if (err) return <div className="ffp-page"><div className="ffp-card"><p className="ffp-state">⚠️ {err}</p></div></div>;
  if (!data) return <div className="ffp-page"><div className="ffp-card"><p className="ffp-state">Loading…</p></div></div>;

  if (data.gated) return (
    <div className="ffp-page">
      <div className="ffp-card ffp-gate">
        {data.logo_path && <img className="ffp-logo" src={`/api/me/logo/${data.logo_path}`} alt="" />}
        <div className="ffp-lock">🔒</div>
        <h1 className="ffp-h1">{data.title}</h1>
        <p className="ffp-sub">{data.business_name} shared this with you. Enter the password to open it.</p>
        <form onSubmit={unlock}>
          <input className={`ffp-input ${pwErr ? 'is-err' : ''}`} type="password" placeholder="Password"
            value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          {pwErr && <p className="ffp-err">⚠️ {pwErr}</p>}
          <button className="ffp-btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Open'}</button>
        </form>
      </div>
    </div>
  );

  /* Everything at this level comes from /browse, which knows about folders.
     The share payload is only used for the name, the logo and the note. */
  const folders = browse?.folders || [];
  const items = browse?.items || [];
  const trail = browse?.trail || [];
  const fromThem = items.filter(i => i.uploaded_by === 'vendor');
  const fromMe = items.filter(i => i.uploaded_by === 'client');
  const anything = folders.length > 0 || fromThem.length > 0;

  return (
    <div className="ffp-page">
      <div className="ffp-card">
        {data.logo_path && <img className="ffp-logo" src={`/api/me/logo/${data.logo_path}`} alt="" />}
        <p className="ffp-biz">{data.business_name}</p>
        <h1 className="ffp-h1">{data.title}</h1>
        {data.note && <p className="ffp-note">{data.note}</p>}

        {/* 🧭 Where they are, and the way back. The trail stops at the shared
            folder — the folders above it were never shared, so naming them
            would tell a client about a drive they cannot see. */}
        {trail.length > 0 && (
          <nav className="ffp-crumbs">
            {/* The trail already starts at the shared folder, whose name IS the
                share's title, so a home crumb of its own repeated it. The first
                entry is the home. */}
            {trail.map((t, idx) => (
              <span key={t.id}>
                {idx > 0 && <span className="ffp-crumb-sep">›</span>}
                {idx === trail.length - 1
                  ? <span className="ffp-crumb is-here">{t.name}</span>
                  : <button className="ffp-crumb" onClick={() => setFolderId(idx === 0 ? null : t.id)}>
                      {idx === 0 ? '🏠 ' : ''}{t.name}
                    </button>}
              </span>
            ))}
          </nav>
        )}

        {anything && (
          <button className="ffp-zip" onClick={downloadAll} disabled={zipping}>
            {zipping ? 'Preparing…' : `⬇️ Download ${trail.length ? 'this folder' : 'everything'}`}
          </button>
        )}

        {folders.length > 0 && (
          <>
            <p className="ffp-label">Folders</p>
            <div className="ffp-items">
              {folders.map(f => (
                <button key={f.id} className="ffp-item ffp-folder" onClick={() => setFolderId(f.id)}>
                  <span className="ffp-item-name">📁 {f.name}</span>
                  <span className="ffp-item-meta">{f.file_count} file{f.file_count === 1 ? '' : 's'} ›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {fromThem.length > 0 && (
          <>
            <p className="ffp-label">Files for you</p>
            <div className="ffp-items">
              {fromThem.map(i => (
                <a key={i.id} className="ffp-item" href={`/api/f/${token}/download/${i.id}`}>
                  {/* A photograph is recognised by its picture, not its
                      filename — which is usually a camera's serial number. */}
                  {isImage(i)
                    ? <img className="ffp-thumb" src={`/api/f/${token}/thumb/${i.id}`} alt="" loading="lazy" />
                    : <span className="ffp-thumb ffp-thumb-doc">📄</span>}
                  <span className="ffp-item-name">{i.filename}</span>
                  <span className="ffp-item-meta">{fmtBytes(i.size_bytes)} · ⬇️</span>
                </a>
              ))}
            </div>
          </>
        )}

        {data.allow_upload && (
          <>
            <p className="ffp-label">Send files back</p>
            <input className="ffp-input" placeholder="Your name (optional)"
              value={name} onChange={e => setName(e.target.value)} />
            <input ref={fileRef} type="file" multiple onChange={onPick} disabled={busy} id="ffp-file" hidden />
            <label htmlFor="ffp-file" className={`ffp-drop ${busy ? 'is-busy' : ''}`}>
              {busy ? (prog || 'Uploading…') : '📎 Choose files to send'}
            </label>
          </>
        )}

        {msg && <p className={`ffp-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</p>}

        {fromMe.length > 0 && (
          <>
            <p className="ffp-label">You sent</p>
            <div className="ffp-items">
              {fromMe.map(i => (
                <div key={i.id} className="ffp-item is-mine">
                  <span className="ffp-item-name">{i.filename}</span>
                  <span className="ffp-item-meta">{fmtBytes(i.size_bytes)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!anything && !data.allow_upload && (
          <p className="ffp-state">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}
