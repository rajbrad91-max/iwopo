import { useState, useEffect, useRef, useCallback } from 'react';
import PasswordInput from '../components/PasswordInput';
import './gallery.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useBrandIcon } from '../lib/useBrandIcon';
import { ClientTopBar, ClientFooter } from '../components/ClientLinks';
import { useZoomPan } from '../lib/useZoomPan';

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
// two overlapping people → "show every face in a grid"
const IconPeople = <Icon d={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M16 5.2a3.2 3.2 0 010 5.9" /><path d="M17.5 13.4A5.5 5.5 0 0120.5 18.3" /></>} />;
// magnifier with a person in the lens → "find me / search for my face"
const IconUser = <Icon d={<><circle cx="10" cy="10" r="7.5" /><path d="M15.5 15.5L21 21" /><circle cx="10" cy="8" r="2.2" /><path d="M6.2 13.2a3.9 3.9 0 017.6 0" /></>} />;
// down-arrow into a tray → clearly "download to device"
const IconDownload = <Icon d={<><path d="M12 4v10" /><path d="M8 10.5l4 4 4-4" /><path d="M5 19h14" /></>} />;
// five-point star → "favorite"
const IconStar = <Icon d={<><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></>} />;
// trash can → "delete photo" (admin only)
const IconTrash = <Icon d={<><path d="M4 7h16" /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" /><path d="M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12" /><path d="M10 11v6" /><path d="M14 11v6" /></>} />;
// door with an arrow leaving → "sign out of this gallery"
const IconSignOut = <Icon d={<><path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h9" /></>} />;

export default function PublicGallery({ token, embedded, onBack, preview = null }) {
  /* ⚡ Opened from the all-galleries page, the album's title, cover and theme are already known (`preview`, same shape
     as the album details), so the sign-in shows at once while the full details load (Raj, 2026-11-08). */
  const [meta, setMeta] = useState(preview);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [authing, setAuthing] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [session, setSession] = useState(null);
  useDocumentTitle(meta?.album?.title, { suffix: meta?.vendor?.name });
  useBrandIcon(meta?.vendor?.logo ? `/api/me/logo/${meta.vendor.logo}` : null, !!meta?.vendor?.white_label);

  const [lightbox, setLightbox] = useState(null);
  const [zipBusy, setZipBusy] = useState('');
  const [zipParts, setZipParts] = useState(null);   // a big download's parts: { q, title, parts, got }
  const [activeEvent, setActiveEvent] = useState('all');
  const [matchIds, setMatchIds] = useState(null);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieMsg, setSelfieMsg] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [pickedOnly, setPickedOnly] = useState(false);
  // ⭐ favorites — saved server-side, keyed by the client's email (persists + cross-device)
  const [favs, setFavs] = useState(() => new Set());
  const [favEmail, setFavEmail] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [favEmailInput, setFavEmailInput] = useState('');
  const [favErr, setFavErr] = useState('');
  const [pendingFav, setPendingFav] = useState(null);   // photo id waiting for email before it can be starred
  // admin-only: send selection to studio + delete photos
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [delPhoto, setDelPhoto] = useState(null);       // photo id pending delete-confirmation
  const [delBusy, setDelBusy] = useState(false);
  const [favBulkBusy, setFavBulkBusy] = useState(false); // bulk "Favorite" on the selection
  const [delPicked, setDelPicked] = useState(false);     // bulk delete confirmation open
  const [sendOpen, setSendOpen] = useState(false);       // "Send to studio" note modal
  const [sendNote, setSendNote] = useState('');
  const [sendDone, setSendDone] = useState(false);       // brief "Selection sent" confirmation
  const [slideshow, setSlideshow] = useState(false);
  const [faces, setFaces] = useState([]);           // face circles, most photos first
  const [activeFace, setActiveFace] = useState(null);
  const [findMeOpen, setFindMeOpen] = useState(false);

  const [allFacesOpen, setAllFacesOpen] = useState(false);  // "More" → every face in a grid
  /* 👥 "More" opens a wrapped view of everyone. That is only worth offering when
     some of them are off the edge — on a wide screen with four people it
     promised something the viewer could already see in full.

     Measured rather than counted, because how many circles fit depends on the
     window: six is an overflow on a phone and nothing of the sort on a desktop.
     Re-measured on resize, and whenever the set of faces changes. */
  const facesRef = useRef(null);
  const [facesOverflow, setFacesOverflow] = useState(false);
  useEffect(() => {
    const el = facesRef.current;
    if (!el) return undefined;
    const measure = () => setFacesOverflow(el.scrollWidth > el.clientWidth + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    /* A hidden tab does not run resize callbacks, so a gallery opened in a
       background tab can measure before the strip has been laid out and then
       never correct itself. Re-measure when it comes to the front. */
    document.addEventListener('visibilitychange', measure);
    return () => { ro.disconnect(); document.removeEventListener('visibilitychange', measure); };
  }, [faces, allFacesOpen]);
  /* ⬅️ A new set of faces starts at the BEGINNING — the most-photographed
     people. Switching event left the strip scrolled wherever the browser kept
     it (measured: 4132 px in on "Marco JAggo"), so a client saw a row of 1s and
     only found the sorted order by pressing More and Fewer. */
  useEffect(() => {
    facesRef.current?.scrollTo({ left: 0, top: 0 });
  }, [faces]);
  // The face strip scrolls horizontally with snap points rather than trying to
  // fit an exact number of circles. Measuring "how many fit" was off by a few
  // pixels on narrow screens, so the last circle rendered half-clipped.
  // Scrolling is fine for a handful of people; "More" opens a scrollable grid,
  // which is the only sane way to browse an album with hundreds of faces.
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

  // ⭐ remember the client's email across visits/devices (localStorage, not just session)
  const favEmailKey = `pg-fav-email-${token}`;

  // 🔑 Stay signed in across reloads, back/forward and closing the browser.
  // The view token is valid for 6h server-side, so we keep it for the same
  // window and no longer. Two things can still invalidate it early: the API
  // restarting (view tokens live in memory) and clearing browser data — in both
  // cases the saved session simply fails its check and the password screen
  // returns, which is the behaviour people already expect.
  const sessionKey = `pg-session-${token}`;
  const saveSession = (d) => {
    try {
      window.localStorage?.setItem(sessionKey, JSON.stringify({
        vt: d.vt, role: d.role, exp: Date.now() + 6 * 3600 * 1000,
      }));
    } catch { /* storage unavailable — session stays in memory only */ }
  };

  // On load, try the saved token before showing the password screen. The photo
  // list is re-fetched rather than cached, so a gallery edited since the last
  // visit shows the current photos.
  /* Only a saved session is worth waiting for: without one, the sign-in shows at once (no "Loading…" first). */
  const [restoring, setRestoring] = useState(() => {
    try { const s = JSON.parse(window.localStorage?.getItem(sessionKey) || 'null'); return !!(s?.vt && s.exp > Date.now()); }
    catch { return false; }
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved = null;
      try { saved = JSON.parse(window.localStorage?.getItem(sessionKey) || 'null'); } catch { /* ignore */ }
      if (!saved?.vt || !saved.exp || saved.exp < Date.now()) {
        try { window.localStorage?.removeItem(sessionKey); } catch { /* ignore */ }
        if (!cancelled) setRestoring(false);
        return;
      }
      try {
        const r = await fetch(`${API}/${token}/session?vt=${saved.vt}`);
        if (!r.ok) throw new Error('expired');
        const d = await r.json();
        if (cancelled) return;
        setSession(d);
        if (d.events && d.events.length > 0) setActiveEvent(d.events[0].id);
      } catch {
        try { window.localStorage?.removeItem(sessionKey); } catch { /* ignore */ }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, sessionKey]);

  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem(favEmailKey);
      if (saved) setFavEmail(saved);
    } catch { /* storage unavailable */ }
  }, [favEmailKey]);

  // once we have a session + an email, pull this person's favorites from the server
  useEffect(() => {
    if (!session?.vt || !favEmail) return;
    fetch(`${API}/${token}/favorites?vt=${session.vt}&email=${encodeURIComponent(favEmail)}`)
      .then(r => r.ok ? r.json() : { photo_ids: [] })
      .then(d => setFavs(new Set(d.photo_ids || [])))
      .catch(() => { /* leave favs as-is */ });
  }, [session?.vt, favEmail, token]);

  const theme = session?.theme || meta?.theme || {};
  /* 🖼️ The cover, as theme variables (Raj, 2026-11-08 — speed first): the banner and the sign-in background read
     --pg-cover and --pg-cover-focus (gallery.css), so they need no inline style. The shape follows the screen (about
     2:1 on a laptop, 9:16 on a phone — two crops exist); the size follows its real pixels — 1920 unless a big screen
     needs the full 2500. The sign-in shows it once it has fully arrived (coverShown), with a short fade instead of a
     jump, and the banner after signing in uses the very same file, already in the browser. */
  const coverSrc = (() => {
    if (!meta?.album?.cover || typeof window === 'undefined') return null;
    const tall = window.innerWidth < 700;
    const size = !tall && window.innerWidth * (window.devicePixelRatio || 1) > 2200 ? 'full' : '1920';
    return `${API}/${token}/cover?${tall ? 'v=tall&' : ''}s=${size}`;
  })();
  const coverVars = coverSrc ? { '--pg-cover': `url(${coverSrc})`, '--pg-cover-focus': meta.album.cover_focus || '50% 50%' } : {};
  const [coverShown, setCoverShown] = useState(null);   // the cover address that has fully arrived
  useEffect(() => {
    if (!coverSrc) return undefined;
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setCoverShown(coverSrc); };
    im.src = coverSrc;
    return () => { live = false; };
  }, [coverSrc]);
  const styleVars = {
    '--pg-bg': theme.bg_color || '#fbfbfa',
    '--pg-head': theme.heading_color || '#16161a',
    '--pg-accent': theme.accent_color || '#1f6f6b',
    '--pg-sub': theme.sub_color || '#8a8a8f',
    '--pg-hfont': `'${theme.heading_font || 'Playfair Display'}', serif`,
    '--pg-bfont': `'${theme.body_font || 'Jost'}', sans-serif`,
    ...coverVars,
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
      saveSession(d);
      if (d.events && d.events.length > 0) setActiveEvent(d.events[0].id);
    } catch (e) { setAuthErr(e.message); }
    finally { setAuthing(false); }
  }

  // 🚪 leave the gallery — for a shared or borrowed device
  function signOut() {
    try { window.localStorage?.removeItem(sessionKey); } catch { /* ignore */ }
    setSession(null);
    setActiveFace(null); setMatchIds(null); setSelfieMsg('');
    setPicked(new Set()); setPickedOnly(false);
  }

  // which film failed to decode, so the viewer shows a download instead
  const [vidFailed, setVidFailed] = useState(null);

  /** 90 → "1:30". Films are minutes, so hours only appear when they exist. */
  function fmtDur(sec) {
    const s = Math.round(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
             : `${m}:${String(r).padStart(2, '0')}`;
  }

  const photoUrl = (id, type) => `${API}/${token}/photo/${id}/${type}?vt=${session.vt}`;
  const faceUrl = (clusterId) => `${API}/${token}/face/${clusterId}?vt=${session.vt}`;

  // 🧑‍🤝‍🧑 load the face circles once we're in
  useEffect(() => {
    if (!session) return;
    // faces are scoped to the selected event (Wedding faces don't show under Jaggo)
    const evParam = (activeEvent !== 'all') ? `&event=${activeEvent}` : '';
    fetch(`${API}/${token}/faces?vt=${session.vt}${evParam}`)
      .then(r => r.json())
      .then(d => setFaces(d.faces || []))
      .catch(() => {});
    // switching events clears any active person filter — they may not appear in the new event
    setActiveFace(null); setMatchIds(null);
  }, [session, token, activeEvent]);

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
  /* 📦 A big tab comes in parts of up to 4 GB (backend lib/photoZip.js): ask first, then either download the one Zip
     as before or offer the parts — each its own Zip, so a dropped connection repeats one part, not all of it. */
  async function downloadAll(eventId) {
    const key = eventId || 'all';
    setZipBusy(key);
    const q = eventId && eventId !== 'all' ? `&event=${eventId}` : '';
    try {
      const r = await fetch(`${API}/${token}/download-parts?vt=${session.vt}${q}`);
      const d = r.ok ? await r.json() : null;
      if (d?.parts?.length > 1) {
        const name = session.events.find(ev => String(ev.id) === String(eventId))?.name;
        setZipParts({ q, title: name || 'these photos', parts: d.parts, count: d.count, bytes: d.bytes, got: [] });
        setZipBusy('');
        return;
      }
    } catch { /* the one Zip, as before */ }
    window.location.href = `${API}/${token}/download-all?vt=${session.vt}${q}`;
    setTimeout(() => setZipBusy(''), 4000);
  }
  const gb = (bytes) => `${(bytes / 1e9).toFixed(1)} GB`;   // as drives label it, like the 4 GB parts
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

  // 📩 admin sends the current selection to the studio, with an optional note
  async function sendSelection() {
    if (!picked.size) return;
    setSendBusy(true); setSendMsg('');
    try {
      const r = await fetch(`${API}/${token}/selection?vt=${session.vt}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_ids: [...picked], note: sendNote.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send');
      setSendMsg(`Your selection of ${picked.size} photo${picked.size === 1 ? '' : 's'} was sent to the studio.`);
      // confirm on the button first, then close so the sender sees it landed
      setSendDone(true);
      setTimeout(() => { setSendOpen(false); setSendDone(false); }, 1000);
    } catch (e) { setSendMsg(e.message || 'Could not send selection.'); }
    finally { setSendBusy(false); }
  }

  // 🗑️ admin delete — ask first (irreversible), then delete on confirm
  function askDeletePhoto(id) { setDelPhoto(id); }
  async function confirmDeletePhoto() {
    if (delPhoto == null) return;
    setDelBusy(true);
    try {
      const r = await fetch(`${API}/${token}/photo/${delPhoto}?vt=${session.vt}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Delete failed'); }
      // drop it from local state so the grid updates immediately
      setSession(s => s ? { ...s, photos: (s.photos || []).filter(p => p.id !== delPhoto) } : s);
      setPicked(prev => { const n = new Set(prev); n.delete(delPhoto); persist(n); return n; });
      setFavs(prev => { const n = new Set(prev); n.delete(delPhoto); return n; });
      setLightbox(null);
    } catch (e) { setSendMsg(e.message || 'Could not delete photo.'); }
    finally { setDelBusy(false); setDelPhoto(null); }
  }

  // ⭐ write a favorite to the server (add or remove) for a known email
  async function saveFav(id, email, add) {
    try {
      if (add) {
        await fetch(`${API}/${token}/favorites?vt=${session.vt}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_id: id, email }),
        });
      } else {
        await fetch(`${API}/${token}/favorites/${id}?vt=${session.vt}&email=${encodeURIComponent(email)}`, {
          method: 'DELETE',
        });
      }
    } catch { /* best-effort; UI state already updated optimistically */ }
  }

  // star/unstar a photo. First-ever star with no email → ask for it once.
  function toggleFav(id) {
    if (!favEmail) { setPendingFav(id); setFavErr(''); setFavEmailInput(''); setFavModalOpen(true); return; }
    setFavs(prev => {
      const next = new Set(prev);
      const add = !next.has(id);
      add ? next.add(id) : next.delete(id);
      saveFav(id, favEmail, add);
      return next;
    });
  }

  // ⭐ the "Favorites" button in the event bar. Acts like a light login + toggle:
  //  · view already on  → turn off (show all)
  //  · email known      → reload their saved list from the server, show favorites
  //  · no email yet     → open the email modal (in "view" mode, no pending star)
  async function openFavorites() {
    if (favOnly) { setFavOnly(false); return; }
    if (!favEmail) { setPendingFav(null); setFavErr(''); setFavEmailInput(''); setFavModalOpen(true); return; }
    try {
      const r = await fetch(`${API}/${token}/favorites?vt=${session.vt}&email=${encodeURIComponent(favEmail)}`);
      if (r.ok) { const d = await r.json(); setFavs(new Set(d.photo_ids || [])); }
    } catch { /* keep current favs */ }
    setPickedOnly(false);
    setFavOnly(true);
  }

  // client submitted their email in the modal → remember it, save the pending star
  async function submitFavEmail(e) {
    e?.preventDefault();
    const email = favEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFavErr('Please enter a valid email.'); return; }
    setFavEmail(email);
    try { window.localStorage?.setItem(favEmailKey, email); } catch { /* ignore */ }
    // pull any existing favorites saved under this email (cross-device resume)
    let existing = new Set();
    try {
      const r = await fetch(`${API}/${token}/favorites?vt=${session.vt}&email=${encodeURIComponent(email)}`);
      if (r.ok) { const d = await r.json(); existing = new Set(d.photo_ids || []); }
    } catch { /* ignore */ }
    if (pendingFav != null) {
      // opened by starring — one photo, or a whole selection (array)
      const ids = Array.isArray(pendingFav) ? pendingFav : [pendingFav];
      for (const id of ids) { existing.add(id); saveFav(id, email, true); }
    } else {
      // opened via the "Favorites" button → switch into favorites view (resume list)
      setPickedOnly(false); setFavOnly(true);
    }
    setFavs(existing);
    setFavModalOpen(false);
    setPendingFav(null);
  }

  // ⭐ favorite every photo in the current selection (asks for email once if needed)
  async function favoritePicked() {
    if (!picked.size) return;
    const ids = [...picked];
    if (!favEmail) { setPendingFav(ids); setFavErr(''); setFavEmailInput(''); setFavModalOpen(true); return; }
    setFavBulkBusy(true);
    try {
      const next = new Set(favs);
      for (const id of ids) { if (!next.has(id)) { next.add(id); await saveFav(id, favEmail, true); } }
      setFavs(next);
      setSendMsg(`${ids.length} photo${ids.length === 1 ? '' : 's'} added to your favorites.`);
    } finally { setFavBulkBusy(false); }
  }

  // 🗑️ delete every photo in the current selection (admin only, confirmed first)
  async function confirmDeletePicked() {
    const ids = [...picked];
    if (!ids.length) { setDelPicked(false); return; }
    setDelBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          const r = await fetch(`${API}/${token}/photo/${id}?vt=${session.vt}`, { method: 'DELETE' });
          if (r.ok) ok++;
        } catch { /* skip this one */ }
      }
      const gone = new Set(ids);
      setSession(s => s ? { ...s, photos: (s.photos || []).filter(p => !gone.has(p.id)) } : s);
      setFavs(prev => new Set([...prev].filter(id => !gone.has(id))));
      clearPicked();
      setSendMsg(`${ok} photo${ok === 1 ? '' : 's'} deleted.`);
    } finally { setDelBusy(false); setDelPicked(false); }
  }

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
  if (activeEvent !== 'all') photos = photos.filter(p => String(p.event_id) === String(activeEvent));
  if (matchIds !== null) photos = photos.filter(p => matchIds.includes(p.id));
  if (pickedOnly) photos = photos.filter(p => picked.has(p.id));
  if (favOnly) photos = photos.filter(p => favs.has(p.id));

  const dirRef = useRef(1);   // ⏭️ the way the viewer last moved — what to make ready first
  const step = useCallback((dir) => {
    dirRef.current = dir < 0 ? -1 : 1;
    setLightbox(i => {
      if (i === null) return null;
      const n = photos.length;
      return n ? (i + dir + n) % n : null;
    });
  }, [photos.length]);
  // 🔍 pinch / double-tap / wheel zoom of the photo on screen — never a film, never a download (lib/useZoomPan.js)
  const zoom = useZoomPan(lightbox, lightbox !== null && photos[lightbox]?.kind !== 'video');

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

  // browser Back closes the full-screen photo instead of leaving the gallery.
  // On open we push a history entry; Back pops it and closes the viewer. Closing
  // any other way goes back once to consume that entry, keeping history clean.
  const lbHistRef = useRef(false);
  const lightboxOpen = lightbox !== null;
  useEffect(() => {
    if (!lightboxOpen) return;
    window.history.pushState({ pgLightbox: true }, '');
    lbHistRef.current = true;
    const onPop = () => { lbHistRef.current = false; setLightbox(null); setSlideshow(false); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (lbHistRef.current) { lbHistRef.current = false; window.history.back(); }
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!slideshow || lightbox === null) return;
    /* A film is not a slide. Three and a half seconds into a five minute
       wedding film the slideshow would move on, which is worse than not
       advancing at all — so it pauses while a film is open and resumes when
       the viewer moves past it. */
    if (photos[lightbox]?.kind === 'video') return undefined;
    const t = setInterval(() => step(1), 3500);
    return () => clearInterval(t);
  }, [slideshow, lightbox, step, photos]);

  /* ⏭️ Made ready around the photo being viewed (Raj, 2026-11-07): the next 4 in the direction of travel and the
     2 behind, fetched AND decoded, so a swipe shows a finished picture. The images are held here so the browser
     does not throw them away before they are needed; the ring wraps like the viewer does. */
  const warm = useRef(new Map());
  useEffect(() => {
    if (lightbox === null || !session) return;
    const n = photos.length;
    if (!n) return;
    const d = dirRef.current;
    const ahead = [1, 2, 3, 4].map(k => lightbox + d * k).concat([1, 2].map(k => lightbox - d * k));
    const keep = new Map();
    for (const raw of ahead) {
      const p = photos[((raw % n) + n) % n];
      if (!p || p.kind === 'video') continue;
      const url = photoUrl(p.id, 'full');
      let im = warm.current.get(url);
      if (!im) { im = new Image(); im.decoding = 'async'; im.src = url; im.decode?.().catch(() => { /* shown normally if this fails */ }); }
      keep.set(url, im);
    }
    warm.current = keep;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- preloads around the photo being viewed; the photo list is rebuilt on every render
  }, [lightbox, session]);

  /* 🖼️ No black screen (Raj, 2026-11-07): the grid's thumbnail is already on the phone, so it shows at once at the
     photo's full on-screen size, and the sharp 2200px version fades in exactly over it when it has arrived.
     The size comes from the thumbnail's own shape, fitted to the screen, and is set as the image's width and
     height (attributes, not styles); it follows the screen when it turns or resizes. */
  const [fit, setFit] = useState(null);      // { id, r, w, h }
  const [sharp, setSharp] = useState(null);  // id of the photo whose sharp version is on screen
  const fitTo = useCallback((id, r) => {
    const w = Math.min(window.innerWidth * 0.98, window.innerHeight * 0.96 * r);
    setFit({ id, r, w: Math.round(w), h: Math.round(w / r) });
  }, []);
  useEffect(() => {
    if (!fit) return undefined;
    const onResize = () => fitTo(fit.id, fit.r);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit, fitTo]);

  // 👆 swipe the full-screen photo: left/right to move, down to close
  const touch = useRef(null);
  const SWIPE_MIN = 45;                       // px before it counts as a swipe
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (zoom.busy()) { touch.current = null; return; }   // zoomed or pinching: the zoom has the gesture
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
  // hold the password screen back while a saved session is being checked, so a
  // returning visitor doesn't see the login flash past
  if (restoring && !session) return <div className="pg-wrap" style={styleVars}><div className="pg-state">Loading…</div></div>;

  const hasCover = !!meta.album.cover;   // its pictures arrive through coverVars, above
  const links = embedded ? null : meta.vendor?.links;   // 🔗 the vendor's optional links (components/ClientLinks.jsx)

  if (!session) {
    const m = meta.album;
    return (
      <div className="pg-wrap pg-gatewrap" style={styleVars}>
        {hasCover && <div className={`pg-gate-bg${coverShown === coverSrc ? ' is-shown' : ''}`} />}
        {links && <ClientTopBar links={links} brand={meta.vendor?.name} variant="gate" />}
        <div className="pg-gate">
          {links?.private_url ? <a className="pg-eyebrow pg-eyebrow-link" href={links.private_url}>{theme.title_text || 'Private gallery'}</a> : <div className="pg-eyebrow">{theme.title_text || 'Private gallery'}</div>}
          <h1 className="pg-gate-title">{m.title}</h1>
          <form onSubmit={unlock} className="pg-gate-form">
            <PasswordInput className="pg-input" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            <button className="pg-btn" type="submit" disabled={authing}>{authing ? 'Checking…' : 'Enter gallery'}</button>
          </form>
          {authErr && <div className="pg-err">{authErr}</div>}
        </div>
      </div>
    );
  }

  const current = lightbox !== null ? photos[lightbox] : null;
  const isAdmin = session?.role === 'admin';   // admin-password holder → selection + delete tools
  const nPicked = picked.size;
  // favorites are per-event: count only the stars within the currently selected event
  // event tabs stay visible during favorites view too, so the client can switch
  // between each event's own favorites (Jaggo vs Wedding are independent lists).
  /* 🗂️ …and while a person (or a selfie match) is showing. Hiding the tabs
     then left a client unsure which folder they were in, and with no way to
     another one but Back (Raj, 2026-10-09). The selected tab stays underlined;
     choosing another one shows that folder and its own people — a person's
     circle belongs to one tab, so the filter is cleared on the way. */
  const showScenes = session.events.length > 0 && !pickedOnly;

  const nVids = allPhotos.filter(p => p.kind === 'video').length;
  const nPics = allPhotos.length - nVids;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const coverMeta = [nPics && plural(nPics, 'photo'), nVids && plural(nVids, 'video')]
    .filter(Boolean).join(' · ') || 'Nothing here yet';

  return (
    <div className="pg-wrap" style={styleVars}>

      {links && <ClientTopBar links={links} brand={meta.vendor?.name} />}
      <section className={`pg-cover ${hasCover ? '' : 'is-plain'}`}>
        {hasCover && <div className="pg-cover-img" />}
        {/* 🚪 sign out — sits over the cover, top right. Sessions now persist
            across visits, so there has to be a deliberate way to leave one on a
            shared or borrowed device. */}
        <button className="pg-signout" onClick={signOut} title="Sign out of this gallery">
          {IconSignOut}
          <span>Sign out</span>
        </button>
        <div className="pg-cover-inner">
          {links?.private_url ? <a className="pg-eyebrow pg-eyebrow-link" href={links.private_url}>{theme.title_text || 'Private gallery'}</a> : <div className="pg-eyebrow">{theme.title_text || 'Private gallery'}</div>}
          <h1 className="pg-cover-title">{session.title}</h1>
          {/* The first thing a couple reads. A gallery holding one film and no
              pictures announced itself as "1 photos", which is both wrong and
              the wrong plural. Say what is actually in it. */}
          <div className="pg-cover-meta">{coverMeta}</div>
        </div>
        <button className="pg-scroll" onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <span>{nPics && nVids ? 'View gallery' : nVids ? 'View videos' : 'View photos'}</span>
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
            <button className="pg-modal-x" onClick={() => setFindMeOpen(false)} title="Close">✕</button>
            <h2 className="pg-modal-title">Find your photos</h2>
            <p className="pg-modal-sub">We'll match your face against this gallery. Your photo isn't stored.</p>
            <div className="pg-modal-acts">
              <button className="pg-btn" onClick={() => cameraInput.current?.click()}>Take a selfie</button>
              <button className="pg-btn is-ghost" onClick={() => selfieInput.current?.click()}>Upload a photo</button>
            </div>
          </div>
        </div>
      )}

      {/* 📦 a big download, in parts */}
      {zipParts && (
        <div className="pg-modal" onClick={() => setZipParts(null)}>
          <div className="pg-modal-card" onClick={e => e.stopPropagation()}>
            <button className="pg-modal-x" onClick={() => setZipParts(null)} title="Close">✕</button>
            <h2 className="pg-modal-title">Download in {zipParts.parts.length} parts</h2>
            <p className="pg-modal-sub">{zipParts.title}: {zipParts.count} photos, {gb(zipParts.bytes)}. Each part is its own Zip file — if one is interrupted, only that part needs downloading again.</p>
            <div className="pg-modal-acts">
              {zipParts.parts.map(p => (
                <a key={p.part} className={`pg-btn is-ghost pg-zip-part${zipParts.got.includes(p.part) ? ' is-got' : ''}`}
                  href={`${API}/${token}/download-all?vt=${session.vt}${zipParts.q}&part=${p.part}`}
                  onClick={() => setZipParts(z => ({ ...z, got: [...new Set([...z.got, p.part])] }))}>
                  <span>{zipParts.got.includes(p.part) ? '✓ ' : ''}Part {p.part}</span>
                  <span className="pg-zip-part-meta">{p.count} photos · {gb(p.bytes)}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ⭐ email-once modal — asked the first time a client stars a photo */}
      {favModalOpen && (
        <div className="pg-modal" onClick={() => { setFavModalOpen(false); setPendingFav(null); }}>
          <form className="pg-modal-card" onClick={e => e.stopPropagation()} onSubmit={submitFavEmail}>
            <button type="button" className="pg-modal-x" onClick={() => { setFavModalOpen(false); setPendingFav(null); }} title="Close">✕</button>
            <h2 className="pg-modal-title">{pendingFav != null ? 'Save your favorites' : 'View your favorites'}</h2>
            <p className="pg-modal-sub">Enter your email to {pendingFav != null ? 'save your favorites' : 'see the favorites you saved'} — your list is kept safe and follows you on any device.</p>
            <input
              className="pg-input"
              type="email"
              placeholder="you@email.com"
              value={favEmailInput}
              onChange={e => { setFavEmailInput(e.target.value); setFavErr(''); }}
              autoFocus
            />
            {favErr && <div className="pg-err">{favErr}</div>}
            <div className="pg-modal-acts">
              <button className="pg-btn" type="submit">Save &amp; continue</button>
            </div>
          </form>
        </div>
      )}

      {/* 🗑️ delete confirmation (admin) — irreversible, so always confirm */}
      {delPhoto != null && (
        <div className="pg-modal" onClick={() => !delBusy && setDelPhoto(null)}>
          <div className="pg-modal-card" onClick={e => e.stopPropagation()}>
            <button type="button" className="pg-modal-x" onClick={() => !delBusy && setDelPhoto(null)} title="Close">✕</button>
            <h2 className="pg-modal-title">Delete this photo?</h2>
            <p className="pg-modal-sub">This permanently removes the photo from the gallery. It can't be undone.</p>
            <div className="pg-modal-acts">
              <button className="pg-btn pg-btn-danger" onClick={confirmDeletePhoto} disabled={delBusy}>
                {delBusy ? 'Deleting…' : 'Delete photo'}
              </button>
              <button className="pg-btn is-ghost" onClick={() => setDelPhoto(null)} disabled={delBusy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 🗑️ bulk delete confirmation (admin) */}
      {delPicked && (
        <div className="pg-modal" onClick={() => !delBusy && setDelPicked(false)}>
          <div className="pg-modal-card" onClick={e => e.stopPropagation()}>
            <button type="button" className="pg-modal-x" onClick={() => !delBusy && setDelPicked(false)} title="Close">✕</button>
            <h2 className="pg-modal-title">Delete {nPicked} photo{nPicked === 1 ? '' : 's'}?</h2>
            <p className="pg-modal-sub">This permanently removes the selected photo{nPicked === 1 ? '' : 's'} from the gallery. It can't be undone.</p>
            <div className="pg-modal-acts">
              <button className="pg-btn pg-btn-danger" onClick={confirmDeletePicked} disabled={delBusy}>
                {delBusy ? 'Deleting…' : `Delete ${nPicked} photo${nPicked === 1 ? '' : 's'}`}
              </button>
              <button className="pg-btn is-ghost" onClick={() => setDelPicked(false)} disabled={delBusy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 📩 send selection to studio — with an optional note (admin) */}
      {sendOpen && (
        <div className="pg-modal" onClick={() => !sendBusy && !sendDone && setSendOpen(false)}>
          <form className="pg-modal-card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); sendSelection(); }}>
            <button type="button" className="pg-modal-x" onClick={() => !sendBusy && !sendDone && setSendOpen(false)} title="Close">✕</button>
            <h2 className="pg-modal-title">Send {nPicked} photo{nPicked === 1 ? '' : 's'} to the studio</h2>
            <p className="pg-modal-sub">Add a note if there's anything the studio should know — retouching requests, album order, or anything else.</p>
            <textarea
              className="pg-input pg-textarea"
              placeholder="Notes for the studio (optional)"
              value={sendNote}
              onChange={e => setSendNote(e.target.value)}
              rows={4}
              autoFocus
            />
            <div className="pg-modal-acts">
              <button className={`pg-btn ${sendDone ? 'is-done' : ''}`} type="submit" disabled={sendBusy || sendDone}>
                {sendDone ? '✓ Selection sent' : sendBusy ? 'Sending…' : 'Send selection'}
              </button>
              <button className="pg-btn is-ghost" type="button" onClick={() => setSendOpen(false)} disabled={sendBusy || sendDone}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* 👥 everyone in this gallery — expands inline under the strip rather than
          as a popup, so the faces stay in place with the gallery behind them.
          The list itself scrolls, so hundreds of people stay manageable. */}
      <div ref={gridRef} />

      {selfieMsg && <div className="pg-note">{selfieMsg}</div>}

      {(onBack || session.events.length > 0) && (
        <nav className="pg-scenes">
          {onBack && <button className="pg-back" onClick={onBack}>← Back</button>}
          {showScenes && session.events.map(ev => {
            const evCount = allPhotos.filter(p => String(p.event_id) === String(ev.id)).length;
            /* An empty folder is a promise of something that is not there. The
               Videos folder is created the moment a vendor uploads their first
               film, so an album whose films were all removed would otherwise
               keep offering a tab with nothing behind it. */
            if (evCount === 0) return null;
            return (
              <button
                key={ev.id}
                className={`pg-scene ${String(activeEvent) === String(ev.id) ? 'is-on' : ''}`}
                onClick={() => setActiveEvent(ev.id)}
                title={`${evCount} photo${evCount === 1 ? '' : 's'} in ${ev.name}`}
              >{ev.name}</button>
            );
          })}
          {session.events.length > 0 && (
            <div className="pg-scene-acts">
              <button
                className={`pg-scene-fav ${favOnly ? 'is-on' : ''}`}
                onClick={openFavorites}
                title={favOnly ? 'Showing your favorites — click to show all' : 'View your favorites (enter your email)'}
              >Favorites</button>
              {/* 📥 only a tab with photos offers a Zip of them */}
              {(String(activeEvent) === 'all' ? allPhotos.length > 0 : allPhotos.some(p => String(p.event_id) === String(activeEvent))) && (
                <button className="pg-scene-dl" onClick={() => downloadAll(activeEvent)} disabled={zipBusy === activeEvent} title="Download these photos in a Zip file">
                  {zipBusy === activeEvent ? 'Preparing…' : `Download ${session.events.find(ev => String(ev.id) === String(activeEvent))?.name || 'event'}`}
                </button>
              )}
            </div>
          )}
        </nav>
      )}

      {/* bar 2 — the people in this gallery */}
      {/* Face search is a photograph feature. On the Videos folder it offered
          "Find me" against a set with no faces in it, and sat there saying
          "Finding faces…" over a single film. */}
      {(faces.length > 0 || session.faceReady) && !photos.every(p => p.kind === 'video') && (
        <div className="pg-people">
          <div ref={facesRef} className={`pg-faces ${allFacesOpen ? 'is-expanded' : ''}`}>
            {faces.map(f => (
              <button
                key={f.id}
                className={`pg-face ${activeFace === f.id ? 'is-on' : ''}`}
                onClick={() => pickFace(f)}
                title={`Show only this person's photos (${f.count})`}
              >
                <img src={faceUrl(f.id)} alt="" loading="lazy" />
                <span className="pg-face-n">{f.count}</span>
              </button>
            ))}
            {faces.length === 0 && <span className="pg-faces-empty">Finding faces…</span>}
          </div>

          {/* action circles — same size as faces, pinned outside the scroll strip
              so they stay reachable without scrolling to the end */}
          <div className="pg-people-acts">
            {/* Shown whenever the grid is filtered — by tapping a face OR by a
                selfie search. A selfie sets matchIds without activeFace, so
                checking activeFace alone left people stuck with no way back. */}
            {(activeFace || matchIds !== null) && (
              <button className="pg-facebtn is-on" onClick={clearFace} title="Show all photos">
                <span className="pg-facebtn-ic">{IconClose}</span>
                <span className="pg-facebtn-lbl">Show all</span>
              </button>
            )}
            {/* Hidden when everyone already fits — but kept while expanded, or
                there would be no way back to the strip. */}
            {(facesOverflow || allFacesOpen) && (
              <button
                className={`pg-facebtn ${allFacesOpen ? 'is-on' : ''}`}
                onClick={() => setAllFacesOpen(v => !v)}
                title={allFacesOpen ? 'Show fewer faces' : `See everyone in this gallery (${faces.length})`}
              >
                <span className="pg-facebtn-ic">{IconPeople}</span>
                <span className="pg-facebtn-lbl">{allFacesOpen ? 'Fewer' : 'More'}</span>
              </button>
            )}
            <button className="pg-facebtn" onClick={() => setFindMeOpen(true)} disabled={selfieBusy} title="Find photos of yourself">
              <span className="pg-facebtn-ic">{IconUser}</span>
              <span className="pg-facebtn-lbl">{selfieBusy ? '…' : 'Find me'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="pg-grid">
        {photos.length === 0 ? (
          <div className="pg-state">
            {pickedOnly ? 'Nothing selected yet.'
              : favOnly ? 'No favorites yet.'
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
              /* a film uploaded in a format the sender's own browser could not
                 decode arrives with no poster; the tile falls back to a plain
                 dark card rather than a broken-image icon */
              onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            {p.kind === 'video' && (
              <>
                <span className="pg-vid-badge">
                  <span className="pg-vid-play">▶</span>
                  {p.duration_s ? <span className="pg-vid-time">{fmtDur(p.duration_s)}</span> : null}
                </span>
                {/* Photographs are looked at; a film is chosen. A couple with
                    three of them needs to know which is the ceremony and which
                    the speeches, and a row of identical play badges does not
                    say. The extension is dropped — it is ours, not theirs. */}
                <figcaption className="pg-vid-name" title={p.name || ''}>
                  {String(p.name || '').replace(/\.[^.]+$/, '')}
                </figcaption>
              </>
            )}
            {/* Selection is for choosing which photographs go in an album, and
                a film is not one of them. The tick appeared on films and a
                couple could pick one, which then arrived in the vendor's
                selection list as though it were a print. */}
            {p.kind !== 'video' && (
              <button
                className="pg-check"
                onClick={e => { e.stopPropagation(); togglePick(p.id); }}
                aria-label={picked.has(p.id) ? 'Deselect photo' : 'Select photo'}
                title={picked.has(p.id) ? 'Deselect photo' : 'Select photo'}
              >✓</button>
            )}
          </figure>
        ))}
      </div>

      {/* Films counted apart — a gallery holding one film and no pictures
          told the couple it had one image. */}
      {photos.length > 0 && (
        <div className="pg-grid-end">No more to display. ({coverMeta})</div>
      )}

      {nPicked > 0 && (
        <div className="pg-selbar">
          <span className="pg-selbar-n">{nPicked} selected</span>
          <div className="pg-selbar-acts">
            <button className="pg-selbar-btn" onClick={() => setPickedOnly(v => !v)}>
              {pickedOnly ? 'Show all' : 'View selected'}
            </button>
            <button className="pg-selbar-btn" onClick={favoritePicked} disabled={favBulkBusy}>
              {favBulkBusy ? 'Saving…' : 'Favorite'}
            </button>
            <button className="pg-selbar-btn" onClick={downloadPicked} disabled={zipBusy === 'picked'}>
              {zipBusy === 'picked' ? 'Downloading…' : 'Download'}
            </button>
            {isAdmin && (
              <button className="pg-selbar-btn is-send" onClick={() => { setSendNote(''); setSendOpen(true); }} disabled={sendBusy}>
                Send to studio
              </button>
            )}
            {isAdmin && (
              <button className="pg-selbar-btn is-danger" onClick={() => setDelPicked(true)} disabled={delBusy}>
                Delete
              </button>
            )}
            <button className="pg-selbar-btn is-quiet" onClick={clearPicked}>Clear</button>
          </div>
        </div>
      )}
      {sendMsg && <div className="pg-note">{sendMsg}</div>}

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
              <button className={`pg-lb-btn pg-lb-star ${favs.has(current.id) ? 'is-on' : ''}`} onClick={() => toggleFav(current.id)} title={favs.has(current.id) ? 'Remove from favorites' : 'Add to favorites'}>{IconStar}</button>
              {isAdmin && <button className={`pg-lb-btn ${picked.has(current.id) ? 'is-on' : ''}`} onClick={() => togglePick(current.id)} title={picked.has(current.id) ? 'Unselect photo' : 'Select photo'}>✓</button>}
              <button className={`pg-lb-btn ${slideshow ? 'is-on' : ''}`} onClick={() => setSlideshow(s => !s)} title={slideshow ? 'Pause slideshow' : 'Play slideshow'}>{slideshow ? '❚❚' : '▶'}</button>
              <button className="pg-lb-btn" onClick={() => downloadOne(current.id)} title="Download photo">{IconDownload}</button>
              {isAdmin && <button className="pg-lb-btn pg-lb-del" onClick={() => askDeletePhoto(current.id)} title="Delete this photo from the gallery">{IconTrash}</button>}
              <button className="pg-lb-btn" onClick={() => { setLightbox(null); setSlideshow(false); }} title="Close">✕</button>
            </div>
          </div>
          <button className="pg-lb-nav prev" onClick={e => { e.stopPropagation(); setSlideshow(false); step(-1); }} aria-label="Previous" title="Previous photo">‹</button>
          <div className={`pg-lb-stage${current.kind === 'video' ? '' : ' is-photo'}${zoom.zoomed ? ' is-zoomed' : ''}`} ref={zoom.stageRef} onClick={e => e.stopPropagation()}>
            {current.kind === 'video' ? (
              /* Whether a film plays is a property of the VIEWER, not the file.
                 Safari decodes HEVC and Chrome on Windows does not, so the same
                 upload plays for the couple and fails for a guest. Rather than
                 look broken, a failure becomes the download it always was. */
              vidFailed === current.id ? (
                <div className="pg-vid-fallback">
                  <div className="pg-vid-fallback-icon">🎬</div>
                  <h3>This film can&apos;t play in your browser</h3>
                  <p>It&apos;s in a format your browser doesn&apos;t support. Download it to watch.</p>
                  <a className="pg-vid-dl" href={`${API}/${token}/download/${current.id}?vt=${session.vt}`}>
                    Download {current.name || 'film'}
                  </a>
                </div>
              ) : (
                <video
                  key={current.id}
                  className="pg-lb-video"
                  src={photoUrl(current.id, 'orig')}
                  poster={photoUrl(current.id, 'full')}
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => setVidFailed(current.id)}
                />
              )
            ) : (
              <div className="pg-lb-pic" key={current.id} ref={zoom.picRef}>
                <img
                  className="pg-lb-soft"
                  src={photoUrl(current.id, 'thumb')}
                  alt=""
                  aria-hidden="true"
                  onLoad={e => fitTo(current.id, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
                  {...(fit?.id === current.id ? { width: fit.w, height: fit.h } : {})}
                />
                <img
                  className={`pg-lb-img pg-lb-sharp${sharp === current.id ? ' is-ready' : ''}`}
                  src={photoUrl(current.id, 'full')}
                  alt=""
                  decoding="async"
                  fetchpriority="high"
                  onLoad={() => setSharp(current.id)}
                />
              </div>
            )}
          </div>
          <button className="pg-lb-nav next" onClick={e => { e.stopPropagation(); setSlideshow(false); step(1); }} aria-label="Next" title="Next photo">›</button>
        </div>
      )}

      {links && <ClientFooter links={links} />}
      {!embedded && !meta?.vendor?.white_label && <footer className="pg-foot">Powered by iwopo</footer>}
    </div>
  );
}
