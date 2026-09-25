import { useState, useEffect, useRef, useCallback } from 'react';
import './gallery.css';
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
  /* An INDEX rather than the photo, so the arrows and the keyboard can move
     through the set. Holding the object would mean searching for it again to
     find its neighbours. */
  const [open, setOpen] = useState(null);
  const current = open !== null && photos ? photos[open] : null;

  /* Wrapping, deliberately: a guest with four photographs should not hit a
     wall at either end. */
  const step = useCallback((d) => {
    setOpen(i => (i === null || !photos?.length) ? i : (i + d + photos.length) % photos.length);
  }, [photos]);

  /* Arrow keys and Escape, as anybody expects of a photo viewer. */
  useEffect(() => {
    if (open === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);
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
          {/* The gallery's own grid classes. Portraits span two rows and the
              holes they leave get backfilled, which is what stops the dead
              space at the end of a row. */}
          <div className="pg-grid">
            {photos.map((p, i) => (
              <div key={p.id} className="pg-tile" onClick={() => setOpen(i)}>
                <img loading="lazy" alt={p.filename} src={`${base}/photo/${p.id}/thumb`} />
              </div>
            ))}
          </div>
        </>
      )}

      {current && (
        <div className="pg-lb" onClick={() => setOpen(null)}>
          <div className="pg-lb-bar" onClick={e => e.stopPropagation()}>
            <span className="pg-lb-name">{(current.filename || '').replace(/\.[^.]+$/, '')}</span>
            <div className="pg-lb-acts">
              <a className="pg-lb-btn" href={`${base}/photo/${current.id}/orig`} title="Download photo">⤓</a>
              <button className="pg-lb-btn" onClick={() => setOpen(null)} title="Close">✕</button>
            </div>
          </div>
          <button className="pg-lb-nav prev" aria-label="Previous"
            onClick={e => { e.stopPropagation(); step(-1); }}>‹</button>
          <div className="pg-lb-stage" onClick={e => e.stopPropagation()}>
            <img className="pg-lb-img" alt={current.filename}
              src={`${base}/photo/${current.id}/preview`} />
          </div>
          <button className="pg-lb-nav next" aria-label="Next"
            onClick={e => { e.stopPropagation(); step(1); }}>›</button>
        </div>
      )}
    </div>
  );
}
