import { useState, useEffect, useRef, useCallback } from 'react';
import './gallery.css';

const API = '/api/g';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Playfair+Display:wght@400;500;700&family=Jost:wght@300;400;500&family=Montserrat:wght@300;400;600&family=Poppins:wght@300;400;600&family=Lora:wght@400;600&family=Raleway:wght@300;400;600&display=swap';

function ensureFonts() {
  if (document.getElementById('pg-fonts')) return;
  const l = document.createElement('link');
  l.id = 'pg-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
  document.head.appendChild(l);
}

// simple line icons — they inherit the button's colour, so themes just work
const Icon = ({ d, ...rest }) => (
  <svg className="pg-ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {d}
  </svg>
);
const IconClose = <Icon d={<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>} />;
// two overlapping people → "show more faces/people"
const IconPeople = <Icon d={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M16 5.2a3.2 3.2 0 010 5.9" /><path d="M17.5 13.4A5.5 5.5 0 0120.5 18.3" /></>} />;
// single person in view → "find me / my selfie"
const IconUser = <Icon d={<><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0114 0" /></>} />;

export default function PublicGallery({ token, embedded, onBack }) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [authing, setAuthing] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [session, setSession] = useState(null);

  const [lightbox, setLightbox] = useState(null);
  const [zipBusy, setZipBusy] = useState('');
  const [activeEvent, setActiveEvent] = useState('all');
  const [matchIds, setMatchIds] = useState(null);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieMsg, setSelfieMsg] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [pickedOnly, setPickedOnly] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [faces, setFaces] = useState([]);           // face circles, most photos first
  const [activeFace, setActiveFace] = useState(null);
  const [allFaces, setAllFaces] = useState(false);  // "Find more" → show every circle
  const [findMeOpen, setFindMeOpen] = useState(false);
  const [faceLimit, setFaceLimit] = useState(10);

  // how many face circles fit before "Find more": 4-5 on phones, 8-10 on desktop
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setFaceLimit(w < 480 ? 4 : w < 700 ? 5 : w < 1100 ? 8 : 10);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const selfieInput = useRef(null);
  const cameraInput = useRef(null);
  const gridRef = useRef(null);
  const [tallIds, setTallIds] = useState(() => new Set());   // portraits → span 2 grid rows

  // measure each photo once it loads; portraits get a taller cell
  const noteShape = (id, img) => {
    if (!img?.naturalWidth || !img?.naturalHeight) return;
    if (img.naturalHeight <= img.naturalWidth) return;        // landscape/square → normal cell
    setTallIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  useEffect(() => { ensureFonts(); }, []);
  useEffect(() => {
    fetch(`${API}/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Gallery not found'))))
      .then(setMeta)
      .catch(e => setErr(e.message));
  }, [token]);

  const pickKey = `pg-picked-${token}`;
  useEffect(() => {
    try {
      const raw = window.sessionStorage?.getItem(pickKey);
      if (raw) setPicked(new Set(JSON.parse(raw)));
    } catch { /* storage unavailable — selection stays in memory */ }
  }, [pickKey]);
  const persist = (next) => {
    try { window.sessionStorage?.setItem(pickKey, JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const theme = session?.theme || meta?.theme || {};
  const styleVars = {
    '--pg-bg': theme.bg_color || '#fbfbfa',
    '--pg-head': theme.heading_color || '#16161a',
    '--pg-accent': theme.accent_color || '#1f6f6b',
    '--pg-sub': theme.sub_color || '#8a8a8f',
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
      if (d.mode === 'per_client' && d.events && d.events.length > 0) setActiveEvent(d.events[0].id);
    } catch (e) { setAuthErr(e.message); }
    finally { setAuthing(false); }
  }

  const photoUrl = (id, type) => `${API}/${token}/photo/${id}/${type}?vt=${session.vt}`;
  const faceUrl = (clusterId) => `${API}/${token}/face/${clusterId}?vt=${session.vt}`;

  // 🧑‍🤝‍🧑 load the face circles once we're in
  useEffect(() => {
    if (!session) return;
    fetch(`${API}/${token}/faces?vt=${session.vt}`)
      .then(r => r.json())
      .then(d => setFaces(d.faces || []))
      .catch(() => {});
  }, [session, token]);

  // clicking a circle filters the grid to that person
  async function pickFace(f) {
    if (activeFace === f.id) { setActiveFace(null); setMatchIds(null); return; }
    setActiveFace(f.id);
    setSelfieMsg('');
    try {
      const r = await fetch(`${API}/${token}/face/${f.id}/photos?vt=${session.vt}`);
      const d = await r.json();
      setMatchIds(d.photo_ids || []);
      setPickedOnly(false);
      gridRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch { setActiveFace(null); }
  }
  function clearFace() { setActiveFace(null); setMatchIds(null); setSelfieMsg(''); }

  const downloadOne = (id) => { window.location.href = `${API}/${token}/download/${id}?vt=${session.vt}`; };
  function downloadAll(eventId) {
    const key = eventId || 'all';
    setZipBusy(key);
    const q = eventId && eventId !== 'all' ? `&event=${eventId}` : '';
    window.location.href = `${API}/${token}/download-all?vt=${session.vt}${q}`;
    setTimeout(() => setZipBusy(''), 4000);
  }
  function downloadPicked() {
    setZipBusy('picked');
    [...picked].forEach((id, i) => setTimeout(() => downloadOne(id), i * 400));
    setTimeout(() => setZipBusy(''), picked.size * 400 + 800);
  }

  function togglePick(id) {
    setPicked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persist(next);
      return next;
    });
  }
  function clearPicked() { setPicked(new Set()); persist(new Set()); setPickedOnly(false); }

  async function onSelfie(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFindMeOpen(false);
    setActiveFace(null);
    setSelfieBusy(true); setSelfieMsg('Looking for you…');
    try {
      const fd = new FormData();
      fd.append('selfie', file);
      const r = await fetch(`${API}/${token}/selfie?vt=${session.vt}`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed');
      setMatchIds(d.photo_ids);
      setPickedOnly(false);
      setSelfieMsg(d.matches ? `Found ${d.matches} photo${d.matches === 1 ? '' : 's'} of you` : 'No matches — try a clearer selfie');
      gridRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) { setSelfieMsg(err.message); }
    finally { setSelfieBusy(false); e.target.value = ''; }
  }

  const allPhotos = session?.photos || [];
  let photos = allPhotos;
  if (session?.mode === 'per_client' && activeEvent !== 'all') photos = photos.filter(p => String(p.event_id) === String(activeEvent));
  if (matchIds !== null) photos = photos.filter(p => matchIds.includes(p.id));
  if (pickedOnly) photos = photos.filter(p => picked.has(p.id));

  const step = useCallback((dir) => {
    setLightbox(i => {
      if (i === null) return null;
      const n = photos.length;
      return n ? (i + dir + n) % n : null;
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

  // ⏭️ preload the full-size of next 3 + prev 1 so swiping feels instant
  useEffect(() => {
    if (lightbox === null || !session) return;
    const n = photos.length;
    [lightbox + 1, lightbox + 2, lightbox + 3, lightbox - 1]
      .filter(i => i >= 0 && i < n)
      .forEach(i => { const im = new Image(); im.src = photoUrl(photos[i].id, 'full'); });
  }, [lightbox, session]);

  // 👆 swipe the full-screen photo: left/right to move, down to close
  const touch = useRef(null);
  const SWIPE_MIN = 45;                       // px before it counts as a swipe
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
    if (Math.abs(dx) > Math.abs(dy)) {         // horizontal → next / previous
      if (Math.abs(dx) < SWIPE_MIN) return;
      setSlideshow(false);
      step(dx < 0 ? 1 : -1);                   // swipe left = next
    } else if (dy > SWIPE_MIN * 1.6) {         // pull down → close
      setLightbox(null);
      setSlideshow(false);
    }
  };

  if (err) return <div className="pg-wrap" style={styleVars}><div className="pg-state">{err}</div></div>;
  if (!meta) return <div className="pg-wrap" style={styleVars}><div className="pg-state">Loading…</div></div>;

  const coverUrl = meta.album.cover ? `${API}/${token}/cover` : null;

  if (!session) {
    const m = meta.album;
    return (
      <div className="pg-wrap pg-gatewrap" style={styleVars}>
        {coverUrl && <div className="pg-gate-bg" style={{ backgroundImage: `url(${coverUrl})` }} />}
        <div className="pg-gate">
          <div className="pg-eyebrow">{theme.title_text || 'Private gallery'}</div>
          <h1 className="pg-gate-title">{m.title}</h1>
          <form onSubmit={unlock} className="pg-gate-form">
            <input className="pg-input" type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            <button className="pg-btn" type="submit" disabled={authing}>{authing ? 'Checking…' : 'Enter gallery'}</button>
          </form>
          {authErr && <div className="pg-err">{authErr}</div>}
        </div>
      </div>
    );
  }

  const current = lightbox !== null ? photos[lightbox] : null;
  const nPicked = picked.size;
  // how many circles fit before "Find more" — 4-5 on phones, 8-10 on desktop
  const shownFaces = allFaces ? faces : faces.slice(0, faceLimit);
  const hasMoreFaces = faces.length > faceLimit;
  const showScenes = session.mode === 'per_client' && session.events.length > 0 && matchIds === null && !pickedOnly;

  return (
    <div className="pg-wrap" style={styleVars}>

      <section className={`pg-cover ${coverUrl ? '' : 'is-plain'}`}>
        {coverUrl && <div className="pg-cover-img" style={{ backgroundImage: `url(${coverUrl})` }} />}
        <div className="pg-cover-inner">
          <div className="pg-eyebrow">{theme.title_text || 'Private gallery'}</div>
          <h1 className="pg-cover-title">{session.title}</h1>
          <div className="pg-cover-meta">{allPhotos.length} photos</div>
        </div>
        <button className="pg-scroll" onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <span>View photos</span>
          <i />
        </button>
      </section>

      <input ref={selfieInput} type="file" accept="image/*" hidden onChange={onSelfie} />
      {/* separate input so "take a selfie" opens the camera directly on phones */}
      <input ref={cameraInput} type="file" accept="image/*" capture="user" hidden onChange={onSelfie} />

      {/* 🤳 find-me popup */}
      {findMeOpen && (
        <div className="pg-modal" onClick={() => setFindMeOpen(false)}>
          <div className="pg-modal-card" onClick={e => e.stopPropagation()}>
            <button className="pg-modal-x" onClick={() => setFindMeOpen(false)}>✕</button>
            <h2 className="pg-modal-title">Find your photos</h2>
            <p className="pg-modal-sub">We'll match your face against this gallery. Your photo isn't stored.</p>
            <div className="pg-modal-acts">
              <button className="pg-btn" onClick={() => cameraInput.current?.click()}>Take a selfie</button>
              <button className="pg-btn is-ghost" onClick={() => selfieInput.current?.click()}>Upload a photo</button>
            </div>
          </div>
        </div>
      )}

      <div ref={gridRef} />

      {selfieMsg && <div className="pg-note">{selfieMsg}</div>}

      {(onBack || showScenes) && (
        <nav className="pg-scenes">
          {onBack && <button className="pg-back" onClick={onBack}>← Back</button>}
          {showScenes && <>
          {session.events.map(ev => (
            <button
              key={ev.id}
              className={`pg-scene ${String(activeEvent) === String(ev.id) ? 'is-on' : ''}`}
              onClick={() => setActiveEvent(ev.id)}
            >{ev.name}</button>
          ))}
          <button className="pg-scene-dl" onClick={() => downloadAll(activeEvent)} disabled={zipBusy === activeEvent}>
            {zipBusy === activeEvent ? 'Preparing…' : `Download ${session.events.find(ev => String(ev.id) === String(activeEvent))?.name || 'event'}`}
          </button>
          </>}
        </nav>
      )}

      {/* bar 2 — the people in this gallery */}
      {(faces.length > 0 || session.faceReady) && (
        <div className="pg-people">
          <div className={`pg-faces ${allFaces ? 'is-expanded' : ''}`}>
            {shownFaces.map(f => (
              <button
                key={f.id}
                className={`pg-face ${activeFace === f.id ? 'is-on' : ''}`}
                onClick={() => pickFace(f)}
                title={`${f.count} photos`}
              >
                <img src={faceUrl(f.id)} alt="" loading="lazy" />
                <span className="pg-face-n">{f.count}</span>
              </button>
            ))}
            {faces.length === 0 && <span className="pg-faces-empty">Finding faces…</span>}
          </div>

          <div className="pg-people-acts">
            {activeFace && (
              <button className="pg-ico is-on" onClick={clearFace}>
                {IconClose}<span>Show all</span>
              </button>
            )}
            <button
              className="pg-ico"
              onClick={() => setAllFaces(v => !v)}
              disabled={!hasMoreFaces && !allFaces}
            >
              {IconPeople}<span>{allFaces ? 'Show fewer' : 'More Faces'}</span>
            </button>
            <button className="pg-ico" onClick={() => setFindMeOpen(true)} disabled={selfieBusy}>
              {IconUser}<span>{selfieBusy ? 'Searching…' : 'Find me'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="pg-grid">
        {photos.length === 0 ? (
          <div className="pg-state">
            {pickedOnly ? 'Nothing selected yet.'
              : matchIds !== null ? 'No matching photos.'
              : 'This gallery is empty.'}
          </div>
        ) : photos.map((p, i) => (
          <figure
            key={p.id}
            className={`pg-tile ${tallIds.has(p.id) ? 'is-tall' : ''} ${picked.has(p.id) ? 'is-picked' : ''}`}
            onClick={() => { setSlideshow(false); setLightbox(i); }}
          >
            <img
              src={photoUrl(p.id, 'thumb')}
              loading="lazy"
              alt=""
              onLoad={e => noteShape(p.id, e.currentTarget)}
            />
            <button
              className="pg-check"
              onClick={e => { e.stopPropagation(); togglePick(p.id); }}
              aria-label={picked.has(p.id) ? 'Deselect photo' : 'Select photo'}
            >✓</button>
          </figure>
        ))}
      </div>

      {nPicked > 0 && (
        <div className="pg-selbar">
          <span className="pg-selbar-n">{nPicked} selected</span>
          <div className="pg-selbar-acts">
            <button className="pg-selbar-btn" onClick={() => setPickedOnly(v => !v)}>
              {pickedOnly ? 'Show all' : 'View selected'}
            </button>
            <button className="pg-selbar-btn" onClick={downloadPicked} disabled={zipBusy === 'picked'}>
              {zipBusy === 'picked' ? 'Downloading…' : 'Download'}
            </button>
            <button className="pg-selbar-btn is-quiet" onClick={clearPicked}>Clear</button>
          </div>
        </div>
      )}

      {current && (
        <div
          className="pg-lb"
          onClick={() => { setLightbox(null); setSlideshow(false); }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="pg-lb-bar" onClick={e => e.stopPropagation()}>
            <span className="pg-lb-name">{(current.name || '').replace(/\.[^.]+$/, '')}</span>
            <div className="pg-lb-acts">
              <button className={`pg-lb-btn ${picked.has(current.id) ? 'is-on' : ''}`} onClick={() => togglePick(current.id)}>✓</button>
              <button className={`pg-lb-btn ${slideshow ? 'is-on' : ''}`} onClick={() => setSlideshow(s => !s)}>{slideshow ? '❚❚' : '▶'}</button>
              <button className="pg-lb-btn" onClick={() => downloadOne(current.id)}>↓</button>
              <button className="pg-lb-btn" onClick={() => { setLightbox(null); setSlideshow(false); }}>✕</button>
            </div>
          </div>
          <button className="pg-lb-nav prev" onClick={e => { e.stopPropagation(); setSlideshow(false); step(-1); }} aria-label="Previous">‹</button>
          <div className="pg-lb-stage" onClick={e => e.stopPropagation()}>
            <img
              key={current.id}
              className="pg-lb-img"
              src={photoUrl(current.id, 'full')}
              alt=""
              decoding="async"
              fetchpriority="high"
            />
          </div>
          <button className="pg-lb-nav next" onClick={e => { e.stopPropagation(); setSlideshow(false); step(1); }} aria-label="Next">›</button>
        </div>
      )}

      {!embedded && <footer className="pg-foot">Powered by iwopo</footer>}
    </div>
  );
}
