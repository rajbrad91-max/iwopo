/**
 * 👨‍💻 The photo editor's portal — /editor (Raw Selector).
 *
 * Sign up with the email the studio added, then: clients who have sent their
 * selection, and for each one ONLY the RAW files of the photos they picked.
 * Each file downloads straight from storage under its own name — no ZIP.
 * "Download all" saves them one by one into a folder the editor chooses
 * (Chrome / Edge); elsewhere it falls back to ordinary downloads, one by one.
 *
 * Finished photos go back the same way: into named folders ("Photos",
 * "Instagram", "Stories") — each becomes a tab in the client's gallery, with
 * the studio's logo printed on every photo, and the studio and client are told.
 *
 * Its login is not a vendor login: it is kept under its own key here, sent
 * only to /api/editor, and opens nothing else on the site.
 */
import { useState, useEffect } from 'react';
import './rawsel.css';

const KEY = 'iwopo_editor_token';
const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
function day(d, tz, pref) {
  const when = new Date(d);
  if (Number.isNaN(when.getTime())) return '';
  const hour12 = pref !== '24h';
  try {
    return when.toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12,
      timeZone: tz || undefined,
    });
  } catch {
    return when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem(KEY);
  const r = await fetch(`/api/editor${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login' && path !== '/signup') { localStorage.removeItem(KEY); throw Object.assign(new Error(data.error || 'Please sign in'), { signedOut: true }); }
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status})`);
  return data;
}

export default function EditorPortal() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [clients, setClients] = useState(null);
  const [open, setOpen] = useState(null);           // { id, name, files }
  const [progress, setProgress] = useState('');
  const [tabs, setTabs] = useState([]);              // delivery tabs already in the client's gallery
  const [tab, setTab] = useState('Photos');
  const [sending, setSending] = useState('');

  const loadAll = () => Promise.all([call('/me'), call('/clients')])
    .then(([m, c]) => { setMe(m); setClients(c.clients); })
    .catch(e => { if (e.signedOut) setMe(null); });
  useEffect(() => { if (localStorage.getItem(KEY)) loadAll(); }, []);
  useEffect(() => { document.title = 'Editor — RAW files'; }, []);

  async function auth(e) {
    e.preventDefault(); setErr('');
    try {
      const d = await call(mode === 'signup' ? '/signup' : '/login', { method: 'POST', body: { email, password } });
      localStorage.setItem(KEY, d.token); setPassword('');
      await loadAll();
    } catch (x) { setErr(x.message); }
  }
  function signOut() { localStorage.removeItem(KEY); setMe(null); setClients(null); setOpen(null); }

  async function openClient(c) {
    setProgress('');
    try {
      const [d, t] = await Promise.all([call(`/clients/${c.id}`), call(`/clients/${c.id}/tabs`)]);
      setOpen(d); setTabs(t.tabs); setSending('');
    } catch (x) { setErr(x.message); }
  }

  /** One file: a fresh 15-minute link, then the browser downloads it under its own name. */
  async function downloadOne(f) {
    const { url } = await call(`/raws/${f.id}/link`);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function downloadAll() {
    const files = open.files;
    let done = 0;
    /* 📁 Chrome / Edge: write each RAW straight into a folder the editor picks */
    if (window.showDirectoryPicker) {
      let dir;
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return; }   // they cancelled
      try {
        for (const f of files) {
          setProgress(`Saving ${done + 1} of ${files.length}: ${f.name}`);
          const { url } = await call(`/raws/${f.id}/link`);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${f.name} could not be downloaded (${res.status})`);
          const handle = await dir.getFileHandle(f.name, { create: true });
          const out = await handle.createWritable();
          await res.body.pipeTo(out);
          done++;
        }
        setProgress(`✅ All ${files.length} RAW files saved to the folder`);
        return;
      } catch (x) {
        if (done > 0) { setProgress(`⚠️ Stopped after ${done} of ${files.length}: ${x.message}`); return; }
        /* the browser could not read the files directly (storage not open to this
           site) — fall through to ordinary downloads */
      }
    }
    for (const f of files.slice(done)) {
      setProgress(`Downloading ${done + 1} of ${files.length}: ${f.name}`);
      await downloadOne(f);
      done++;
      await new Promise(r => setTimeout(r, 900));   // browsers allow a steady stream of downloads, not a burst
    }
    setProgress(`✅ ${files.length} downloads started — they land in your Downloads folder`);
  }

  /** ⬆️ Edited photos → storage directly → into the chosen tab (logo printed there). */
  async function deliver(e) {
    const files = [...(e.target.files || [])].filter(f => /\.(jpe?g|png)$/i.test(f.name));
    e.target.value = '';
    const folder = tab.trim();
    if (!files.length || !folder) return;
    let done = 0; const failed = [];
    for (const f of files) {
      setSending(`Uploading ${done + 1} of ${files.length}: ${f.name}`);
      try {
        const b = await call(`/clients/${open.id}/deliver/begin`, { method: 'POST', body: { files: [{ name: f.name, size: f.size }] } });
        const it = b.items[0];
        const put = await fetch(it.url, { method: 'PUT', body: f });
        if (!put.ok) throw new Error(`storage refused it (${put.status})`);
        const c = await call(`/clients/${open.id}/deliver/complete`, { method: 'POST', body: { tab: folder, items: [{ key: it.key, name: f.name }] } });
        if (!c.created) throw new Error(c.errors?.[0] || 'not saved');
        done++;
      } catch (x) { failed.push(`${f.name}: ${x.message}`); }
    }
    if (done) await call(`/clients/${open.id}/deliver/finish`, { method: 'POST', body: { tab: folder, count: done } }).catch(() => {});
    setSending(failed.length ? `⚠️ ${done} delivered, ${failed.length} failed — ${failed.slice(0, 3).join(' · ')}` : `✅ ${done} photo${done === 1 ? '' : 's'} delivered to "${folder}" — the studio and the client have been told`);
    call(`/clients/${open.id}/tabs`).then(t => setTabs(t.tabs)).catch(() => {});
  }

  if (!me) {
    return (
      <div className="ep">
        <form className="ep-card ep-auth" onSubmit={auth}>
          <h1 className="ep-title">🎞️ Editor sign {mode === 'signup' ? 'up' : 'in'}</h1>
          <p className="ep-sub">{mode === 'signup' ? 'Use the email the studio added for you, and choose a password.' : 'Sign in to download your clients\u2019 RAW files.'}</p>
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
        <div><div className="ep-title">🎞️ RAW files{me.studio ? ` — ${me.studio}` : ''}</div><div className="rs-muted">{me.email}</div></div>
        <button className="ep-link" type="button" onClick={signOut}>Sign out</button>
      </header>

      {open ? (
        <section className="ep-card">
          <button className="ep-link" type="button" onClick={() => setOpen(null)}>← All clients</button>
          <h2 className="rs-h">{open.name}</h2>
          <p className="rs-sub">{open.files.length} RAW file{open.files.length === 1 ? '' : 's'} of the {open.selected} photo{open.selected === 1 ? '' : 's'} the client picked · {mb(open.files.reduce((t, f) => t + f.size, 0))}</p>
          {open.files.length > 0 && <button className="rs-btn" type="button" onClick={downloadAll}>⬇️ Download all{window.showDirectoryPicker ? ' to a folder' : ''}</button>}
          {progress && <div className="ep-progress">{progress}</div>}
          <div className="ep-deliver">
            <h3 className="rs-h">⬆️ Deliver edited photos</h3>
            <p className="rs-sub">Each folder becomes a tab in {open.name}'s gallery. The studio's logo is added to every photo.</p>
            <div className="rs-add">
              <input list="ep-tabs" value={tab} onChange={e => setTab(e.target.value)} placeholder="Folder name, e.g. Photos" aria-label="Folder name" maxLength={60} />
              <datalist id="ep-tabs">{[...new Set(['Photos', 'Instagram', 'Stories', ...tabs.map(t => t.name)])].map(n => <option key={n} value={n} />)}</datalist>
              <label className={`rs-btn rs-file ${tab.trim() ? '' : 'is-off'}`}>Choose edited photos
                <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple hidden disabled={!tab.trim()} onChange={deliver} />
              </label>
            </div>
            {sending && <div className="ep-progress">{sending}</div>}
            {tabs.length > 0 && <div className="rs-muted">Already delivered: {tabs.map(t => `${t.name} (${t.photos})`).join(' · ')}</div>}
          </div>
          <h3 className="rs-h ep-gap">🎞️ RAW files to edit</h3>
          <ul className="rs-list">
            {open.files.map(f => (
              <li key={f.id} className="rs-row">
                <span className="rs-strong">{f.name}</span>
                <span className="rs-muted">{mb(f.size)}</span>
                <button className="rs-x" type="button" onClick={() => downloadOne(f).catch(x => setErr(x.message))}>Download</button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="ep-card">
          <h2 className="rs-h">Clients</h2>
          {err && <div className="rs-err">⚠️ {err}</div>}
          {clients === null ? <div className="rs-muted">Loading…</div>
            : clients.length === 0 ? <div className="rs-muted">No client has sent a selection yet.</div>
              : (
                <ul className="rs-list">
                  {clients.map(c => (
                    <li key={c.id} className="rs-row ep-client">
                      <button className="ep-open" type="button" onClick={() => openClient(c)}>
                        <span className="rs-strong">{c.name}{c.isNew && <span className="rs-pill is-on ep-new">New</span>}</span>
                        <span className="rs-muted">Sent {day(c.sentAt, me?.timezone, me?.time_format)} · {c.ready} RAW{c.ready === 1 ? '' : 's'} · {mb(c.bytes)}{c.missing ? ` · ${c.missing} picked photo${c.missing === 1 ? '' : 's'} without a RAW` : ''}</span>
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
