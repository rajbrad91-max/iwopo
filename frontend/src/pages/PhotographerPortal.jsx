/**
 * 📸 The photographer's portal — /photographer (Raw Selector, Raj 2026-11-09).
 *
 * A crew member the studio has set (Crew Management → "Uploads the photos") signs up with the email on their crew
 * card, sees ONLY those shoots, and uploads the day's RAW + JPEG files straight to storage: the JPEGs become the
 * shoot's photos (the client sees them, the studio downloads them), the RAWs are kept aside for the editor and paired
 * with their JPEGs by file name. When everything is in: Notify the owner — or the owner and the client.
 *
 * FTP straight from the camera is the other way in; whichever is used, uploading here always works.
 * Like the editor's portal, this login is kept under its own key and opens nothing else on the site.
 */
import { useState, useEffect } from 'react';
import './rawsel.css';
import { uploadShootFiles, uploadSummary, SHOOT_ACCEPT } from '../lib/shootUpload';
import RenameField from '../components/RenameField';

const KEY = 'iwopo_photographer_token';

async function call(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem(KEY);
  const r = await fetch(`/api/photographer${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login' && path !== '/signup') { localStorage.removeItem(KEY); throw Object.assign(new Error(data.error || 'Please sign in'), { signedOut: true }); }
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status})`);
  return data;
}
const when = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No date');

export default function PhotographerPortal() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [shoots, setShoots] = useState(null);
  const [open, setOpen] = useState(null);       // the shoot being uploaded
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState('');
  const [ftp, setFtp] = useState(null);        // 📡 his camera FTP login

  const loadAll = () => Promise.all([call('/me'), call('/shoots'), call('/ftp')])
    .then(([m, s, f]) => { setMe(m); setShoots(s.shoots); setFtp(f); setOpen(o => (o ? s.shoots.find(x => x.id === o.id) || null : null)); })
    .catch(e => { if (e.signedOut) setMe(null); else setErr(e.message); });
  useEffect(() => { if (localStorage.getItem(KEY)) loadAll(); }, []);
  useEffect(() => { document.title = 'Photographer — upload'; }, []);

  async function auth(e) {
    e.preventDefault(); setErr('');
    try {
      const d = await call(mode === 'signup' ? '/signup' : '/login', { method: 'POST', body: { email, password } });
      localStorage.setItem(KEY, d.token); setPassword('');
      await loadAll();
    } catch (x) { setErr(x.message); }
  }
  function signOut() { localStorage.removeItem(KEY); setMe(null); setShoots(null); setOpen(null); }

  /** ⬆️ RAW + JPEG, straight to storage (lib/shootUpload.js, shared with the vendor's own upload) */
  async function upload(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setTold(''); setErr('');
    const r = await uploadShootFiles(files, {
      begin: (list) => call(`/shoots/${open.id}/begin`, { method: 'POST', body: { files: list } }),
      complete: (items) => call(`/shoots/${open.id}/complete`, { method: 'POST', body: { items } }),
      onProgress: setProgress,
    });
    setBusy(false); setProgress(uploadSummary(r));
    loadAll();
  }

  /** 📡 the camera's FTP uploads go to this shoot — or stop */
  async function setFtpShoot(on) {
    setErr('');
    setOpen(o => ({ ...o, ftp: on }));   // ticked at once; the save follows
    try { await call(`/shoots/${open.id}/ftp`, { method: 'POST', body: { on } }); }
    catch (x) { setErr(x.message); }
    loadAll();   // what is really stored — also when the save failed
  }

  async function notify(client) {
    setBusy(true); setErr('');
    try {
      const r = await call(`/shoots/${open.id}/notify`, { method: 'POST', body: { client } });
      setTold(client ? `✅ The owner${r.clientEmailed ? ' and the client have' : ' has'} been told${client && !r.clientEmailed ? ' (the client has no email on the booking)' : ''}` : '✅ The owner has been told');
      loadAll();
    } catch (x) { setErr(x.message); }
    setBusy(false);
  }

  if (!me) {
    return (
      <div className="ep">
        <form className="ep-card ep-auth" onSubmit={auth}>
          <h1 className="ep-title">📸 Photographer sign {mode === 'signup' ? 'up' : 'in'}</h1>
          <p className="ep-sub">{mode === 'signup' ? 'Use the email the studio has for you, and choose a password.' : 'Sign in to upload the photos of your shoots.'}</p>
          <label className="ep-label">Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="ep-label">Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} /></label>
          {err && <div className="rs-err">⚠️ {err}</div>}
          <button className="rs-btn ep-wide" type="submit">{mode === 'signup' ? 'Create my login' : 'Sign in'}</button>
          <button className="ep-link" type="button" onClick={() => { setErr(''); setMode(mode === 'signup' ? 'signin' : 'signup'); }}>
            {mode === 'signup' ? 'I already have a password — sign in' : 'First time here? Sign up'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="ep">
      <header className="ep-top">
        <div><div className="ep-title">📸 My shoots{me.studio ? ` — ${me.studio}` : ''}</div><div className="rs-muted">{me.name} · {me.email}</div></div>
        <button className="ep-link" type="button" onClick={signOut}>Sign out</button>
      </header>
      {err && <div className="rs-err">⚠️ {err}</div>}

      {open ? (
        <section className="ep-card">
          <button className="ep-link" type="button" onClick={() => { setOpen(null); setProgress(''); setTold(''); }}>← All my shoots</button>
          <h2 className="rs-h"><RenameField name={open.name} onSave={async (name) => { await call(`/shoots/${open.id}/name`, { method: 'PUT', body: { name } }); loadAll(); }} /></h2>
          <p className="rs-sub">{[open.event, when(open.date)].filter(Boolean).join(' · ')} — {open.jpegs} JPEG{open.jpegs === 1 ? '' : 's'} · {open.raws} RAW{open.raws === 1 ? '' : 's'} uploaded</p>
          <div className="ep-deliver">
            <h3 className="rs-h">⬆️ Upload RAW + JPEG</h3>
            <p className="rs-sub">Choose both together — the JPEGs are what the client sees, the RAWs are kept for the editor and matched by file name. Using FTP from the camera? You can still upload here any time.</p>
            <label className={`rs-btn rs-file ${busy ? 'is-off' : ''}`}>Choose photos
              <input type="file" multiple hidden disabled={busy} accept={SHOOT_ACCEPT} onChange={upload} />
            </label>
            {progress && <div className="ep-progress">{progress}</div>}
          </div>
          {ftp?.user && (
            <div className="ep-deliver">
              <h3 className="rs-h">📡 FTP from the camera</h3>
              <label className="ph-ftp-on">
                <input type="checkbox" checked={!!open.ftp} onChange={e => setFtpShoot(e.target.checked)} />
                The camera&apos;s uploads go to this shoot
              </label>
              <p className="rs-sub">Camera settings — server {ftp.host} · port {ftp.port} · user {ftp.user} · password {ftp.password} · secure FTP on · passive mode on. Photos appear here about a minute after the camera sends them.{ftp.waiting ? ` ${ftp.waiting} file${ftp.waiting === 1 ? ' is' : 's are'} waiting for a shoot.` : ''}</p>
            </div>
          )}
          <div className="ep-deliver">
            <h3 className="rs-h">📣 All uploaded?</h3>
            <p className="rs-sub">{open.notified ? `You last told them ${when(open.notified)}.` : 'Tell the studio once every photo is in.'}</p>
            <div className="ph-notify">
              <button className="rs-btn" type="button" disabled={busy || !open.jpegs} onClick={() => notify(false)}>Notify owner</button>
              <button className="rs-btn" type="button" disabled={busy || !open.jpegs} onClick={() => notify(true)}>Notify owner + client</button>
            </div>
            {told && <div className="rs-ok">{told}</div>}
          </div>
        </section>
      ) : (
        <section className="ep-card">
          <h2 className="rs-h">Shoots</h2>
          {shoots === null ? <div className="rs-muted">Loading…</div>
            : shoots.length === 0 ? <div className="rs-muted">No shoots yet. The studio assigns them to you in Crew Management.</div>
              : (
                <ul className="rs-list">
                  {shoots.map(s => (
                    <li key={s.id} className="rs-row ep-client">
                      <button className="ep-open" type="button" onClick={() => { setOpen(s); setProgress(''); setTold(''); }}>
                        <span className="rs-strong">{s.name}{s.ftp && <span className="rs-pill is-on ep-new">📡 FTP</span>}{s.notified && <span className="rs-pill is-on ep-new">Sent</span>}</span>
                        <span className="rs-muted">{[s.event, when(s.date)].filter(Boolean).join(' · ')} · {s.jpegs} JPEG · {s.raws} RAW</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </section>
      )}
    </div>
  );
}
