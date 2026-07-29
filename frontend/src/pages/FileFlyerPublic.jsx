import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import './fileflyer.css';

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
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { load(); }, [token]);
  async function load() {
    try { setData(await api.publicShare(token)); }
    catch (e) { setErr(e.message); }
  }

  async function unlock(e) {
    e.preventDefault();
    setPwErr(''); setBusy(true);
    try { await api.unlockShare(token, pw); await load(); }
    catch (er) { setPwErr(er.message); }
    finally { setBusy(false); }
  }

  async function onPick(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true); setMsg('');
    try {
      await api.clientUploadFiles(token, files, name);
      await load();
      setMsg(`✅ Sent ${files.length} file${files.length === 1 ? '' : 's'} — thank you!`);
    } catch (er) { setMsg('⚠️ ' + er.message); }
    finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => setMsg(''), 4000);
    }
  }

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

  const fromThem = data.items.filter(i => i.uploaded_by === 'vendor');
  const fromMe = data.items.filter(i => i.uploaded_by === 'client');

  return (
    <div className="ffp-page">
      <div className="ffp-card">
        {data.logo_path && <img className="ffp-logo" src={`/api/me/logo/${data.logo_path}`} alt="" />}
        <p className="ffp-biz">{data.business_name}</p>
        <h1 className="ffp-h1">{data.title}</h1>
        {data.note && <p className="ffp-note">{data.note}</p>}

        {fromThem.length > 0 && (
          <>
            <p className="ffp-label">Files for you</p>
            <div className="ffp-items">
              {fromThem.map(i => (
                <a key={i.id} className="ffp-item" href={`/api/f/${token}/download/${i.id}`}>
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
              {busy ? 'Uploading…' : '📎 Choose files to send'}
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

        {fromThem.length === 0 && !data.allow_upload && (
          <p className="ffp-state">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}
