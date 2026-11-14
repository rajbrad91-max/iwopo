/**
 * 📸 Galleries: the list of albums, creating one, and the gallery look.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef, Fragment } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api } from '../../lib/api';
import { clientBase } from '../../lib/clientBase';
import GalleryDownloadLog from '../../components/GalleryDownloadLog';
import { MailIcon, ChartIcon, GearIcon, DownloadedMark } from '../../components/TileIcons';
import { AlbumDetail } from './AlbumDetail';

// 🎯 Cover focal-point picker: click or drag to set where the cover centers.
// The same point is used on desktop AND mobile, so covers frame well at any aspect ratio.
function FocalPicker({ src, focus, onFocus, view }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const [fx, fy] = (focus || '50% 50%').split(' ').map(s => parseFloat(s));

  function setFromEvent(e) {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    let x = ((pt.clientX - rect.left) / rect.width) * 100;
    let y = ((pt.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    onFocus(`${Math.round(x)}% ${Math.round(y)}%`);
  }
  function onDown(e) { dragging.current = true; setFromEvent(e); }
  function onMove(e) { if (dragging.current) { e.preventDefault(); setFromEvent(e); } }
  function onUp() { dragging.current = false; }

  return (
    <div className="fp-frame-wrap">
      <div
        ref={ref}
        className={`fp-frame ${view === 'mobile' ? 'fp-mobile' : 'fp-desktop'}`}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        style={{ backgroundImage: `url(${src})`, backgroundPosition: `${fx}% ${fy}%` }}
      >
        <div className="fp-dot" style={{ left: `${fx}%`, top: `${fy}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {string} [kind]  'gallery' (default) or 'liveshoot'.
 *
 * 🎥 One component for both, because a live shoot IS an album — same upload,
 * same face detection, same covers, same expiry. Only the delivery differs,
 * and that happens on the public page. Forking this into a second view would
 * mean every future gallery fix needing to be made twice.
 */
export function GalleriesView({ routeAlbum, onOpenAlbum, kind = 'gallery', shortcuts = false, insights = false }) {
  const dialog = useDialog();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  // album open state is driven by the URL (routeAlbum): open = set it in the URL,
  // close = clear it. This keeps the browser Back button in sync with the view.
  const open = routeAlbum ? Number(routeAlbum) : null;
  const setOpen = (id) => onOpenAlbum(id);
  const [showNew, setShowNew] = useState(false);
  const [edit, setEdit] = useState(null); // album being edited
  const [bookings, setBookings] = useState([]);
  const [pwPrefix, setPwPrefix] = useState('');
  const [spwPrefix, setSpwPrefix] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverFocus, setCoverFocus] = useState('50% 50%'); // "X% Y%" focal point for cover framing
  const [focusView, setFocusView] = useState('desktop'); // preview aspect toggle
  const [showSettings, setShowSettings] = useState(false);
  const [showPw, setShowPw] = useState({ guest: false, admin: false });
  /* true where a password exists but was set before readable copies were kept,
     so the box is blank for a reason the vendor should be told */
  const [pwHidden, setPwHidden] = useState({ guest: false, admin: false });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [galleryToken, setGalleryToken] = useState('');
  const [copiedGallery, setCopiedGallery] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);   // 📋 the Send Instructions text, copied
  const [theme, setTheme] = useState({});
  const [themeSaved, setThemeSaved] = useState(false);
  const GAL_FONTS = ['Cormorant Garamond', 'Playfair Display', 'Jost', 'Montserrat', 'Poppins', 'Lora', 'Raleway'];
  // 🎨 curated looks — professionally paired fonts + palettes
  const GAL_PRESETS = [
    { id: 'editorial', name: 'Editorial', note: 'Light and airy. Photos do the talking.',
      t: { heading_font: 'Playfair Display', body_font: 'Jost', bg_color: '#fbfbfa', heading_color: '#16161a', accent_color: '#1f6f6b', sub_color: '#8a8a8f' } },
    { id: 'noir', name: 'Noir', note: 'Deep charcoal. Makes colour glow.',
      t: { heading_font: 'Cormorant Garamond', body_font: 'Jost', bg_color: '#0e0e11', heading_color: '#f2f2f0', accent_color: '#c9a227', sub_color: '#8b8b93' } },
    { id: 'blush', name: 'Blush', note: 'Warm white, muted rose. Romantic.',
      t: { heading_font: 'Cormorant Garamond', body_font: 'Montserrat', bg_color: '#faf6f4', heading_color: '#2b2320', accent_color: '#b4756b', sub_color: '#9c8b85' } },
    { id: 'studio', name: 'Studio', note: 'Neutral grey. Tight and modern.',
      t: { heading_font: 'Raleway', body_font: 'Jost', bg_color: '#f4f4f5', heading_color: '#18181b', accent_color: '#3f3f46', sub_color: '#8e8e96' } },
    { id: 'sage', name: 'Sage', note: 'Cool green-grey. Calm and natural.',
      t: { heading_font: 'Lora', body_font: 'Jost', bg_color: '#f3f5f2', heading_color: '#1f2620', accent_color: '#5c7a63', sub_color: '#8b968c' } },
    { id: 'midnight', name: 'Midnight', note: 'Deep navy, cool accent. Confident.',
      t: { heading_font: 'Playfair Display', body_font: 'Poppins', bg_color: '#0d1220', heading_color: '#eef1f7', accent_color: '#7aa2f7', sub_color: '#7d879c' } },
  ];
  const applyPreset = (p) => setTheme(t => ({ ...t, ...p.t }));
  const presetActive = (p) => ['heading_font', 'body_font', 'bg_color', 'heading_color', 'accent_color', 'sub_color']
    .every(k => (theme[k] || '').toLowerCase() === p.t[k].toLowerCase());
  function setT(k, val) { setTheme(t => ({ ...t, [k]: val })); }
  async function saveTheme() {
    try { await api.saveGalleryTheme(theme); setThemeSaved(true); setTimeout(() => setThemeSaved(false), 1800); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  /* 📋 copy the whole instructions text — as shown, edits included (Raj, 2026-11-09). If the browser refuses, the
     text is right there in the box to select by hand. */
  function copyInstructions() {
    navigator.clipboard.writeText(sendModal.body).then(() => {
      setCopiedMsg(true); setTimeout(() => setCopiedMsg(false), 2000);
    }).catch(() => setSendMsg('⚠️ Could not copy — select the text above and copy it'));
  }
  function copyGalleryUrl() {
    const url = `${clientBase()}/gallery/${galleryToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGallery(true); setTimeout(() => setCopiedGallery(false), 2000);
    }).catch(() => { dialog.prompt('Select and copy this link:', url, { title: 'Your full gallery link', readOnly: true, okLabel: 'Done' }); });
  }

  function copyUrl(a) {
    const url = `${clientBase()}/g/${a.public_token}`;   // the vendor's own address, like every client link
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(() => { dialog.prompt('Select and copy this link:', url, { title: 'Gallery link', readOnly: true, okLabel: 'Done' }); });
  }
  const [sendModal, setSendModal] = useState(null); // { album, email, body, editing }
  const [logFor, setLogFor] = useState(null);       // 📊 the gallery whose download log is open (Studio)
  const [sendMsg, setSendMsg] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState([]);
  const [f, setF] = useState(emptyAlbum());
  const [msg, setMsg] = useState('');

  // 🗑️ bin click: enter select mode → delete when items checked → exit when none
  function onBinClick() {
    if (!selectMode) { setSelectMode(true); return; }
    if (checked.length) { deleteChecked(); return; }
    setSelectMode(false);
  }
  async function deleteChecked() {
    if (!checked.length) return;
    if (!await dialog.confirm(`${checked.length} album${checked.length === 1 ? '' : 's'} and every photo inside will be deleted. This cannot be undone.`, { title: 'Delete albums?', okLabel: 'Delete' })) return;
    /* Each album is deleted on its own terms. The loop used to abort on the
       first failure, so a request that timed out on album one left album two
       untouched — and the vendor was told something went wrong without being
       told which, or that anything had succeeded. */
    const failed = [];
    for (const id of checked) {
      try { await api.deleteAlbum(id); }
      catch (e) { failed.push(e.message || 'failed'); }
    }
    setChecked([]); setSelectMode(false); load();
    if (failed.length) {
      dialog.alert(`${failed.length} of ${checked.length} could not be deleted: ${failed[0]}`, { error: true });
    }
  }
  function toggleCheck(id, e) {
    e.stopPropagation();
    setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  function emptyAlbum() {
    return { title: '', category: '', client_email: '', guest_password: '', admin_password: '' };
  }

  useEffect(() => {
    load();
    api.albumBookingOptions().then(d => setBookings(d.bookings || [])).catch(() => {});
    api.albumSettings().then(d => {
      const s = d.settings || {};
      setPwPrefix(s.pw_prefix || ''); setSpwPrefix(s.spw_prefix || '');
      setGalleryToken(s.gallery_token || '');
    }).catch(() => {});
    api.galleryTheme().then(d => setTheme(d.theme || {})).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  }, []);
  function load() { setLoading(true); api.albums(kind).then(d => setAlbums(d.albums || [])).catch(() => {}).finally(() => setLoading(false)); }

  // 🤖 auto password = prefix + last-4 of phone
  function last4(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : digits;
  }
  function pickBooking(id) {
    const b = bookings.find(x => String(x.id) === String(id));
    if (!b) return;
    const tail = last4(b.phone);
    setF(s => ({
      ...s,
      title: b.name,
      client_email: b.email || '',
      /* ⚠️ only where nothing has been typed — picking a booking must not
         wipe a password already set for this gallery */
      guest_password: s.guest_password ? s.guest_password : (tail ? defaultPw('guest', tail) : ''),
      admin_password: s.admin_password ? s.admin_password : (tail ? defaultPw('admin', tail) : ''),
    }));
  }

  /* The default password for one role. ⚠️ If the two default prefixes are the
     same — including both blank — guest and admin would get the SAME password,
     and the gallery login checks admin first, so every guest would be an admin
     who can delete photographs. The admin side then falls back to "admin". */
  function defaultPw(which, tail) {
    if (which === 'guest') return pwPrefix + tail;
    return (spwPrefix && spwPrefix !== pwPrefix ? spwPrefix : 'admin') + tail;
  }

  /* 🔑 Two levels, on purpose:
       DEFAULT  — ⚙️ Gallery Settings: prefix + last 4 of the client's phone.
                  Filled into a NEW album's boxes automatically.
       OVERRIDE — the album's own boxes. Whatever is typed there is that
                  album's password and the default no longer applies to it.
     Only empty boxes on a NEW album are filled — while editing, an empty box
     means "keep the current password", never "replace it". */
  function autoFillPasswords(state) {
    if (edit) return state;
    const tail = last4(phoneForAlbum(state));
    if (!tail) return state;
    return {
      ...state,
      guest_password: state.guest_password || defaultPw('guest', tail),
      admin_password: state.admin_password || defaultPw('admin', tail),
    };
  }

  function phoneForAlbum(state) {
    const b = bookings.find(x => x.name && state.title && x.name === state.title);
    return b?.phone || '';
  }

  function resetForm() {
    setF(emptyAlbum()); setCoverFile(null); setCoverFocus('50% 50%'); setFocusView('desktop'); setEdit(null); setMsg('');
    setPwHidden({ guest: false, admin: false });
    setShowPw({ guest: false, admin: false });
  }
  async function create() {
    if (!f.title) return setMsg('⚠️ Gallery name required');
    /* A gallery with no guest password can never be opened by anybody. The
       default fills it from the client's phone; with no phone on file there is
       nothing to build it from, so it has to be typed. */
    if (!edit && kind !== 'liveshoot' && !String(f.guest_password || '').trim()) {
      return setMsg('⚠️ Type a guest password — no client phone was found to build the default from');
    }
    if (f.guest_password && f.guest_password.trim() === String(f.admin_password || '').trim()) {
      return setMsg('⚠️ Guest and admin passwords must be different — otherwise every guest can delete photos');
    }
    setMsg('💾 Saving…');                              // the click is answered at once, never silence
    try {
      let album;
      if (edit) { const d = await api.updateAlbum(edit.id, f); album = d.album; }
      else { const d = await api.createAlbum({ ...f, kind }); album = d.album; }
      /* The gallery itself is already saved by now, so a failed cover must not
         look like a failed save — but it must not look like a success either. A
         vendor who picked a cover and got none would blame the picture. */
      if (coverFile && album) {
        try { await api.uploadAlbumCover(album.id, coverFile, coverFocus); }
        catch (e) { dialog.alert('The gallery was saved, but the cover image was not: ' + e.message, { error: true }); }
      }
      // save focal point whenever there's a cover (new or existing)
      if (album && (coverFile || edit?.cover_photo)) {
        try { await api.saveCoverFocus(album.id, coverFocus); }
        catch (e) { dialog.alert('The gallery was saved, but the focal point was not: ' + e.message, { error: true }); }
      }
      /* ⚠️ The order matters: resetForm() ends with setMsg(''), so the
         confirmation has to be set AFTER it or it is wiped by the very call
         that is meant to tidy up. That is how this went unnoticed. */
      const wasEdit = !!edit;
      resetForm(); setShowNew(false); load();
      setMsg(wasEdit ? '✅ Gallery saved' : '✅ Gallery created');
      /* clear it after a few seconds so it does not sit there for ever */
      setTimeout(() => setMsg(m => (m && m[0] === '✅' ? '' : m)), 4000);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function startEdit(a) {
    setEdit(a);
    setF({
      title: a.title || '', category: a.category || '', client_email: a.client_email || '',
      guest_password: '', admin_password: '',
    });
    setPwHidden({ guest: false, admin: false });
    setShowPw({ guest: false, admin: false });
    setCoverFile(null); setCoverFocus(a.cover_focus || '50% 50%'); setFocusView('desktop'); setShowNew(true); setMsg('');
    /* 👁️ This album's current passwords, readable, so the eye button shows
       them. Typing over one is the override; leaving it is "keep". */
    try {
      const p = await api.albumPasswords(a.id);
      setF(s => ({ ...s, guest_password: p.guest || '', admin_password: p.admin || '' }));
      setPwHidden({ guest: p.guest_set && !p.guest, admin: p.admin_set && !p.admin });
    } catch { /* the boxes stay blank, which still means "keep" */ }
  }

  /* 📧 The Send window shows the gallery email exactly as it will go: the server fills the vendor's "Gallery shared"
     email (Settings → Email templates) for this album. What is in the form wins for the passwords — it may hold
     ones typed but not saved yet. Words changed here are for this send only. */
  async function openSend(a) {
    setSendMsg('');
    const pw = edit?.id === a.id ? { guest: f.guest_password || undefined, admin: f.admin_password || undefined } : {};
    try {
      const m = await api.albumEmailPreview(a.id, pw);
      setSendModal({ album: a, pw, email: (edit?.id === a.id && f.client_email) || m.to || '', body: m.body, html: m.html, edited: false, editing: false });
    } catch (e) { dialog.alert(e.message, { error: true }); }
  }
  /* ⚙️ Manage a tile's gallery. ⚠️ Both, not just edit: startEdit sets showNew too, so clearing edit alone left
     showNew true — and the page-width "New Album" form appeared, prefilled with the album that had just been
     closed. Closing a panel must undo everything opening it did. */
  function manage(a) {
    if (kind === 'liveshoot' && edit?.id === a.id) { setEdit(null); setShowNew(false); resetForm(); }
    else startEdit(a);
  }
  async function doSend() {
    if (!sendModal?.email) { setSendMsg('⚠️ Email required'); return; }
    setSendMsg('Sending…');
    try {
      await api.emailAlbumInstructions(sendModal.album.id, { email: sendModal.email, ...sendModal.pw, ...(sendModal.edited ? { body: sendModal.body } : {}) });
      setSendMsg('✅ Sent!'); setTimeout(() => setSendModal(null), 1200);
    } catch (e) { setSendMsg('⚠️ ' + e.message); }
  }
  async function saveSettingsOnly() {
    try { await api.saveAlbumSettings({ pw_prefix: pwPrefix, spw_prefix: spwPrefix }); setShowSettings(false); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  if (open) return <AlbumDetail albumId={open} onBack={() => { setOpen(null); load(); }} />;
  if (loading) return <div className="loading">Loading…</div>;

  /* 🎯 One definition, rendered in two places: at the top for a NEW album,
     which has no card to belong to, and INLINE underneath the card being
     edited — which is what makes it read as that album's settings rather than
     a panel floating above everything. */
  const albumForm = (
        <div className="table-wrap gal-form">
          <div className="gal-form-h">
            {!edit ? '➕ New Album'
              : kind === 'liveshoot' ? `⚙️ ${edit.title}`
              : '✏️ Edit Album'}
          </div>

          {/* three grouped cards that share the panel width evenly */}
          <div className="gal-form-cards">

            <section className="gal-card-sec">
              <h4 className="gal-sec-h">📋 Details</h4>
              {bookings.length > 0 && (
                <div><label className="lbl">Auto-fill from a booking</label>
                  <select className="gal-input" defaultValue="" onChange={e => pickBooking(e.target.value)}>
                    <option value="">— Pick a booking —</option>
                    {bookings.map(b => <option key={b.id} value={b.id}>{b.name}{b.phone ? ` · ${b.phone}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div><label className="lbl">{kind === 'liveshoot' ? 'Shoot name *' : 'Gallery Name *'}</label>
                <input className="gal-input" autoComplete="off" value={f.title} onChange={e => setF(autoFillPasswords({ ...f, title: e.target.value }))} placeholder="Susan &amp; Mike Wedding" />
              </div>
              {/* ⚠️ autoComplete off: this form has password boxes, so the browser
                  took the text box above them for a LOGIN and filled it with the
                  vendor's saved email — which then showed under the album name
                  on the client's gallery page. */}
              <div><label className="lbl">Category</label>
                <input className="gal-input" autoComplete="off" list="gal-cat-list" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="Wedding" />
                <datalist id="gal-cat-list">
                  {['Wedding', 'Engagement', 'Pre-Wedding', 'Reception', 'Birthday', 'Portrait', 'Event', 'Other'].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </section>

            {/* 🎥 A live shoot has neither. Guests prove who they are with a
                selfie rather than a shared password, and there is no cover
                because nobody lands on a front page — they land on their own
                photographs. Hidden rather than removed: the same component
                serves galleries, where both matter. */}
            {kind !== 'liveshoot' && (<>
            <section className="gal-card-sec">
              <h4 className="gal-sec-h">🔑 Access</h4>
              <div className="gal-sec-note gal-pw-hint">
                {edit
                  ? <>These are this album's own passwords. Type over one to change it for this album only.</>
                  : <>Filled from your defaults in ⚙️ Settings — prefix + last 4 digits of the client's phone,
                     e.g. <code>susan</code> + <code>4821</code> = <code>susan4821</code>. Type here to override for this album.</>}
              </div>
              <div><label className="lbl">🧑‍🤝‍🧑 Guest password</label>
                <div className="gal-pw-wrap">
                  {/* new-password: tells the browser this is NOT a login, so it
                      stops pasting the vendor's own saved password in here */}
                  <input className="gal-input" autoComplete="new-password" type={showPw.guest ? 'text' : 'password'} value={f.guest_password} onChange={e => setF({ ...f, guest_password: e.target.value })} />
                  <button type="button" className="gal-pw-eye" onClick={() => setShowPw(s => ({ ...s, guest: !s.guest }))} title={showPw.guest ? 'Hide' : 'Show'}>{showPw.guest ? '🙈' : '👁️'}</button>
                </div>
                {pwHidden.guest && !f.guest_password && <div className="gal-sec-note gal-pw-hint">🔒 Set before passwords could be shown. It still works — type a new one here to see it from now on.</div>}
              </div>
              <div><label className="lbl">🔐 Admin password</label>
                <div className="gal-pw-wrap">
                  <input className="gal-input" autoComplete="new-password" type={showPw.admin ? 'text' : 'password'} value={f.admin_password} onChange={e => setF({ ...f, admin_password: e.target.value })} />
                  <button type="button" className="gal-pw-eye" onClick={() => setShowPw(s => ({ ...s, admin: !s.admin }))} title={showPw.admin ? 'Hide' : 'Show'}>{showPw.admin ? '🙈' : '👁️'}</button>
                </div>
                {pwHidden.admin && !f.admin_password && <div className="gal-sec-note gal-pw-hint">🔒 Set before passwords could be shown. It still works — type a new one here to see it from now on.</div>}
              </div>
              <div className="gal-sec-note">Guests can view, download and favorite. The admin password also unlocks selecting, sending a selection, and deleting.</div>
            </section>

            <section className="gal-card-sec">
              <div className="gal-sec-top">
                <h4 className="gal-sec-h">🖼️ Cover</h4>
                {(coverFile || edit?.cover_photo) && (
                  <div className="fp-toggle">
                    <button type="button" className={`fp-tog ${focusView === 'desktop' ? 'on' : ''}`} onClick={() => setFocusView('desktop')}>🖥️</button>
                    <button type="button" className={`fp-tog ${focusView === 'mobile' ? 'on' : ''}`} onClick={() => setFocusView('mobile')}>📱</button>
                  </div>
                )}
              </div>
              {(coverFile || edit?.cover_photo) ? (
                <>
                  <FocalPicker
                    src={coverFile ? URL.createObjectURL(coverFile) : `${api.albumCoverUrl(edit.id)}?t=${edit.cover_photo}`}
                    focus={coverFocus} onFocus={setCoverFocus}
                    view={focusView} onView={setFocusView}
                  />
                  <div className="fp-note">Click or drag on the preview to set what stays centered.</div>
                </>
              ) : (
                <div className="gal-cover-empty">No cover photo yet</div>
              )}
              <label className="gal-cover-btn">
                {coverFile ? `✅ ${coverFile.name.slice(0, 16)}…` : (edit?.cover_photo ? '🖼️ Replace cover' : '📤 Choose cover')}
                <input type="file" accept="image/*" hidden onChange={e => setCoverFile(e.target.files[0] || null)} />
              </label>
            </section>
            </>)}

            {/* 🎥 The guest link. Shown rather than hidden behind Send
                Instructions, because it is the only thing anybody opens this
                panel to fetch. */}
            {kind === 'liveshoot' && edit?.public_token && (
              <section className="gal-card-sec">
                <h4 className="gal-sec-h">🔗 Guest link</h4>
                <div className="ls-link-row">
                  <code className="ls-link">{`${window.location.origin}/live/${edit.public_token}`}</code>
                  <button type="button" className="gal-mini"
                    onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/live/${edit.public_token}`)}>
                    📋 Copy
                  </button>
                </div>
              </section>
            )}

          </div>

          <div className="gal-form-foot">
            <button className="refresh gal-act" onClick={create}>{edit ? '💾 Save changes' : '✅ Create album'}</button>
            {/* ⚠️ Both of these are GALLERY buttons and neither makes sense for a
                live shoot. Copy Gallery Link copies /g/<token> — the
                password-protected gallery page, which a live shoot does not
                have; there is nothing at that address to protect or unlock.
                Send Instructions mails the guest password and the same link.
                A live shoot has one address, /live/<token>, and it is already
                on this panel with its own Copy. Three buttons offering two
                wrong answers and one right one is worse than one button. */}
            {edit && kind !== 'liveshoot' && <button className="refresh gal-act" onClick={() => openSend(edit)}>📧 Send Instructions</button>}
            {edit?.public_token && kind !== 'liveshoot' && <button className="refresh gal-act" onClick={() => copyUrl(edit)}>{copiedUrl ? '✅ Copied!' : '🔗 Copy Gallery Link'}</button>}
            {/* 🔗 the client's link itself, to open and check (Muse F-14: it was only ever copied, never shown) */}
            {edit?.public_token && kind !== 'liveshoot' && <a className="gal-link" href={`${clientBase()}/g/${edit.public_token}`} target="_blank" rel="noreferrer">{`${clientBase()}/g/${edit.public_token}`}</a>}
            {msg && <span className={`gal-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</span>}
          </div>
        </div>
  );

  return (
    <>
      <div className="gal-head">
          {/* ⚠️ OUTSIDE the form on purpose: a save closes the form, and a
              confirmation rendered inside it would vanish in the same tick. */}
          {msg && msg[0] === '✅' && <span className="gal-toast">{msg}</span>}
        <h2 className="gal-title">{kind === 'liveshoot' ? '🎥 Live shoots' : '📸 Galleries'}</h2>
        <div className="gal-head-btns">
          <button className="lead-ic-btn" onClick={() => { resetForm(); setShowNew(s => !s); }} title={showNew ? 'Cancel' : 'New album'}>{showNew ? '✕' : '➕'}</button>
          <button className={`lead-ic-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); setSearch(''); }} title="Search albums">🔍</button>
          <button className={`lead-ic-btn lead-ic-del ${selectMode ? 'is-on' : ''}`} onClick={onBinClick} title={selectMode ? (checked.length ? `Delete ${checked.length}` : 'Cancel select') : 'Select to delete'}>{selectMode && checked.length ? `🗑️ ${checked.length}` : '🗑️'}</button>
          <button className="lead-ic-btn" onClick={() => setShowSettings(true)} title="Settings">⚙️</button>
        </div>
      </div>

      {showSearch && (
        <input className="lead-search" autoFocus placeholder="🔍 Search albums by name or category…" value={search} onChange={e => setSearch(e.target.value)} />
      )}



      {/* A new album has no card to belong to, so it opens here.
          ⚠️ And a GALLERY still opens its edit form here too: galleries are
          locked, and the inline form below is a live-shoot change. The same
          component serves both, so the difference has to be explicit. */}
      {/* ⚠️ Not just showNew. startEdit sets showNew as well as edit, so a
          live shoot was rendering this page-width form AND the one inside its
          card — two editors for the same album. This is the form for a NEW
          album, or for editing a gallery; a live shoot edits in its tile. */}
      {((showNew && !edit) || (edit && kind !== 'liveshoot')) && albumForm}

      {showSettings && (
        <div className="al-overlay" onClick={() => setShowSettings(false)}>
          <div className="gal-set-modal gal-set-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">⚙️ Gallery Settings</h3>
              <button className="al-x" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            <div className="gal-set-cols">
              <div className="gal-set-col">
                <label className="lbl">🔗 Full gallery link (all albums — embed on your website)</label>
                <div className="gal-set-link">
                  <input className="gal-input" readOnly value={galleryToken ? `${clientBase()}/gallery/${galleryToken}` : 'Loading…'} onFocus={e => e.target.select()} />
                  <button className="refresh gal-copy-url" onClick={copyGalleryUrl} disabled={!galleryToken}>{copiedGallery ? '✅' : '🔗 Copy'}</button>
                </div>

                <label className="lbl gal-set-lbl">🔑 Default password prefixes</label>
                <div className="gal-set-hint">Every new album gets prefix + last 4 digits of the client's phone. Any album can override its own in 🔑 Access.</div>
                <div className="gal-set-prefixes">
                  <input className="gal-input" value={pwPrefix} onChange={e => setPwPrefix(e.target.value)} placeholder="Guest prefix" />
                  <input className="gal-input" value={spwPrefix} onChange={e => setSpwPrefix(e.target.value)} placeholder="Admin prefix" />
                </div>

                <label className="lbl gal-set-lbl">📧 Gallery email</label>
                <div className="gal-set-hint">The email a client gets when you press Send is in Settings → Setup Email → Email templates → Gallery shared.</div>
                <button className="refresh gal-save gal-set-save" onClick={saveSettingsOnly}>💾 Save Settings</button>
              </div>

              <div className="gal-set-col">
                <div className="gal-theme-head">🎨 Client page style</div>
                <div className="gal-set-hint">Pick a look, then fine-tune if you want.</div>

                <div className="gal-presets">
                  {GAL_PRESETS.map(p => (
                    <button
                      key={p.id}
                      className={`gal-preset ${presetActive(p) ? 'is-on' : ''}`}
                      onClick={() => applyPreset(p)}
                      title={p.note}
                    >
                      <span className="gal-preset-swatch" style={{ background: p.t.bg_color }}>
                        <i style={{ background: p.t.accent_color }} />
                        <i style={{ background: p.t.heading_color }} />
                      </span>
                      <span className="gal-preset-name">{p.name}</span>
                    </button>
                  ))}
                </div>

                <div className="gal-set-hint gal-fine">Fine-tune</div>

                <div className="gal-set-prefixes gal-theme-fonts">
                  <div><label className="lbl">Heading font</label>
                    <select className="gal-input" value={theme.heading_font || 'Playfair Display'} onChange={e => setT('heading_font', e.target.value)}>
                      {GAL_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Body font</label>
                    <select className="gal-input" value={theme.body_font || 'Jost'} onChange={e => setT('body_font', e.target.value)}>
                      {GAL_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                <div className="gal-theme-colors">
                  {[['bg_color', 'Background', '#0f1115'], ['heading_color', 'Heading', '#f3f4f6'], ['accent_color', 'Accent', '#0d9488'], ['sub_color', 'Subtitle', '#9ca3af']].map(([k, lbl, def]) => (
                    <div key={k} className="gal-color-row">
                      <input type="color" className="gal-color" value={theme[k] || def} onChange={e => setT(k, e.target.value)} />
                      <span>{lbl}</span>
                    </div>
                  ))}
                </div>

                <label className="lbl gal-set-lbl">Kicker / title text</label>
                <input className="gal-input" value={theme.title_text ?? ''} onChange={e => setT('title_text', e.target.value)} placeholder="Client Galleries" />
                <label className="lbl gal-set-lbl">Subtitle</label>
                <input className="gal-input" value={theme.subtitle_text ?? ''} onChange={e => setT('subtitle_text', e.target.value)} placeholder="Secure, Password-Protected Memories" />
                <label className="lbl gal-set-lbl">Tagline</label>
                <input className="gal-input" value={theme.tagline_text ?? ''} onChange={e => setT('tagline_text', e.target.value)} placeholder="Ready to view, share and download." />

                {/* live preview */}
                <div className="gal-theme-preview" style={{ background: theme.bg_color || '#0f1115' }}>
                  <div style={{ textTransform: 'uppercase', letterSpacing: 3, fontSize: 10, color: theme.accent_color || '#0d9488', fontFamily: `'${theme.body_font || 'Jost'}',sans-serif` }}>{theme.title_text || 'Client Galleries'}</div>
                  <div style={{ fontFamily: `'${theme.heading_font || 'Playfair Display'}',serif`, fontSize: 22, color: theme.heading_color || '#f3f4f6', margin: '4px 0' }}>Your Studio Name</div>
                  <div style={{ fontSize: 12, color: theme.sub_color || '#9ca3af', fontFamily: `'${theme.body_font || 'Jost'}',sans-serif` }}>{theme.subtitle_text || 'Secure, Password-Protected Memories'}</div>
                </div>

                <button className="refresh gal-save gal-set-save" onClick={saveTheme}>{themeSaved ? '✅ Saved!' : '🎨 Save Style'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const q = search.trim().toLowerCase();
        const shown = q ? albums.filter(a => (a.title || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q)) : albums;
        if (albums.length === 0) return <div className="table-wrap gal-empty">No albums yet. Create your first one 📸</div>;
        if (shown.length === 0) return <div className="table-wrap gal-empty">No albums match “{search}” 🔍</div>;
        return (
        <div className="gal-cards">
          {shown.map(a => (
            <Fragment key={a.id}>
            <div className={`table-wrap gal-card ${selectMode && checked.includes(a.id) ? 'gal-card-sel' : ''} ${kind === 'liveshoot' && edit?.id === a.id ? 'is-editing' : ''}`} onClick={() => { if (selectMode) toggleCheck(a.id, { stopPropagation() {} }); else setOpen(a.id); }}>
              {selectMode && (
                <div className="gal-card-check" onClick={e => toggleCheck(a.id, e)}>
                  <input type="checkbox" readOnly checked={checked.includes(a.id)} />
                </div>
              )}
              <div className="gal-card-cover">
                {a.cover_photo
                  ? <img src={api.albumCoverUrl(a.id, 800)} alt={a.title} loading="lazy" />
                  : <div className="gal-card-noimg">🖼️</div>}
              </div>
              <div className="gal-card-body">
                <div className="gal-card-title">{a.title}</div>
                {/* category on the left, the counts on the right — one line (Raj, 2026-11-09) */}
                <div className="gal-card-sub">
                  <span className="gal-card-cat">{a.category || '—'}</span>
                  <span className="gal-card-meta">
                    <span>📷 {a.photo_count}</span>
                    {a.video_count > 0 && <span>🎬 {a.video_count}</span>}
                    {a.selected_count > 0 && <span className="gal-picked">✅ {a.selected_count}</span>}
                  </span>
                </div>
                {!selectMode && (shortcuts && kind === 'gallery' ? (
                  /* 📧 Send instructions · 📊 the download log (Studio — gallery_insights) · ⚙️ Manage, sharing the row
                     equally (Raj, 2026-11-09); a plan with galleries but not the log gets the two */
                  <div className="gal-card-actions is-icons">
                    <button className="gal-mini gal-icon is-send" onClick={e => { e.stopPropagation(); openSend(a); }} title="Send instructions" aria-label="Send instructions"><MailIcon /></button>
                    {insights && (
                      <button className="gal-mini gal-icon is-log" onClick={e => { e.stopPropagation(); setLogFor(a); }}
                        title={a.all_downloaded ? 'Download log — every photo has been downloaded' : 'Download log'} aria-label="Download log">
                        <ChartIcon />
                        {a.all_downloaded && <span className="gal-done" aria-hidden="true"><DownloadedMark /></span>}
                      </button>
                    )}
                    <button className="gal-mini gal-icon is-manage" onClick={e => { e.stopPropagation(); manage(a); }} title="Manage" aria-label="Manage"><GearIcon /></button>
                  </div>
                ) : (
                  <div className="gal-card-actions">
                    <button className="gal-mini gal-mini-gear" onClick={e => { e.stopPropagation(); manage(a); }} title="Edit album">
                      ⚙️ Manage{kind === 'liveshoot' && edit?.id === a.id ? ' ▲' : kind === 'liveshoot' ? ' ▼' : ''}
                    </button>
                  </div>
                ))}

                {/* 🎯 Inside the card, not across the row. Spanning the grid
                    made it a panel the width of the page that happened to be
                    near the thing you clicked; dropping out of the tile makes
                    it plainly that tile's settings. The card grows and the
                    grid reflows around it. */}
                {kind === 'liveshoot' && edit?.id === a.id && (
                  /* ⚠️ The card opens the album on click, and this panel lives
                     INSIDE it — so every field, dropdown and button bubbled up
                     and threw you into the photographs instead. Stopped at the
                     panel's edge rather than on each control, because the next
                     button added here would otherwise arrive with the same bug
                     and nobody would think to look. */
                  <div className="gal-drop" onClick={e => e.stopPropagation()}>{albumForm}</div>
                )}
              </div>
            </div>
            </Fragment>
          ))}
        </div>
        );
      })()}

      {logFor && <GalleryDownloadLog album={logFor} onClose={() => setLogFor(null)} />}
      {sendModal && (
        <div className="al-overlay" onClick={() => setSendModal(null)}>
          <div className="gal-send-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">📧 Send Instructions</h3>
              <button className="al-x" onClick={() => setSendModal(null)}>✕</button>
            </div>
            <label className="lbl">To (client email)</label>
            <input className="gal-input" value={sendModal.email} onChange={e => setSendModal(m => ({ ...m, email: e.target.value }))} placeholder="client@email.com" />

            <div className="gal-send-msghead">
              <label className="lbl">{sendModal.html ? 'Your HTML design' : 'Instructions'}</label>
              {!sendModal.html && !sendModal.editing && <button className="gal-gen" onClick={() => setSendModal(m => ({ ...m, editing: true }))}>✏️ Edit</button>}
            </div>
            {sendModal.html
              /* sandbox with nothing allowed: the design shows, nothing in it can run */
              ? <iframe className="et-frame" title="Email preview" sandbox="" srcDoc={sendModal.html} />
              : <textarea className="gal-input gal-send-ta" readOnly={!sendModal.editing} value={sendModal.body} onChange={e => setSendModal(m => ({ ...m, body: e.target.value, edited: true }))} />}
            <div className="gal-set-hint">{sendModal.editing ? 'Your changes are for this email only. ' : ''}To change the words for every gallery: Settings → Setup Email → Email templates.</div>

            <div className="gal-send-foot">
              <button className="refresh gal-save" onClick={doSend}>📨 Send</button>
              {sendMsg && <span className="gal-err">{sendMsg}</span>}
              <button className="gal-gen gal-send-copy" onClick={copyInstructions}>{copiedMsg ? '✅ Copied' : '📋 Copy'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

