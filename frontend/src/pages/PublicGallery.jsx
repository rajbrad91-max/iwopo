import { useState, useEffect, useRef, useCallback } from 'react';
import './gallery.css';

const API = '/api/g';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Playfair+Display:wght@500;700&family=Jost:wght@300;400;600&family=Montserrat:wght@400;600&family=Poppins:wght@400;600&family=Lora:wght@400;600&family=Raleway:wght@400;600&display=swap';

function ensureFonts() {
  if (document.getElementById('pg-fonts')) return;
  const l = document.createElement('link');
  l.id = 'pg-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
  document.head.appendChild(l);
}

export default function PublicGallery({ token, embedded }) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [authing, setAuthing] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [session, setSession] = useState(null);

  const [lightbox, setLightbox] = useState(null);   // index into `photos`
  const [zipBusy, setZipBusy] = useState('');
  const [activeEvent, setActiveEvent] = useState('all');
  const [matchIds, setMatchIds] = useState(null);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieMsg, setSelfieMsg] = useState('');
  const [favs, setFavs] = useState(() => new Set());
  const [favsOnly, setFavsOnly] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [copied, setCopied] = useState(false);
  const selfieInput = useRef(null);

  useEffect(() => { ensureFonts(); }, []);
  useEffect(() => {
    fetch(`${API}/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Gallery not found'))))
      .then(setMeta)
      .catch(e => setErr(e.message));
  }, [token]);

  // favourites persist per gallery, on this device
  const favKey = `pg-favs-${token}`;
  useEffect(() => {
    try {
      const raw = window.sessionStorage?.getItem(favKey);
      if (raw) setFavs(new Set(JSON.parse(raw)));
    } catch { /* storage unavailable — favourites stay in memory */ }
  }, [favKey]);
  const persistFavs = (next) => {
    try { window.sessionStorage?.setItem(favKey, JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const theme = session?.theme || meta?.theme || {};
  const styleVars = {
    '--pg-bg': theme.bg_color || '#0f1115',
    '--pg-head': theme.heading_color || '#f3f4f6',
    '--pg-accent': theme.accent_color || '#2dd4bf',
    '--pg-sub': theme.sub_color || '#9ca3af',
    '--pg-hfont': `'${theme.heading_font || 'Playfair Display'}', serif`,
    '--pg-bfont': `'${theme.body_font || 'Jost'}', sans-serif`,
  };

  async function unlock(e) {
    e?.preventDefault();
    if (!pw.trim()) return;
    setAuthing(true); setAuthErr('');
    try {
      const r = await fetch(`${API}/${token}/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'That password did not match');
      setSession(d);
    } catch (e) { setAuthErr(e.message); }
    finally { setAuthing(false); }
  }

  const photoUrl = (id, type) => `${API}/${token}/photo/${id}/${type}?vt=${session.vt}`;
  const downloadOne = (id) => { window.location.href = `${API}/${token}/download/${id}?vt=${session.vt}`; };
  function downloadAll(eventId) {
    const key = eventId || 'all';
    setZipBusy(key);
    const q = eventId ? `&event=${eventId}` : '';
    window.location.href = `${API}/${token}/download-all?vt=${session.vt}${q}`;
    setTimeout(() => setZipBusy(''), 4000);
  }

  function toggleFav(id) {
    setFavs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistFavs(next);
      return next;
    });
  }

  function shareGallery() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: session?.title || 'Gallery', url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => prompt('Copy this link:', url));
  }

  async function onSelfie(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSelfieBusy(true); setSelfieMsg('Looking for you…');
    try {
      const fd = new FormData();
      fd.append('selfie', file);
      const r = await fetch(`${API}/${token}/selfie?vt=${session.vt}`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed');
      setMatchIds(d.photo_ids);
      setFavsOnly(false);
      setSelfieMsg(d.matches ? `Found ${d.matches} photo${d.matches === 1 ? '' : 's'} of you` : 'No matches — try a clearer selfie');
    } catch (err) { setSelfieMsg(err.message); }
    finally { setSelfieBusy(false); e.target.value = ''; }
  }

  // 🖼️ what's on screen right now
  const allPhotos = session?.photos || [];
  let photos = allPhotos;
  if (session?.mode === 'per_client' && activeEvent !== 'all') photos = photos.filter(p => String(p.event_id) === String(activeEvent));
  if (matchIds !== null) photos = photos.filter(p => matchIds.includes(p.id));
  if (favsOnly) photos = photos.filter(p => favs.has(p.id));

  // ⌨️ lightbox + slideshow navigation
  const step = useCallback((dir) => {
    setLightbox(i => {
      if (i === null) return null;
      const n = photos.length;
      if (!n) return null;
      return (i + dir + n) % n;
    });
  }, [photos.length]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setLightbox(null); setSlideshow(false); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, step]);

  useEffect(() => {
    if (!slideshow || lightbox === null) return;
    const t = setInterval(() => step(1), 3500);
    return () => clearInterval(t);
  }, [slideshow, lightbox, step]);

  if (err) return <div className="pg-wrap" style={styleVars}><div className="pg-state">{err}</div></div>;
  if (!meta) return <div className="pg-wrap" style={styleVars}><div className="pg-state">Loading…</div></div>;

  // 🔒 password gate
  if (!session) {
    const m = meta.album;
    return (
      <div className="pg-wrap pg-gate-wrap" style={styleVars}>
        {m.cover && <div className="pg-gate-bg" style={{ backgroundImage: `url(${API}/${token}/cover)` }} />}
        <div className="pg-gate">
          <div className="pg-kicker">{theme.title_text || 'Private gallery'}</div>
          <h1 className="pg-gate-title">{m.title}</h1>
          <div className="pg-gate-sub">{m.photo_count} photos · enter your password to view</div>
          <form onSubmit={unlock} className="pg-gate-form">
            <input className="pg-input" type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            <button className="pg-btn" type="submit" disabled={authing}>{authing ? 'Checking…' : 'View gallery'}</button>
          </form>
          {authErr && <div className="pg-err">{authErr}</div>}
        </div>
      </div>
    );
  }

  const current = lightbox !== null ? photos[lightbox] : null;
  const favCount = favs.size;

  return (
    <div className="pg-wrap" style={styleVars}>
      {/* header */}
      <header className="pg-head">
        <div className="pg-head-left">
          <div className="pg-kicker">{theme.title_text || 'Private gallery'}</div>
          <h1 className="pg-title">{session.title}</h1>
          <div className="pg-count">
            {allPhotos.length} photos
            {favCount > 0 && <> · {favCount} favourite{favCount === 1 ? '' : 's'}</>}
          </div>
        </div>

        <div className="pg-tools">
          {session.faceReady && (
            matchIds === null
              ? <button className="pg-tool" onClick={() => selfieInput.current?.click()} disabled={selfieBusy}>
                  {selfieBusy ? 'Searching…' : 'Find my photos'}
                </button>
              : <button className="pg-tool is-on" onClick={() => { setMatchIds(null); setSelfieMsg(''); }}>Show all</button>
          )}
          <input ref={selfieInput} type="file" accept="image/*" hidden onChange={onSelfie} />

          {favCount > 0 && (
            <button className={`pg-tool ${favsOnly ? 'is-on' : ''}`} onClick={() => setFavsOnly(v => !v)}>
              ♥ {favsOnly ? 'All photos' : 'Favourites'}
            </button>
          )}

          <button className="pg-tool" onClick={shareGallery}>{copied ? 'Link copied' : 'Share'}</button>

          {photos.length > 0 && (
            <button className="pg-tool" onClick={() => { setLightbox(0); setSlideshow(true); }}>Slideshow</button>
          )}

          {allPhotos.length > 0 && (
            <button className="pg-btn pg-btn-sm" onClick={() => downloadAll(null)} disabled={zipBusy === 'all'}>
              {zipBusy === 'all' ? 'Preparing…' : 'Download all'}
            </button>
          )}
        </div>
      </header>

      {selfieMsg && <div className="pg-note">{selfieMsg}</div>}

      {/* per-client event tabs */}
      {session.mode === 'per_client' && session.events.length > 0 && matchIds === null && !favsOnly && (
        <nav className="pg-events">
          <button className={`pg-ev ${activeEvent === 'all' ? 'is-on' : ''}`} onClick={() => setActiveEvent('all')}>All</button>
          {session.events.map(ev => (
            <span key={ev.id} className="pg-ev-group">
              <button className={`pg-ev ${String(activeEvent) === String(ev.id) ? 'is-on' : ''}`} onClick={() => setActiveEvent(ev.id)}>{ev.name}</button>
              <button className="pg-ev-dl" title={`Download ${ev.name}`} onClick={() => downloadAll(ev.id)} disabled={zipBusy === ev.id}>
                {zipBusy === ev.id ? '…' : '↓'}
              </button>
            </span>
          ))}
        </nav>
      )}

      {/* 🧱 masonry grid */}
      {photos.length === 0 ? (
        <div className="pg-state">
          {favsOnly ? 'No favourites yet — tap the heart on a photo to save it.'
            : matchIds !== null ? 'No matching photos.'
            : 'This gallery is empty.'}
        </div>
      ) : (
        <div className="pg-masonry">
          {photos.map((p, i) => (
            <figure key={p.id} className="pg-tile" onClick={() => { setSlideshow(false); setLightbox(i); }}>
              <img src={photoUrl(p.id, 'thumb')} loading="lazy" alt="" />
              <div className="pg-tile-veil" />
              <button
                className={`pg-fav ${favs.has(p.id) ? 'is-on' : ''}`}
                onClick={e => { e.stopPropagation(); toggleFav(p.id); }}
                aria-label={favs.has(p.id) ? 'Remove favourite' : 'Add favourite'}
              >♥</button>
              <button
                className="pg-tile-dl"
                onClick={e => { e.stopPropagation(); downloadOne(p.id); }}
                aria-label="Download photo"
              >↓</button>
            </figure>
          ))}
        </div>
      )}

      {/* 🔍 lightbox */}
      {current && (
        <div className="pg-lb" onClick={() => { setLightbox(null); setSlideshow(false); }}>
          <div className="pg-lb-bar" onClick={e => e.stopPropagation()}>
            <span className="pg-lb-count">{lightbox + 1} / {photos.length}</span>
            <div className="pg-lb-acts">
              <button className={`pg-lb-btn ${favs.has(current.id) ? 'is-on' : ''}`} onClick={() => toggleFav(current.id)}>♥</button>
              <button className={`pg-lb-btn ${slideshow ? 'is-on' : ''}`} onClick={() => setSlideshow(s => !s)}>
                {slideshow ? '❚❚' : '▶'}
              </button>
              <button className="pg-lb-btn" onClick={() => downloadOne(current.id)}>↓</button>
              <button className="pg-lb-btn" onClick={() => { setLightbox(null); setSlideshow(false); }}>✕</button>
            </div>
          </div>

          <button className="pg-lb-nav prev" onClick={e => { e.stopPropagation(); setSlideshow(false); step(-1); }} aria-label="Previous">‹</button>
          <img
            key={current.id}
            className="pg-lb-img"
            src={photoUrl(current.id, 'preview')}
            alt=""
            onClick={e => e.stopPropagation()}
          />
          <button className="pg-lb-nav next" onClick={e => { e.stopPropagation(); setSlideshow(false); step(1); }} aria-label="Next">›</button>
        </div>
      )}

      {!embedded && <footer className="pg-foot">Powered by iwopo</footer>}
    </div>
  );
}
