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

  /* 👆 Swipe, because almost everybody opening this is on a phone and arrows
     drawn for a mouse are not what a thumb reaches for. Left and right move,
     a pull down closes. Same gesture and same thresholds as the gallery. */
  const touch = useRef(null);
  const SWIPE_MIN = 45;                        // px before it counts as a swipe

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    /* Whichever axis moved more wins, so a slightly diagonal swipe still does
       the obvious thing rather than nothing. */
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) < SWIPE_MIN) return;
      step(dx < 0 ? 1 : -1);                   // swipe left = next
    } else if (dy > SWIPE_MIN * 1.6) {         // pull down → close
      setOpen(null);
    }
  };

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
  const camRef = useRef(null);
  const backRef = useRef(null);

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

  /* A phone gets handed round at a wedding. Whoever holds it next should see
     their own photographs, not the ones belonging to whoever held it first. */
  async function signOut() {
    try { await fetch(`${base}/signout`, { method: 'POST', credentials: 'include' }); }
    catch { /* clearing the view matters more than the round trip */ }
    setPhotos(null);
    setErr('');
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
        {/* The studio's wordmark, small and quiet — the couple's name is the
            headline, not the business. */}
        <div className="ls-brand">
          <span className="ls-brand-ic">◎</span>
          <span className="ls-brand-name">{info.studio?.name}</span>
        </div>
        {info.studio?.tagline && <div className="ls-tagline">{info.studio.tagline}</div>}

        {/* The mark itself, large. This is the thing a guest recognises. */}
        {info.studio?.logo && (
          <img className="ls-logo" alt={info.studio.name || ''}
            src={`/api/me/logo/${info.studio.logo}`} />
        )}
      </header>

      {!photos ? (
        <div className="ls-gate">
          {/* One word in italic gold carries the whole page. A headline set
              entirely in one weight reads as a form label. */}
          <h1 className="ls-h1">
            Find your <em>photos</em>
            <span>from {info.album?.title || 'the event'}</span>
          </h1>
          <p className="ls-lead">
            Take a quick selfie and we&rsquo;ll search the whole event for
            pictures of you.
          </p>

          {/* Three ways in, not two. Someone standing alone takes a selfie;
              someone with a friend hands them the phone and uses the back
              camera, which is a better photograph and a common way to do it.
              capture= sends a phone straight to that camera. */}
          <input ref={camRef} type="file" accept="image/*" capture="user" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; send(f); }} />
          <input ref={backRef} type="file" accept="image/*" capture="environment" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; send(f); }} />
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; send(f); }} />

          <button className="ls-b" disabled={busy} onClick={() => camRef.current?.click()}>
            <span className="ls-b-ic">☺</span>
            {busy ? 'Looking…' : 'Take a Selfie'}
          </button>

          <div className="ls-or"><span>or</span></div>

          <button className="ls-b is-ghost" disabled={busy} onClick={() => backRef.current?.click()}>
            <span className="ls-b-ic">⊙</span> Use Back Camera
          </button>
          <button className="ls-b is-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="ls-b-ic">▤</span> Upload from Gallery
          </button>

          <p className="ls-fine">
            Your photo is only used to find you, then deleted. It is never saved.
          </p>

          {info.still_indexing && (
            <p className="ls-note">
              The photographer is still uploading — if you are not found yet,
              try again shortly.
            </p>
          )}
          {err && <p className="ls-err">{err}</p>}
        </div>
      ) : photos.length === 0 ? (
        <p className="ls-quiet">Nothing found yet. Try again once more photos are up.</p>
      ) : (
        <>
          {/* ⚠️ The count and the sign-out lived in the header, which I replaced
              wholesale — and took them with it. They belong here anyway: they
              only mean anything once somebody is looking at their own
              photographs. */}
          <p className="ls-sub">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'} of you
            {' · '}
            <button className="ls-out" onClick={signOut}>Not you?</button>
          </p>

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
        <div className="pg-lb" onClick={() => setOpen(null)}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
      {/* A guest who likes their photographs should be one tap from the
          photographer. Each link is shown only if the studio actually set it,
          so nobody gets a row of dead circles. */}
      <footer className="ls-foot-brand">
        <div className="ls-social">
          {info.studio?.site && <a href={info.studio.site} title="Website">⌘</a>}
          {info.studio?.instagram && <a href={`https://instagram.com/${String(info.studio.instagram).replace(/^@/, "")}`} title="Instagram">◱</a>}
          {info.studio?.facebook && <a href={`https://facebook.com/${info.studio.facebook}`} title="Facebook">f</a>}
          {info.studio?.email && <a href={`mailto:${info.studio.email}`} title="Email">✉</a>}
          {info.studio?.phone && <a href={`tel:${info.studio.phone}`} title="Phone">✆</a>}
        </div>
        {info.studio?.name && <div className="ls-by">Photography by <strong>{info.studio.name}</strong></div>}
      </footer>
    </div>
  );
}
