import { useState, useEffect, useRef } from 'react';
import './liveshoot.css';

/**
 * 🎥 A guest finding themselves in a shoot.
 *
 * One link goes to a whole wedding. Everybody who opens it sees only the
 * photographs they are in, after showing their face once.
 *
 * 🔒 The selfie never leaves this page as anything but a comparison. The server
 * turns it into numbers, compares, and deletes it before replying — and the
 * pass it sends back names clusters, not a face. A guest who proves themselves
 * on the night can come back for a fortnight without doing it again.
 */
export default function LiveShootPublic({ token }) {
  const [info, setInfo] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);           // the photo being viewed large
  const fileRef = useRef(null);

  const base = `/api/live/${token}`;

  useEffect(() => {
    fetch(base)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('This link is not valid.')))
      .then(d => {
        setInfo(d);
        /* Somebody who proved themselves last week lands on their photographs,
           not on a camera prompt they have already satisfied. */
        if (d.already_matched) loadMine();
      })
      .catch(e => setErr(e.message));
  }, [token]);                                      // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMine() {
    try {
      const r = await fetch(`${base}/mine`, { credentials: 'include' });
      if (!r.ok) return;
      setPhotos((await r.json()).photos || []);
    } catch { /* the prompt stays; nothing is lost */ }
  }

  async function send(file) {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('selfie', file);
      const r = await fetch(`${base}/match`, { method: 'POST', body: fd, credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'That did not work.');
      if (!d.matched) {
        setErr("I couldn't find you in these photos. If the photographer is still shooting, try again in a little while.");
        return;
      }
      setPhotos(d.photos || []);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !info) return <div className="ls"><p className="ls-err">{err}</p></div>;
  if (!info) return <div className="ls"><p className="ls-quiet">Loading…</p></div>;

  return (
    <div className="ls">
      <header className="ls-head">
        <h1>{info.album?.title}</h1>
        {photos ? (
          <p className="ls-sub">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} of you</p>
        ) : (
          <p className="ls-sub">{info.photos} photos · {info.people} people</p>
        )}
      </header>

      {!photos ? (
        <div className="ls-gate">
          <div className="ls-face">📸</div>
          <h2>Find your photos</h2>
          <p>
            Take a photo of yourself and we will show you every picture you are
            in. Your photo is used to compare and then deleted — it is never
            saved.
          </p>

          {/* capture="user" opens the front camera straight away on a phone,
              which is where almost everybody will be standing. */}
          <input ref={fileRef} type="file" accept="image/*" capture="user" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; send(f); }} />

          <button className="ls-b" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Looking…' : 'Take a photo'}
          </button>

          {info.still_indexing && (
            /* Otherwise "no photos found" reads as "you are in none of them". */
            <p className="ls-note">
              The photographer is still uploading — if you are not found yet, try
              again shortly.
            </p>
          )}
          {err && <p className="ls-err">{err}</p>}
        </div>
      ) : photos.length === 0 ? (
        <p className="ls-quiet">Nothing found yet. Try again once more photos are up.</p>
      ) : (
        <>
          <div className="ls-grid">
            {photos.map(p => (
              <button key={p.id} className="ls-cell" onClick={() => setOpen(p)}>
                <img loading="lazy" alt={p.filename} src={`${base}/photo/${p.id}/thumb`} />
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <div className="ls-lightbox" onClick={() => setOpen(null)}>
          <img alt={open.filename} src={`${base}/photo/${open.id}/preview`} />
          <div className="ls-lb-bar" onClick={e => e.stopPropagation()}>
            <span>{open.filename}</span>
            <a className="ls-dl" href={`${base}/photo/${open.id}/orig`}>Download</a>
            <button className="ls-x" onClick={() => setOpen(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
