import { useState, useEffect, useRef } from 'react';
import { api, getUser, clearSession } from '../lib/api';
import { PROFESSIONS } from './InquiryForm';
import './vendor.css';

// 🗝️ tab → required feature (one map controls everything)
const TAB_FEATURE = {
  leads: 'leads', bookings: 'leads', packages: 'leads', inqform: 'leads',
  contracts: 'contracts', crew: 'crew', calendar: 'calendar', galleries: 'galleries',
};

function FeatureLocked({ goServices }) {
  return (
    <div className="table-wrap" style={{ padding: 40, textAlign: 'center', maxWidth: 520 }}>
      <div style={{ fontSize: 44 }}>🔒</div>
      <h2 style={{ margin: '10px 0 6px' }}>This feature isn't in your plan</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>Upgrade your plan or add it as a standalone service to unlock it. ✨</p>
      <button className="refresh" onClick={goServices} style={{ background: '#2dd4bf', color: '#06231f' }}>🧩 View My Services</button>
    </div>
  );
}

export default function VendorPanel({ onLogout }) {
  const [services, setServices] = useState([]);
  const [features, setFeatures] = useState(null);   // 🗝️ entitlements (null = loading)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 820);
  const [profile, setProfile] = useState(null);
  const user = getUser();

  useEffect(() => { api.myProfile().then(d => setProfile(d.profile)).catch(() => {}); }, []);

  // 🌗 instant paint from last-known theme (avoids flash); load() then applies vendor's DB theme
  useEffect(() => {
    const cached = localStorage.getItem('vf_theme');
    if (cached === 'light') document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  // 🗝️ single access check used everywhere
  const has = (key) => !!features && (features.includes('*') || features.includes(key));
  // 📱 nav → also close sidebar on mobile
  const go = (t) => { setTab(t); if (window.innerWidth <= 820) setCollapsed(true); };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [d, f, st] = await Promise.all([api.myServices(), api.myFeatures(), api.mySettings().catch(() => ({ settings: null }))]);
      setServices(d.services);
      setFeatures(f.features || []);
      // 🌗 apply this vendor's saved theme
      const th = st?.settings?.theme || 'dark';
      if (th === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('vf_theme', th);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() { clearSession(); onLogout(); }

  const active = services.filter(s => s.enabled);

  return (
    <div className={`dash ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {!collapsed && <div className="sidebar-backdrop" onClick={() => setCollapsed(true)} />}
      <aside className="sidebar">
        <div className="brand">
          {profile?.logo_path
            ? <img className="brand-logo" src={`/api/me/logo/${profile.logo_path}`} alt="logo" />
            : <span>📸</span>}
          <span className="nav-txt">{profile?.business_name || 'My Studio'}<small>VENDOR</small></span>
        </div>
        <div className="nav-group">WORK</div>
        <div className={`nav-item ${tab==='dashboard'?'active':''}`} onClick={() => go('dashboard')}><span className="nav-ic">📊</span><span className="nav-txt">Dashboard</span></div>
        {has('leads') && <div className={`nav-item ${tab==='leads'?'active':''}`} onClick={() => go('leads')}><span className="nav-ic">📋</span><span className="nav-txt">Leads</span></div>}
        {has('leads') && <div className={`nav-item ${tab==='bookings'?'active':''}`} onClick={() => go('bookings')}><span className="nav-ic">📅</span><span className="nav-txt">Bookings</span></div>}
        {has('contracts') && <div className={`nav-item ${tab==='contracts'?'active':''}`} onClick={() => go('contracts')}><span className="nav-ic">📄</span><span className="nav-txt">Contracts & Invoices</span></div>}
        {has('crew') && <div className={`nav-item ${tab==='crew'?'active':''}`} onClick={() => go('crew')}><span className="nav-ic">👷</span><span className="nav-txt">My Crew</span></div>}
        {has('galleries') && <div className={`nav-item ${tab==='galleries'?'active':''}`} onClick={() => go('galleries')}><span className="nav-ic">📸</span><span className="nav-txt">Galleries</span></div>}
        <div className="nav-group">SETUP</div>
        {has('leads') && <div className={`nav-item ${tab==='packages'?'active':''}`} onClick={() => go('packages')}><span className="nav-ic">📦</span><span className="nav-txt">My Packages</span></div>}
        {has('leads') && <div className={`nav-item ${tab==='inqform'?'active':''}`} onClick={() => go('inqform')}><span className="nav-ic">🎨</span><span className="nav-txt">Inquiry Form</span></div>}
        <div className={`nav-item ${tab==='services'?'active':''}`} onClick={() => go('services')}><span className="nav-ic">🧩</span><span className="nav-txt">My Services</span></div>
        <div className="nav-group">ACCOUNT</div>
        <div className={`nav-item ${tab==='refer'?'active':''}`} onClick={() => go('refer')}><span className="nav-ic">👥</span><span className="nav-txt">Refer a Friend</span></div>
        <div className={`nav-item ${tab==='settings'?'active':''}`} onClick={() => go('settings')}><span className="nav-ic">⚙️</span><span className="nav-txt">Settings</span></div>
        <div className="logout" onClick={handleLogout}><span className="nav-ic">🚪</span><span className="nav-txt">Log out</span></div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-btn" onClick={() => setCollapsed(c => !c)} title="Menu">☰</button>
            <div>
              <h1>{tab === 'dashboard' ? 'Dashboard' : tab === 'refer' ? 'Refer a Friend' : tab === 'leads' ? 'Leads' : tab === 'settings' ? 'Settings' : tab === 'packages' ? 'My Packages' : tab === 'bookings' ? 'Bookings' : tab === 'inqform' ? 'Inquiry Form' : tab === 'contracts' ? 'Contracts & Invoices' : tab === 'crew' ? 'My Crew' : tab === 'galleries' ? 'Galleries' : tab === 'calendar' ? 'Calendar' : 'My Services'}</h1>
              <div className="sub">Welcome back, {user?.name} 👋</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {has('calendar') && <button className={`hdr-icon ${tab==='calendar'?'active':''}`} onClick={() => setTab(tab === 'calendar' ? 'dashboard' : 'calendar')} title="Quick Calendar">🗓️</button>}
            <NotifBell />
          </div>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {TAB_FEATURE[tab] && !has(TAB_FEATURE[tab]) ? (
          <FeatureLocked goServices={() => setTab('services')} />
        ) : loading ? <div className="loading">Loading…</div> : tab === 'refer' ? (
          <ReferForm user={user} />
        ) : tab === 'leads' ? (
          <LeadsView />
        ) : tab === 'bookings' ? (
          <BookingsView />
        ) : tab === 'contracts' ? (
          <ContractsTab />
        ) : tab === 'crew' ? (
          <CrewView />
        ) : tab === 'galleries' ? (
          <GalleriesView />
        ) : tab === 'calendar' ? (
          <CalendarView />
        ) : tab === 'inqform' ? (
          <InqFormSettings user={user} />
        ) : tab === 'packages' ? (
          <PackagesView />
        ) : tab === 'settings' ? (
          <SettingsView user={user} />
        ) : tab === 'dashboard' ? (
          <DashHome goTab={setTab} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Service</th><th>Price</th><th>Status</th></tr></thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id}>
                    <td className="biz">{s.icon} {s.name}</td>
                    <td>${s.price}/mo</td>
                    <td><span className={`badge ${s.enabled?'active':'trial'}`}>{s.enabled ? 'Active' : 'Off'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function NotifBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unseen: 0 });

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  function load() { api.notifications().then(setData).catch(() => {}); }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unseen > 0) {
      await api.notificationsSeen().catch(() => {});
      setData(d => ({ ...d, unseen: 0 }));
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="hdr-icon" onClick={toggle} style={{ position: 'relative' }}>
        🔔
        {data.unseen > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, background: '#fb7185', color: '#fff', borderRadius: 12, fontSize: 10, fontWeight: 800, padding: '2px 6px' }}>{data.unseen}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 44, width: 320, maxHeight: 400, overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, zIndex: 40, boxShadow: '0 10px 30px #00000060' }}>
          {data.notifications.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>No notifications yet 🔕</div>
          ) : data.notifications.map(n => (
            <div key={n.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              {n.body && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{n.body}</div>}
              <div style={{ color: '#4a6169', fontSize: 10.5, marginTop: 3 }}>{String(n.created_at).slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleriesView() {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // album id being viewed
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ title: '', category: '', guest_username: '', guest_password: '', admin_username: '', admin_password: '' });
  const [msg, setMsg] = useState('');
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9, width: '100%' };

  useEffect(() => { load(); }, []);
  function load() { setLoading(true); api.albums().then(d => setAlbums(d.albums || [])).catch(() => {}).finally(() => setLoading(false)); }

  async function create() {
    if (!f.title) return setMsg('⚠️ Title required');
    try {
      await api.createAlbum(f);
      setF({ title: '', category: '', guest_username: '', guest_password: '', admin_username: '', admin_password: '' });
      setShowNew(false); setMsg(''); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function del(id) {
    if (!confirm('Delete this album and all its photos?')) return;
    await api.deleteAlbum(id); load();
  }

  if (open) return <AlbumDetail albumId={open} onBack={() => { setOpen(null); load(); }} />;
  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>📸 Galleries</h2>
        <button className="refresh" style={{ background: '#2dd4bf', color: '#06231f' }} onClick={() => setShowNew(s => !s)}>{showNew ? '✕ Cancel' : '+ New Album'}</button>
      </div>

      {showNew && (
        <div className="table-wrap" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="lbl">Title *</label><input style={box} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Susan & Mike Wedding" /></div>
            <div><label className="lbl">Category</label><input style={box} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="Wedding" /></div>
            <div><label className="lbl">👁️ Guest username</label><input style={box} value={f.guest_username} onChange={e => setF({ ...f, guest_username: e.target.value })} /></div>
            <div><label className="lbl">👁️ Guest password</label><input style={box} value={f.guest_password} onChange={e => setF({ ...f, guest_password: e.target.value })} /></div>
            <div><label className="lbl">🔑 Admin username</label><input style={box} value={f.admin_username} onChange={e => setF({ ...f, admin_username: e.target.value })} /></div>
            <div><label className="lbl">🔑 Admin password</label><input style={box} value={f.admin_password} onChange={e => setF({ ...f, admin_password: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="refresh" style={{ background: '#2dd4bf', color: '#06231f' }} onClick={create}>✅ Create album</button>
            {msg && <span style={{ color: '#fb7185', fontSize: 13 }}>{msg}</span>}
          </div>
        </div>
      )}

      {albums.length === 0 ? (
        <div className="table-wrap" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No albums yet. Create your first one 📸</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
          {albums.map(a => (
            <div key={a.id} className="table-wrap" style={{ padding: 16, cursor: 'pointer' }} onClick={() => setOpen(a.id)}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{a.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>{a.category || '—'}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span>📷 {a.photo_count} photos</span>
                {a.selected_count > 0 && <span style={{ color: '#2dd4bf' }}>✅ {a.selected_count} picked</span>}
              </div>
              <button className="refresh" style={{ marginTop: 10, fontSize: 11, padding: '4px 10px' }} onClick={e => { e.stopPropagation(); del(a.id); }}>🗑️ Delete</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AlbumDetail({ albumId, onBack }) {
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [faceMsg, setFaceMsg] = useState('');
  const [matchIds, setMatchIds] = useState(null); // null = show all, [] = filtered
  const token = localStorage.getItem('vowflo_token');

  useEffect(() => { load(); }, [albumId]);
  function load() { api.album(albumId).then(d => { setAlbum(d.album); setPhotos(d.photos || []); }).catch(() => {}); }

  async function indexFaces() {
    setIndexing(true); setFaceMsg('🧠 Scanning faces…');
    try { const r = await api.indexFaces(albumId); setFaceMsg(`✅ Indexed ${r.indexed} photos · ${r.faces} faces`); }
    catch (e) { setFaceMsg('⚠️ ' + e.message); }
    finally { setIndexing(false); setTimeout(() => setFaceMsg(''), 4000); }
  }
  async function onSelfie(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFaceMsg('🔍 Searching…');
    try {
      const r = await api.faceSearch(albumId, file);
      setMatchIds(r.photo_ids);
      setFaceMsg(`✅ Found ${r.matches} matching photos`);
    } catch (err) { setFaceMsg('⚠️ ' + err.message); }
    e.target.value = '';
  }

  async function onFiles(e) {
    const files = e.target.files;
    if (!files.length) return;
    setUploading(true); setProg(`Uploading ${files.length} photos…`);
    try { await api.uploadPhotos(albumId, files); setProg('✅ Done'); load(); }
    catch (err) { setProg('⚠️ ' + err.message); }
    finally { setUploading(false); setTimeout(() => setProg(''), 2000); }
  }
  async function delPhoto(pid) {
    if (!confirm('Delete this photo?')) return;
    await api.deletePhoto(albumId, pid); load();
  }

  if (!album) return <div className="loading">Loading…</div>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <button className="refresh" style={{ fontSize: 12, marginBottom: 6 }} onClick={onBack}>← Back</button>
          <h2 style={{ margin: 0 }}>🖼️ {album.title}</h2>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{photos.length} photos</div>
        </div>
        <label className="refresh" style={{ background: '#2dd4bf', color: '#06231f', cursor: 'pointer' }}>
          {uploading ? '⏳ Uploading…' : '📤 Upload photos'}
          <input type="file" accept="image/*" multiple hidden onChange={onFiles} disabled={uploading} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="refresh" onClick={indexFaces} disabled={indexing}>{indexing ? '🧠 Indexing…' : '🧠 Index Faces'}</button>
        <label className="refresh" style={{ cursor: 'pointer' }}>
          🤳 Search by Selfie
          <input type="file" accept="image/*" hidden onChange={onSelfie} />
        </label>
        {matchIds !== null && <button className="refresh" onClick={() => { setMatchIds(null); setFaceMsg(''); }}>✕ Clear filter</button>}
        {faceMsg && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{faceMsg}</span>}
      </div>
      {prog && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>{prog}</div>}

      {photos.length === 0 ? (
        <div className="table-wrap" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No photos yet. Upload some 📤</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {photos.filter(p => matchIds === null || matchIds.includes(p.id)).map(p => (
            <div key={p.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '1' }}>
              <img src={`${api.fileUrl(p.id, 'thumb')}?token=${token}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {p.is_selected && <span style={{ position: 'absolute', top: 6, left: 6, background: '#2dd4bf', color: '#06231f', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '2px 7px' }}>✅ Picked</span>}
              <button onClick={() => delPhoto(p.id)} style={{ position: 'absolute', top: 6, right: 6, background: '#00000090', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CrewView() {
  const [crew, setCrew] = useState([]);
  const [f, setF] = useState({ name: '', role: '', phone: '', email: '' });
  const [msg, setMsg] = useState('');
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9 };

  useEffect(() => { load(); }, []);
  function load() { api.crew().then(d => setCrew(d.crew || [])).catch(() => {}); }

  async function add() {
    if (!f.name) return setMsg('⚠️ Name required');
    setMsg('');
    try { await api.addCrew(f); setF({ name: '', role: '', phone: '', email: '' }); setMsg('✅ Added'); setTimeout(() => setMsg(''), 1500); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function del(id) {
    if (!confirm('Remove this crew member?')) return;
    try { await api.deleteCrew(id); load(); } catch {}
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="table-wrap" style={{ padding: 18, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>➕ Add crew member {msg && <span style={{ fontSize: 13, color: msg[0] === '✅' ? '#4ade80' : '#fb7185' }}>{msg}</span>}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={box} placeholder="Name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={box} placeholder="Role (e.g. 2nd shooter)" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} />
          <input style={box} placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <input style={box} placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        </div>
        <button className="refresh" onClick={add} style={{ marginTop: 10, background: '#2dd4bf', color: '#06231f' }}>+ Add to roster</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {crew.length === 0 ? (
              <tr><td colSpan="5" className="empty">No crew yet. Add your team above 👆 Then assign them on any booking.</td></tr>
            ) : crew.map(c => (
              <tr key={c.id}>
                <td className="biz">{c.name}</td>
                <td>{c.role || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.email || '—'}</td>
                <td><span style={{ cursor: 'pointer' }} onClick={() => del(c.id)}>🗑️</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarView() {
  const [bookings, setBookings] = useState([]);
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selDay, setSelDay] = useState(null);
  const [dir, setDir] = useState('left');

  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {});
  }, []);

  const byDay = {};
  bookings.forEach(b => {
    if (!b.event_date) return;
    const k = String(b.event_date).slice(0, 10);
    (byDay[k] = byDay[k] || []).push(b);
  });

  const first = new Date(cur.y, cur.m, 1);
  const startPad = first.getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthName = first.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10);
  const key = (d) => `${cur.y}-${String(cur.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const move = (n) => { setDir(n > 0 ? 'left' : 'right'); setSelDay(null); setCur(c => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };

  // 👆 finger swipe
  const touch = useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  };

  return (
    <div style={{ maxWidth: 760 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="table-wrap" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button className="refresh" onClick={() => move(-1)}>←</button>
          <h2 style={{ margin: 0 }}>🗓️ {monthName}</h2>
          <button className="refresh" onClick={() => move(1)}>→</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginBottom: 6 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div key={`${cur.y}-${cur.m}`} className={`cal-grid slide-${dir}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = key(d);
            const evts = byDay[k] || [];
            const isToday = k === today;
            return (
              <div key={i} onClick={() => evts.length && setSelDay(k)}
                style={{ minHeight: 58, borderRadius: 8, padding: 6, fontSize: 12, cursor: evts.length ? 'pointer' : 'default',
                  background: evts.length ? 'var(--teal-soft)' : 'var(--panel-2)',
                  border: `1px solid ${selDay === k ? 'var(--teal)' : isToday ? 'var(--amber)' : 'var(--line)'}` }}>
                <div style={{ fontWeight: 700, color: isToday ? 'var(--amber)' : evts.length ? 'var(--teal)' : 'var(--muted)' }}>{d}</div>
                {evts.slice(0, 2).map(e => (
                  <div key={e.id} style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✅ {e.name}</div>
                ))}
                {evts.length > 2 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>+{evts.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {selDay && (byDay[selDay] || []).map(b => (
        <div key={b.id} className="table-wrap" style={{ padding: 14, marginTop: 10, fontSize: 13 }}>
          🎉 <b>{b.name}</b> · {b.event_type} · {b.timing_from ? `${b.timing_from}–${b.timing_to || '?'}` : 'time TBD'}
          {b.location ? ` · 📍 ${b.location}` : ''}
          {b.money ? ` · ⏳ $${b.money.balance} due` : ''}
        </div>
      ))}
    </div>
  );
}

function DashHome({ goTab }) {
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.leads().catch(() => ({ leads: [] })),
      api.bookings().catch(() => ({ bookings: [] })),
      api.albums().catch(() => ({ albums: [] })),
    ]).then(([l, b, a]) => { setLeads(l.leads || []); setBookings(b.bookings || []); setAlbums(a.albums || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  const newLeads = leads.filter(l => l.status === 'new').length;
  const booked = leads.filter(l => l.status === 'booked').length;
  const photoSel = albums.reduce((n, a) => n + (Number(a.selected_count) > 0 ? 1 : 0), 0);
  const recent = leads.slice(0, 6);
  const upcoming = bookings
    .filter(b => b.event_date && new Date(b.event_date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
    .slice(0, 6);
  const SB = { new: 'trial', contacted: 'trial', quoted: 'trial', booked: 'active', completed: 'active', cancelled: 'past' };
  const mName = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dParts = (d) => { const x = new Date(d); return { day: x.getDate(), mon: mName[x.getMonth()], dow: x.toLocaleDateString('en',{weekday:'long'}) }; };

  return (
    <>
      <div className="dash-grid">
        <div className="dash-left">
          {/* 🟢 4 tiles */}
          <div className="stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="card"><div className="ic">📋</div><div className="value">{leads.length}</div><div className="label">Total Leads</div></div>
            <div className="card"><div className="ic">✨</div><div className="value">{newLeads}</div><div className="label">New Leads</div></div>
            <div className="card"><div className="ic">✅</div><div className="value">{booked}</div><div className="label">Booked</div></div>
            <div className="card" onClick={() => goTab('galleries')} style={{ cursor: 'pointer' }}><div className="ic">🖼️</div><div className="value">{photoSel}</div><div className="label">Photo Selection</div></div>
          </div>

          {/* 🟡 Recent Leads */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px' }}>
            <h2 style={{ margin: 0 }}>📋 Recent Leads</h2>
            <button className="refresh" onClick={() => goTab('leads')} style={{ padding: '6px 14px', fontSize: 12 }}>View all →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Event</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr><td colSpan="4" className="empty">No leads yet. Share your inquiry link! 📨</td></tr>
                ) : recent.map(l => (
                  <tr key={l.id} onClick={() => goTab('leads')} style={{ cursor: 'pointer' }}>
                    <td className="biz">{l.name}</td>
                    <td>{l.event_type}</td>
                    <td>{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
                    <td><span className={`badge ${SB[l.status] || 'trial'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🔵 Upcoming Events (right column) */}
        <div className="dash-right">
          <h2 style={{ margin: '0 0 14px' }}>📅 Upcoming Events</h2>
          {upcoming.length === 0 ? (
            <div className="table-wrap" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>No upcoming events 🗓️</div>
          ) : upcoming.map(b => {
            const d = dParts(b.event_date);
            return (
              <div key={b.id} className="ev-card" onClick={() => goTab('bookings')}>
                <div className="ev-date">
                  <div className="ev-day">{d.day}</div>
                  <div className="ev-mon">{d.mon}</div>
                  <div className="ev-dow">{d.dow}</div>
                </div>
                <div className="ev-body">
                  <div className="ev-name">{b.name}</div>
                  <div className="ev-type">{b.event_type}{b.package_snapshot?.name ? ` · ${b.package_snapshot.name}` : ''}</div>
                  {(b.timing_from || b.timing_to) && <div className="ev-line">🕐 {b.timing_from || '?'} — {b.timing_to || '?'}</div>}
                  {b.location && <div className="ev-line">📍 {b.location}</div>}
                  {b.phone && <div className="ev-line">📞 {b.phone}</div>}
                  {b.email && <div className="ev-line">✉️ {b.email}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('active'); // active | history
  const [filter, setFilter] = useState('all'); // all | new | quoted | booked
  const [checked, setChecked] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, [view]);
  async function load() {
    setLoading(true); setChecked([]);
    try {
      const d = view === 'active' ? await api.leads() : await api.leadsHistory();
      setLeads(d.leads || []);
    } catch {}
    finally { setLoading(false); }
  }

  function toggleCheck(id, e) {
    e.stopPropagation();
    setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  async function archiveChecked() {
    if (!checked.length) return;
    if (!confirm(`Archive ${checked.length} lead(s)? You can restore them from History.`)) return;
    try { await api.bulkArchive(checked); setMsg('🗂️ Archived'); setTimeout(() => setMsg(''), 1500); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  async function restore(id, e) {
    e.stopPropagation();
    try { await api.restoreLead(id); load(); } catch {}
  }

  if (sel) return <LeadDetail lead={sel} onBack={() => { setSel(null); load(); }} />;

  // 📊 stat tiles + filtering
  const counts = {
    all: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    quoted: leads.filter(l => l.status === 'quoted').length,
    booked: leads.filter(l => l.status === 'booked').length,
  };
  const shown = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const TILES = [
    ['all', '📋', 'Total Leads'],
    ['new', '🆕', 'New'],
    ['quoted', '📤', 'Packages Sent'],
    ['booked', '✅', 'Booked'],
  ];

  return (
    <div>
      <div className="lead-topbar">
        {view === 'active' ? (
          <div className="lead-stats">
            {TILES.map(([key, icon, label]) => (
              <button key={key} className={`lead-stat ${filter === key ? 'is-on' : ''}`} onClick={() => setFilter(key)}>
                <span className="lead-stat-ic">{icon}</span>
                <span className="lead-stat-val">{counts[key]}</span>
                <span className="lead-stat-lbl">{label}</span>
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="leads-tabs">
          <button className={`refresh ${view === 'active' ? 'is-on' : ''}`} onClick={() => setView('active')}>📋 Active</button>
          <button className={`refresh ${view === 'history' ? 'is-on' : ''}`} onClick={() => setView('history')}>📜 History</button>
        </div>
      </div>

      {(msg || (view === 'active' && checked.length > 0)) && (
        <div className="leads-actions">
          {msg && <span className={`leads-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</span>}
          {view === 'active' && checked.length > 0 && (
            <button className="refresh btn-archive" onClick={archiveChecked}>🗂️ Archive ({checked.length})</button>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>{view === 'active' && <th className="col-check"></th>}<th>Client</th><th>Event</th><th>Date</th><th>Location</th><th>Packages</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="empty">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan="8" className="empty">{view === 'active' ? 'No leads yet. Share your inquiry link! 📨' : 'No archived leads 📜'}</td></tr>
            ) : shown.map(l => (
              <tr key={l.id} onClick={() => view === 'active' && setSel(l)} className={view === 'active' ? 'row-clickable' : ''}>
                {view === 'active' && (
                  <td className="cell-check" onClick={e => toggleCheck(l.id, e)}>
                    <input type="checkbox" readOnly checked={checked.includes(l.id)} className="lead-check" />
                  </td>
                )}
                <td className="biz">{l.name}</td>
                <td>{l.event_type}</td>
                <td>{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
                <td>{l.location || '—'}</td>
                <td>{l.package_name || '—'}</td>
                <td><span className="badge trial">{l.status}</span></td>
                <td>
                  {view === 'active'
                    ? <span className="lead-restore" onClick={e => { e.stopPropagation(); setSel(l); }}>👁️ Open</span>
                    : <span className="lead-restore" onClick={e => restore(l.id, e)}>↩️ Restore</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadDetail({ lead, onBack }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ ...lead });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkgs, setPkgs] = useState([]);
  const [pkgId, setPkgId] = useState(lead.package_id || '');
  const [gateway, setGateway] = useState(!!lead.gateway_enabled);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgMsg, setPkgMsg] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function toggleGateway() {
    const next = !gateway;
    setGateway(next);
    try { await api.setGateway(lead.id, next); setPkgMsg(next ? '🔒 Secure login ON' : '🔓 Secure login OFF'); setTimeout(() => setPkgMsg(''), 1500); }
    catch (e) { setGateway(!next); setPkgMsg('⚠️ ' + e.message); }
  }
  async function sendPackages() {
    setPkgBusy(true); setPkgMsg('');
    try { await api.sendPackages(lead.id); setPkgMsg('✅ Packages sent!'); setTimeout(() => setPkgMsg(''), 2500); }
    catch (e) { setPkgMsg('⚠️ ' + (e.message || 'Failed')); }
    finally { setPkgBusy(false); }
  }

  useEffect(() => {
    api.pkgTemplates().then(d => {
      const all = [];
      (d.templates || []).forEach(t => (t.packages || []).forEach(p => all.push({ ...p, tplName: t.name })));
      setPkgs(all);
    }).catch(() => {});
  }, []);

  async function assignPkg(id) {
    setPkgId(id);
    try {
      await api.assignPackage(lead.id, id || null);
      setMsg('✅ Package updated'); setTimeout(() => setMsg(''), 1500);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  function calcHours(from, to) {
    if (!from || !to) return f.hours || '';
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 1440;
    return (mins / 60).toFixed(1).replace(/\.0$/, '');
  }
  function setTime(k, v) {
    setF(s => {
      const n = { ...s, [k]: v };
      n.hours = calcHours(k === 'timing_from' ? v : s.timing_from, k === 'timing_to' ? v : s.timing_to);
      return n;
    });
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.updateLead(lead.id, {
        ...f, hours: f.hours ? Number(f.hours) : null, guests: f.guests ? Number(f.guests) : null,
      });
      setMsg('✅ Saved'); setEdit(false);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  const yn = (v) => v ? '✅ Yes' : '❌ No';
  const row = (label, value) => (
    <div className="ld-row">
      <div className="ld-label">{label}</div>
      <div>{value || '—'}</div>
    </div>
  );
  const eRow = (label, k, type) => (
    <div className="ld-erow">
      <label className="ld-elabel">{label}</label>
      <input className="ld-input" type={type || 'text'} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} />
    </div>
  );

  // ---- EDIT MODE ----
  if (edit) return (
    <div className="table-wrap ld-wrap">
      <button className="refresh ld-cancel" onClick={() => setEdit(false)}>← Cancel</button>
      <h2 className="ld-h2">✏️ Edit Lead</h2>
      {msg && <div className="ld-msg is-err">{msg}</div>}

      {eRow('👤 Name', 'name')}
      {eRow('📧 Email', 'email')}
      {eRow('📞 Phone', 'phone')}
      {eRow('🎉 Event type', 'event_type')}
      {eRow('📅 Date', 'event_date', 'date')}
      <div className="ld-erow ld-time-row">
        <div className="ld-time-col">
          <label className="ld-elabel">⏰ Start</label>
          <input className="ld-input" type="time" value={f.timing_from || ''} onChange={e => setTime('timing_from', e.target.value)} />
        </div>
        <div className="ld-time-col">
          <label className="ld-elabel">⏰ End</label>
          <input className="ld-input" type="time" value={f.timing_to || ''} onChange={e => setTime('timing_to', e.target.value)} />
        </div>
      </div>
      {row('⏱️ Hours (auto)', f.hours)}
      {eRow('📍 Location', 'location')}
      {eRow('👥 Guests', 'guests', 'number')}

      <div className="ld-check-block">
        <label className="ld-check-lbl">
          <input type="checkbox" checked={!!f.gr_bride} onChange={e => set('gr_bride', e.target.checked)} className="ld-check" />
          💄 Bride — Getting Ready
        </label>
        {f.gr_bride && <input className="ld-input ld-venue" placeholder="Venue (optional)" value={f.gr_bride_venue || ''} onChange={e => set('gr_bride_venue', e.target.value)} />}
      </div>
      <div className="ld-check-block">
        <label className="ld-check-lbl">
          <input type="checkbox" checked={!!f.gr_groom} onChange={e => set('gr_groom', e.target.checked)} className="ld-check" />
          😎 Groom — Getting Ready
        </label>
        {f.gr_groom && <input className="ld-input ld-venue" placeholder="Venue (optional)" value={f.gr_groom_venue || ''} onChange={e => set('gr_groom_venue', e.target.value)} />}
      </div>

      <div className="ld-notes">
        <label className="ld-elabel">📝 Notes</label>
        <textarea className="ld-input ld-textarea" value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
      </div>

      <button className="refresh ld-save" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : '💾 Save changes'}
      </button>
    </div>
  );

  // ---- VIEW MODE ----
  return (
    <div className="ld-view">
      <div className="ld-topbar">
        <button className="refresh" onClick={onBack}>← Back to leads</button>
        <button className="refresh ld-edit-btn" onClick={() => { setF({ ...lead }); setEdit(true); }}>✏️ Edit</button>
      </div>
      <h2 className="ld-h2">{lead.name} · {lead.event_type}</h2>
      {msg && <div className="ld-msg is-ok">{msg}</div>}

      <div className="lead-grid">
      <div className="lead-left">

      {/* 👤 Contact Details */}
      <div className="ld-card">
        <div className="ld-card-h">👤 Contact Details</div>
        {row('📧 Email', lead.email)}
        {row('📞 Phone', lead.phone)}
        {row('📷 Instagram', lead.instagram)}
        {row('🔎 Heard via', lead.heard)}
      </div>

      {/* 🎉 Event Details */}
      <div className="ld-card">
        <div className="ld-card-h">🎉 Event Details</div>
        {row('📅 Date', lead.event_date ? String(lead.event_date).slice(0,10) : null)}
        {row('⏰ Time', lead.timing_from ? `${lead.timing_from} – ${lead.timing_to || '?'}` : null)}
        {row('📍 Location', lead.location)}
        {row('👥 Guests', lead.guests)}
        {row('⏱️ Hours', lead.hours)}
        {row('💄 Bride Getting Ready', `${yn(lead.gr_bride)}${lead.gr_bride_venue ? ' · ' + lead.gr_bride_venue : ''}`)}
        {row('😎 Groom Getting Ready', `${yn(lead.gr_groom)}${lead.gr_groom_venue ? ' · ' + lead.gr_groom_venue : ''}`)}
        {row('📝 Notes', lead.notes)}
      </div>

      </div>

      <div className="lead-right">

      {/* 📦 Packages */}
      <div className="ld-card">
        <div className="ld-card-h">📦 Packages</div>
        <select className="ld-select ld-pkg-select" value={pkgId} onChange={e => assignPkg(e.target.value)}>
          <option value="">— No package —</option>
          {pkgs.map(p => <option key={p.id} value={p.id}>{p.tplName} → {p.name} (${Number(p.base_price).toFixed(0)})</option>)}
        </select>
        <div className="ld-btn-row">
          <button className="refresh bx-primary" onClick={sendPackages} disabled={pkgBusy}>{pkgBusy ? 'Sending…' : '📤 Send Packages'}</button>
          <button className={`refresh ld-gate ${gateway ? 'is-on' : ''}`} onClick={toggleGateway}>🔒 Secure Login {gateway ? 'ON' : 'OFF'}</button>
        </div>
        {pkgMsg && <div className={`ld-msg ${pkgMsg[0] === '⚠' ? 'is-err' : 'is-ok'} ld-msg-mt`}>{pkgMsg}</div>}
      </div>

      {/* 💰 Payment */}
      <MoneySection lead={lead} />

      {/* 📄 Contract (view only) */}
      <ContractsBox lead={lead} />

      </div>
      </div>
    </div>
  );
}

function ContractsBox({ lead }) {
  const [list, setList] = useState([]);
  const [tpls, setTpls] = useState([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Service Agreement');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9, width: '100%' };

  useEffect(() => {
    load();
    api.ctTemplates().then(d => setTpls(d.templates || [])).catch(() => {});
  }, []);
  async function load() {
    try { const d = await api.leadContracts(lead.id); setList(d.contracts || []); } catch {}
  }
  async function create() {
    if (!body.trim()) return setMsg('⚠️ Contract text required');
    setBusy(true); setMsg('');
    try {
      await api.createContract(lead.id, title, body);
      setMsg('✅ Contract created'); setBody(''); setOpen(false); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function voidCt(id) {
    if (!confirm('Delete this contract?')) return;
    try { await api.voidContract(id); load(); } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function copyLink(token) {
    navigator.clipboard?.writeText(`https://alphabetaone.com/sign/${token}`);
    setMsg('🔗 Link copied!'); setTimeout(() => setMsg(''), 1500);
  }

  const S = { draft: '📝', sent: '📨', signed: '✅', void: '🚫' };
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>📄 Contracts</h3>
        <button className="refresh" onClick={() => setOpen(!open)}>{open ? '✕ Cancel' : '+ New contract'}</button>
      </div>
      {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg[0] === '⚠' ? '#fb7185' : '#4ade80' }}>{msg}</div>}

      {open && (
        <div style={{ marginTop: 10 }}>
          {tpls.length > 0 && (
            <select style={{ ...box, marginBottom: 8 }} defaultValue=""
              onChange={async e => {
                if (!e.target.value) return;
                setBusy(true); setMsg('');
                try { await api.createContractFromTemplate(lead.id, Number(e.target.value)); setMsg('✅ Contract created from template'); setOpen(false); load(); }
                catch (er) { setMsg('⚠️ ' + er.message); }
                finally { setBusy(false); }
              }}>
              <option value="">📑 Use a template… (auto-fills client info)</option>
              {tpls.map(t => <option key={t.id} value={t.id}>{t.name}{t.event_type ? ` (${t.event_type})` : ''}</option>)}
            </select>
          )}
          <input style={box} value={title} onChange={e => setTitle(e.target.value)} placeholder="Contract title" />
          <textarea style={{ ...box, minHeight: 140, marginTop: 8 }} value={body} onChange={e => setBody(e.target.value)}
            placeholder={`Write your agreement terms here…\n\ne.g. Coverage: ${lead.hours || 8} hours on ${lead.event_date ? String(lead.event_date).slice(0,10) : 'event date'}…`} />
          <button className="refresh" onClick={create} disabled={busy} style={{ marginTop: 8, background: '#2dd4bf', color: '#06231f' }}>
            {busy ? 'Creating…' : '📄 Create & get signing link'}
          </button>
        </div>
      )}

      {list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {list.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}>
              <span>{S[c.status]} <b>{c.title}</b> · {c.status}{c.signed_name ? ` by ${c.signed_name}` : ''}</span>
              <span style={{ display: 'flex', gap: 10 }}>
                {c.status !== 'signed' && <span style={{ cursor: 'pointer', color: '#2dd4bf' }} onClick={() => copyLink(c.token)}>🔗 Copy link</span>}
                {c.status === 'signed' && <span style={{ color: '#4ade80' }}>{String(c.signed_at).slice(0, 10)}</span>}
                {c.status !== 'signed' && <span style={{ cursor: 'pointer' }} onClick={() => voidCt(c.id)}>🗑️</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'completed', 'cancelled'];
const S_ICON = { new: '🆕', contacted: '📞', quoted: '💬', booked: '✅', completed: '🏁', cancelled: '❌' };

function MoneySection({ lead }) {
  const [data, setData] = useState(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('manual');
  const [money, setMoney] = useState({ deposit_percent: lead.deposit_percent ?? 30, discount_percent: lead.discount_percent ?? 0, price_override: lead.price_override ?? '' });
  const [status, setStatus] = useState(lead.status || 'new');
  const [msg, setMsg] = useState('');
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8 };

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await api.leadPayments(lead.id); setData(d); } catch {}
  }
  async function saveMoney() {
    try {
      const d = await api.saveMoney(lead.id, {
        deposit_percent: Number(money.deposit_percent) || 0,
        discount_percent: Number(money.discount_percent) || 0,
        price_override: money.price_override === '' ? null : Number(money.price_override),
      });
      setData(s => ({ ...s, summary: d.summary }));
      setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function pay() {
    if (!amt || Number(amt) <= 0) return;
    try { const d = await api.addPayment(lead.id, Number(amt), method); setData(d); setAmt(''); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delPay(id) {
    if (!confirm('Remove this payment?')) return;
    try { await api.deletePayment(id); load(); } catch {}
  }
  async function changeStatus(s) {
    setStatus(s);
    try { await api.setLeadStatus(lead.id, s); setMsg('✅ Status: ' + s); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  const sum = data?.summary;
  return (
    <div className="ms-wrap">
      {/* Status */}
      <div className="ms-status">
        {STATUSES.map(s => (
          <button key={s} className={`refresh ms-status-btn ${status === s ? 'is-on' : ''}`} onClick={() => changeStatus(s)}>
            {S_ICON[s]} {s}
          </button>
        ))}
      </div>
      {msg && <div className={`ms-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</div>}

      <h3 className="ms-h3">💰 Money</h3>
      <div className="ms-fields">
        <div className="ms-field">
          <label className="ms-label">Price override ($)</label>
          <input className="ms-input" type="number" placeholder="auto from package"
            value={money.price_override} onChange={e => setMoney({ ...money, price_override: e.target.value })} onBlur={saveMoney} />
        </div>
        <div className="ms-field">
          <label className="ms-label">Discount %</label>
          <input className="ms-input" type="number"
            value={money.discount_percent} onChange={e => setMoney({ ...money, discount_percent: e.target.value })} onBlur={saveMoney} />
        </div>
        <div className="ms-field">
          <label className="ms-label">Deposit %</label>
          <input className="ms-input" type="number"
            value={money.deposit_percent} onChange={e => setMoney({ ...money, deposit_percent: e.target.value })} onBlur={saveMoney} />
        </div>
      </div>

      {sum && (
        <div className="ms-summary">
          <span className="ms-chip">💵 Total: <b>${sum.final_total}</b>{sum.discount_amount > 0 && <s className="ms-strike">${sum.base_total}</s>}</span>
          <span className="ms-chip">🔐 Deposit: <b>${sum.deposit_amount}</b></span>
          <span className="ms-chip ms-chip-paid">✅ Paid: <b>${sum.paid}</b></span>
          <span className={`ms-chip ${sum.balance > 0 ? 'ms-chip-due' : 'ms-chip-paid'}`}>⏳ Balance: <b>${sum.balance}</b></span>
        </div>
      )}

      <div className="ms-pay-row">
        <input className="ms-input ms-amt" type="number" placeholder="Amount $" value={amt} onChange={e => setAmt(e.target.value)} />
        <select className="ms-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="manual">Manual</option><option value="etransfer">E-transfer</option>
          <option value="cash">Cash</option><option value="card">Card</option>
        </select>
        <button className="refresh bx-primary" onClick={pay}>+ Record payment</button>
      </div>

      {data?.payments?.length > 0 && (
        <div className="ms-pay-list">
          {data.payments.map(p => (
            <div key={p.id} className="ms-pay-item">
              <span>💵 ${Number(p.amount).toFixed(2)} · {p.method} · {String(p.paid_at).slice(0, 10)}</span>
              <span className="bx-del" onClick={() => delPay(p.id)}>🗑️</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractsTab() {
  const [sub, setSub] = useState('list'); // list | setup | invoices
  const btn = (k, label) => (
    <button className={`refresh ct-tab ${sub === k ? 'is-on' : ''}`} onClick={() => setSub(k)}>{label}</button>
  );
  return (
    <div className="ct-wrap">
      <div className="ct-tabs">
        {btn('list', '📄 Contracts')}
        {btn('setup', '🛠️ Contract setup')}
        {btn('invoices', '🧾 Invoices')}
      </div>
      {sub === 'list' ? <AllContracts /> : sub === 'setup' ? <ContractSetup /> : <AllInvoices />}
    </div>
  );
}

function AllInvoices() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.allInvoices().then(d => setList(d.invoices || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  function copyLink(token) {
    navigator.clipboard?.writeText(`https://alphabetaone.com/invoice/${token}`);
  }
  if (loading) return <div className="loading">Loading…</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan="6" className="empty">No invoices yet. Generate one from a lead 🧾</td></tr>
          ) : list.map(i => (
            <tr key={i.id}>
              <td className="biz">{i.invoice_number}</td>
              <td>{i.client_name}</td>
              <td>${Number(i.total).toFixed(2)}</td>
              <td className="ct-paid">${Number(i.paid).toFixed(2)}</td>
              <td className={Number(i.balance) > 0 ? 'ct-due' : 'ct-paid'}>${Number(i.balance).toFixed(2)}</td>
              <td><span className="ct-link" onClick={() => copyLink(i.token)}>🔗 Copy link</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllContracts() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const S = { draft: '📝', sent: '📨', signed: '✅', void: '🚫' };
  useEffect(() => {
    api.allContracts().then(d => setList(d.contracts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  function copyLink(token) {
    navigator.clipboard?.writeText(`https://alphabetaone.com/sign/${token}`);
  }
  if (loading) return <div className="loading">Loading…</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Contract</th><th>Status</th><th>Signed</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan="5" className="empty">No contracts yet. Create one from a lead, or set up templates in 🛠️ Contract setup.</td></tr>
          ) : list.map(c => (
            <tr key={c.id}>
              <td className="biz">{c.client_name}</td>
              <td>{c.title}</td>
              <td>{S[c.status]} {c.status}</td>
              <td>{c.signed_at ? String(c.signed_at).slice(0, 10) : '—'}</td>
              <td>{c.status !== 'signed'
                ? <span className="ct-link" onClick={() => copyLink(c.token)}>🔗 Copy link</span>
                : <a href={`/certificate/${c.token}`} target="_blank" rel="noreferrer" className="ct-cert">📜 Certificate</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CT_PLACEHOLDERS = ['{{client_name}}', '{{client_email}}', '{{event_type}}', '{{event_date}}', '{{location}}', '{{hours}}', '{{guests}}', '{{package_name}}', '{{total_cost}}', '{{deposit}}', '{{balance}}', '{{today_date}}', '{{company_name}}'];

function ContractSetup() {
  const [tpls, setTpls] = useState([]);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await api.ctTemplates(); setTpls(d.templates || []); } catch {}
  }
  async function add() {
    try {
      const d = await api.addCtTemplate({ name: 'New Contract', body: 'This agreement is between {{company_name}} and {{client_name}} for {{event_type}} on {{event_date}}.\n\nTotal: {{total_cost}} · Deposit: {{deposit}}\n\nI agree to the cancellation policy. [INITIAL]\n\nI agree to the payment schedule. [INITIAL]' });
      setSel(d.template); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function save() {
    if (!sel) return;
    setMsg('');
    try { await api.updateCtTemplate(sel.id, sel); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function del(id) {
    if (!confirm('Delete this template?')) return;
    try { await api.deleteCtTemplate(id); setSel(null); load(); } catch {}
  }
  function insertAt(txt) {
    setSel(s => ({ ...s, body: (s.body || '') + ' ' + txt }));
  }

  if (sel) return (
    <div className="table-wrap cs-edit">
      <div className="cs-edit-top">
        <button className="refresh" onClick={() => setSel(null)}>← All templates</button>
        <div className="cs-edit-actions">
          {msg && <span className={`cs-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</span>}
          <button className="refresh" onClick={() => del(sel.id)}>🗑️</button>
        </div>
      </div>

      <label className="cs-label">Template name</label>
      <input className="cs-input" value={sel.name || ''} onChange={e => setSel({ ...sel, name: e.target.value })} />

      <label className="cs-label cs-label-mt">Event type (optional, e.g. Wedding)</label>
      <input className="cs-input" value={sel.event_type || ''} onChange={e => setSel({ ...sel, event_type: e.target.value })} />

      <label className="cs-label cs-label-mt">Header (optional)</label>
      <textarea className="cs-input cs-ta-sm" value={sel.header || ''} onChange={e => setSel({ ...sel, header: e.target.value })} />

      <label className="cs-label cs-label-mt">Contract body ✍️</label>
      <div className="cs-chips">
        {CT_PLACEHOLDERS.map(p => (
          <span key={p} className="cs-chip" onClick={() => insertAt(p)}>{p}</span>
        ))}
        <span className="cs-chip cs-chip-init" onClick={() => insertAt('[INITIAL]')}>✍️ [INITIAL] box</span>
      </div>
      <textarea className="cs-input cs-ta-lg" value={sel.body || ''} onChange={e => setSel({ ...sel, body: e.target.value })} />

      <label className="cs-label cs-label-mt">Legal terms (optional)</label>
      <textarea className="cs-input cs-ta-md" value={sel.legal_terms || ''} onChange={e => setSel({ ...sel, legal_terms: e.target.value })} />

      <button className="refresh cs-save" onClick={save}>💾 Save template</button>
    </div>
  );

  return (
    <div>
      <div className="cs-head">
        <div className="cs-hint">🛠️ Build your own contracts — placeholders auto-fill, [INITIAL] adds tap-to-initial boxes</div>
        <button className="refresh cs-new" onClick={add}>+ New template</button>
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div className="cs-grid">
        {tpls.length === 0 && <div className="cs-empty">No templates yet — create one 👆</div>}
        {tpls.map(t => (
          <div key={t.id} className="table-wrap cs-card" onClick={() => setSel(t)}>
            <div className="cs-card-ic">📑</div>
            <div className="cs-card-name">{t.name}</div>
            <div className="cs-card-meta">{t.event_type || 'Any event'} · {(t.body.match(/\[INITIAL\]/g) || []).length} initials</div>
          </div>
        ))}
      </div>
    </div>
  );
}


function BookingsView() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('list'); // list | calendar
  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Loading…</div>;

  const now = new Date();
  const inMonth = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const inYear = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getFullYear() === now.getFullYear(); }).length;
  const nextYear = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getFullYear() === now.getFullYear() + 1; }).length;

  return (
    <div>
      <div className="bk-topbar">
        <div className="bk-stats">
          <div className="bk-stat"><span className="bk-stat-val">{inMonth}</span><span className="bk-stat-lbl">This Month</span></div>
          <div className="bk-stat"><span className="bk-stat-val">{inYear}</span><span className="bk-stat-lbl">This Year</span></div>
          <div className="bk-stat"><span className="bk-stat-val">{nextYear}</span><span className="bk-stat-lbl">Next Year</span></div>
        </div>
        <div className="bk-toggle">
          <button className={`bk-tog-btn ${mode === 'list' ? 'is-on' : ''}`} onClick={() => setMode('list')}>📋 List</button>
          <button className={`bk-tog-btn ${mode === 'calendar' ? 'is-on' : ''}`} onClick={() => setMode('calendar')}>🗓️ Calendar</button>
        </div>
      </div>

      {mode === 'calendar' ? <CalendarView /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Event</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan="6" className="empty">No bookings yet. Set a lead's status to ✅ booked!</td></tr>
              ) : bookings.map(b => (
                <tr key={b.id}>
                  <td className="biz">{b.name}</td>
                  <td>{b.event_type}</td>
                  <td>{b.event_date ? String(b.event_date).slice(0, 10) : '—'}</td>
                  <td>${b.money?.final_total ?? 0}</td>
                  <td className="bk-paid">${b.money?.paid ?? 0}</td>
                  <td className={b.money?.balance > 0 ? 'bk-due' : 'bk-paid'}>${b.money?.balance ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 🏗️ Section 2 custom field builder
const FIELD_TYPES = [
  { t: 'dropdown', label: '📋 Dropdown' },
  { t: 'text', label: '✏️ Text' },
  { t: 'date', label: '📅 Date' },
  { t: 'time', label: '🕐 Time' },
  { t: 'location', label: '📍 Location' },
  { t: 'checkbox', label: '☑️ Checkbox' },
];

function FieldBuilder({ fields, setFields }) {
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, width: '100%', fontSize: 13 };
  const uid = () => 'f' + Math.random().toString(36).slice(2, 8);

  const add = (t) => setFields([...fields, { id: uid(), type: t, label: '', required: false, options: t === 'dropdown' ? ['Option 1'] : [] }]);
  const upd = (i, patch) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const del = (i) => setFields(fields.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return;
    const copy = [...fields]; [copy[i], copy[j]] = [copy[j], copy[i]]; setFields(copy);
  };

  return (
    <div>
      {/* add field buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FIELD_TYPES.map(ft => (
          <button key={ft.t} className="refresh" onClick={() => add(ft.t)} style={{ padding: '6px 11px', fontSize: 12 }}>+ {ft.label}</button>
        ))}
      </div>

      {fields.length === 0 && <p className="sub">No custom fields yet. Add fields above ☝️</p>}

      {/* field list */}
      {fields.map((f, i) => (
        <div key={f.id} style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{FIELD_TYPES.find(x => x.t === f.type)?.label}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button className="refresh" onClick={() => move(i, -1)} style={{ padding: '3px 8px', fontSize: 11 }}>↑</button>
              <button className="refresh" onClick={() => move(i, 1)} style={{ padding: '3px 8px', fontSize: 11 }}>↓</button>
              <button className="refresh" onClick={() => del(i)} style={{ padding: '3px 8px', fontSize: 11, color: '#fb7185' }}>🗑️</button>
            </div>
          </div>

          <input style={box} placeholder="Field label (e.g. Event Type)" value={f.label} onChange={e => upd(i, { label: e.target.value })} />

          {/* dropdown options */}
          {f.type === 'dropdown' && (
            <div style={{ marginTop: 8 }}>
              {f.options.map((opt, oi) => (
                <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                  <input style={{ ...box, fontSize: 12 }} value={opt} onChange={e => upd(i, { options: f.options.map((o, x) => x === oi ? e.target.value : o) })} />
                  <button className="refresh" onClick={() => upd(i, { options: f.options.filter((_, x) => x !== oi) })} style={{ padding: '4px 9px', fontSize: 11 }}>✕</button>
                </div>
              ))}
              <button className="refresh" onClick={() => upd(i, { options: [...f.options, 'Option ' + (f.options.length + 1)] })} style={{ padding: '4px 10px', fontSize: 11 }}>+ option</button>
            </div>
          )}

          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input type="checkbox" checked={f.required} onChange={e => upd(i, { required: e.target.checked })} /> Required
          </label>
        </div>
      ))}
    </div>
  );
}

function InqFormSettings({ user }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9, width: '100%' };

  useEffect(() => {
    api.inquirySettings(user?.vendor_id).then(d => setS(d.settings)).catch(() => {});
  }, []);

  async function save() {
    setMsg('');
    setSaving(true);
    try { await api.saveInquirySettings(s); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 2500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    setSaving(false);
  }
  if (!s) return <div className="loading">Loading…</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🎨 Customize your inquiry form {msg && <span style={{ fontSize: 13, color: '#4ade80' }}>{msg}</span>}</h2>
        <p className="sub" style={{ marginBottom: 14 }}>Your link: <b style={{ color: '#2dd4bf' }}>alphabetaone.com/inquiry/{user?.vendor_id}</b> 🔗</p>

        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Brand name</label>
        <input style={box} value={s.brand_name || ''} onChange={e => setS({ ...s, brand_name: e.target.value })} />

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>Brand color</label>
            <input type="color" value={s.brand_color} onChange={e => setS({ ...s, brand_color: e.target.value })}
              style={{ width: 60, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Background watermark</label>
            <select style={box} value={s.background || 'none'} onChange={e => setS({ ...s, background: e.target.value })}>
              {Object.entries(PROFESSIONS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
        </div>

        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 12 }}>Intro text</label>
        <input style={box} value={s.intro_text || ''} onChange={e => setS({ ...s, intro_text: e.target.value })} />

        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 10 }}>Intro link (optional — makes intro clickable) 🔗</label>
        <input style={box} value={s.intro_link || ''} placeholder="https://yoursite.com" onChange={e => setS({ ...s, intro_link: e.target.value })} />

        {/* 🎨 Theme + font */}
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Theme</label>
            <select style={box} value={s.theme || 'classic'} onChange={e => setS({ ...s, theme: e.target.value })}>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="elegant">Elegant</option>
              <option value="bold">Bold</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Font</label>
            <select style={box} value={s.font || 'Inter'} onChange={e => setS({ ...s, font: e.target.value })}>
              <option value="Inter">Inter</option>
              <option value="Poppins">Poppins</option>
              <option value="Playfair Display">Playfair</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Lora">Lora</option>
            </select>
          </div>
        </div>

        {/* 🏗️ Section 2 builder */}
        <div style={{ borderTop: '1px solid var(--line)', margin: '20px 0 14px', paddingTop: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Section 2 heading</label>
          <input style={box} value={s.details_heading || ''} placeholder="Event Details" onChange={e => setS({ ...s, details_heading: e.target.value })} />
          <h3 style={{ margin: '16px 0 4px' }}>🏗️ Inquiry Details fields</h3>
          <p className="sub" style={{ marginBottom: 12 }}>Build your custom questions ⬇️</p>
          <FieldBuilder fields={s.custom_fields || []} setFields={(f) => setS({ ...s, custom_fields: f })} />
        </div>

        <button className="refresh" onClick={save} disabled={saving} style={{ marginTop: 16, width: '100%', background: '#2dd4bf', color: '#06231f' }}>
          {saving ? '⏳ Saving…' : msg || '💾 Save form settings'}
        </button>
      </div>
    </div>
  );
}

function PackagesView() {
  const [tpls, setTpls] = useState([]);
  const [selTpl, setSelTpl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9 };

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const d = await api.pkgTemplates();
      setTpls(d.templates || []);
      if (selTpl) {
        const upd = (d.templates || []).find(t => t.id === selTpl.id);
        setSelTpl(upd || null);
      }
    } catch {}
    finally { setLoading(false); }
  }
  async function addTpl() {
    setMsg('');
    try { await api.addTemplate('New Event'); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delTpl(id) {
    if (!confirm('Delete this template and its packages?')) return;
    try { await api.deleteTemplate(id); setSelTpl(null); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function addPkg(tplId) {
    setMsg('');
    try { await api.addVendorPackage('New Package', tplId); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delPkg(id) {
    if (!confirm('Delete this package?')) return;
    try { await api.deleteVendorPackage(id); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  if (loading) return <div className="loading">Loading…</div>;

  // ---- INSIDE A TEMPLATE ----
  if (selTpl) return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button className="refresh" onClick={() => setSelTpl(null)}>← All templates</button>
        {selTpl.packages.length < 3 && (
          <button className="refresh" onClick={() => addPkg(selTpl.id)} style={{ background: '#2dd4bf', color: '#06231f' }}>+ Add Package</button>
        )}
      </div>
      <h2 style={{ margin: '0 0 12px' }}>📁 {selTpl.name}</h2>
      {msg && <div className="err-banner">{msg}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {selTpl.packages.length === 0 && <div style={{ color: 'var(--muted)' }}>No packages yet — add one 👆</div>}
        {selTpl.packages.map(p => <PkgCard key={p.id} pkg={p} onSaved={load} onDelete={() => delPkg(p.id)} />)}
      </div>
    </div>
  );

  // ---- TEMPLATE LIST ----
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>📁 Up to 6 event templates · 📦 3 packages each</div>
        {tpls.length < 6 && <button className="refresh" onClick={addTpl} style={{ background: '#2dd4bf', color: '#06231f' }}>+ Add Template</button>}
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {tpls.map(t => (
          <div key={t.id} className="table-wrap" style={{ padding: 18, cursor: 'pointer', position: 'relative' }} onClick={() => setSelTpl(t)}>
            <div style={{ fontSize: 30 }}>📁</div>
            <TplName tpl={t} onSaved={load} />
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>📦 {t.packages.length}/3 packages</div>
            {tpls.length > 1 && (
              <button className="refresh" style={{ position: 'absolute', top: 10, right: 10, padding: '3px 8px' }}
                onClick={e => { e.stopPropagation(); delTpl(t.id); }}>🗑️</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TplName({ tpl, onSaved }) {
  const [name, setName] = useState(tpl.name);
  async function save() {
    if (name !== tpl.name && name.trim()) {
      try { await api.renameTemplate(tpl.id, name.trim()); onSaved && onSaved(); } catch {}
    }
  }
  return (
    <input value={name} onClick={e => e.stopPropagation()} onChange={e => setName(e.target.value)} onBlur={save}
      style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 700, fontSize: 15, width: '100%', marginTop: 6, outline: 'none' }} />
  );
}

function PkgCard({ pkg, onSaved, onDelete }) {
  const [f, setF] = useState({
    name: pkg.name, base_price: pkg.base_price, included_hours: pkg.included_hours,
    per_hour_price: pkg.per_hour_price,
    inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions : [],
  });
  const [newInc, setNewInc] = useState('');
  const [saved, setSaved] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9, width: '100%' };

  async function save() {
    setSaved('');
    try {
      await api.updateVendorPackage(pkg.id, {
        ...f, base_price: Number(f.base_price) || 0,
        included_hours: Number(f.included_hours) || 0,
        per_hour_price: Number(f.per_hour_price) || 0,
      });
      setSaved('✅ Saved'); setTimeout(() => setSaved(''), 1500);
      onSaved && onSaved();
    } catch (e) { setSaved('⚠️ ' + e.message); }
  }
  function addInc() {
    if (!newInc.trim()) return;
    set('inclusions', [...f.inclusions, newInc.trim()]);
    setNewInc('');
  }
  function rmInc(i) { set('inclusions', f.inclusions.filter((_, x) => x !== i)); }

  return (
    <div className="table-wrap" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <input style={{ ...box, width: '55%', fontWeight: 700, fontSize: 16 }} value={f.name} onChange={e => set('name', e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pkg.is_default && <span className="badge active">Default</span>}
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>{saved}</span>}
          {!pkg.is_default && <button className="refresh" onClick={onDelete}>🗑️</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>💰 Base price ($)</label>
          <input style={box} type="number" value={f.base_price} onChange={e => set('base_price', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>⏱️ Included hours</label>
          <input style={box} type="number" value={f.included_hours} onChange={e => set('included_hours', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>➕ Extra $/hour</label>
          <input style={box} type="number" value={f.per_hour_price} onChange={e => set('per_hour_price', e.target.value)} />
        </div>
      </div>

      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 12 }}>📝 Inclusions (your own items)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
        {f.inclusions.map((inc, i) => (
          <span key={i} style={{ background: '#2dd4bf18', border: '1px solid #2dd4bf44', color: '#2dd4bf', padding: '4px 10px', borderRadius: 16, fontSize: 12 }}>
            {inc} <span style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => rmInc(i)}>✕</span>
          </span>
        ))}
        {f.inclusions.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No items yet — add below 👇</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={box} placeholder="e.g. 8x10 prints, 2 photographers…" value={newInc}
          onChange={e => setNewInc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addInc()} />
        <button className="refresh" onClick={addInc}>+ Add</button>
      </div>

      <button className="refresh" onClick={save} style={{ marginTop: 14, width: '100%', background: '#2dd4bf', color: '#06231f' }}>💾 Save package</button>
    </div>
  );
}

function SettingsView({ user }) {
  const [s, setS] = useState(null);
  const [sub, setSub] = useState('prefs'); // prefs | account | email
  const [prof, setProf] = useState(null);
  const [profMsg, setProfMsg] = useState('');
  const [saved, setSaved] = useState('');
  const [em, setEm] = useState({ email: user?.email || '', password: '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.mySettings().then(d => {
      setS(d.settings || { time_format: '12h', theme: 'dark', timezone: guessTz() });
    }).catch(() => setS({ time_format: '12h', theme: 'dark', timezone: guessTz() }));
    api.myProfile().then(d => setProf(d.profile || {})).catch(() => setProf({}));
  }, []);

  async function saveProfile() {
    setProfMsg('⏳ Saving…');
    try { await api.saveProfile(prof); setProfMsg('✅ Saved'); setTimeout(() => setProfMsg(''), 2000); }
    catch (e) { setProfMsg('⚠️ ' + e.message); }
  }
  async function onLogoPick(e) {
    const f = e.target.files[0]; if (!f) return;
    setProfMsg('⏳ Uploading…');
    try { const r = await api.uploadLogo(f); setProf(v => ({ ...v, logo_path: r.logo_path })); setProfMsg('✅ Logo updated'); setTimeout(() => setProfMsg(''), 2000); }
    catch (err) { setProfMsg('⚠️ ' + err.message); }
  }
  function guessTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Vancouver'; } }

  async function savePrefs(next) {
    setS(next); setSaved('');
    // 🌗 apply theme live + persist
    if (next.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('vf_theme', next.theme || 'dark');
    try { await api.saveSettings(next); setSaved('✅ Saved'); setTimeout(() => setSaved(''), 1500); } catch {}
  }
  async function saveEmail() {
    setMsg('');
    try { await api.changeEmail(em.email, em.password); setMsg('✅ Email updated'); setEm({ ...em, password: '' }); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function savePw() {
    setMsg('');
    try { await api.changePassword(pw.current, pw.next); setMsg('✅ Password changed'); setPw({ current: '', next: '' }); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  if (!s) return <div className="loading">Loading…</div>;
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 10, width: '100%', marginTop: 6 };

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['prefs', '🕐 Preferences'], ['account', '🔐 Account'], ['email', '📧 Email']].map(([k, label]) => (
          <button key={k} className="refresh" onClick={() => setSub(k)}
            style={{ background: sub === k ? '#2dd4bf' : 'var(--panel-2)', color: sub === k ? '#06231f' : 'var(--text)' }}>{label}</button>
        ))}
      </div>

      {/* Preferences */}
      {sub === 'prefs' && (
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🕐 Preferences {saved && <span style={{ fontSize: 13, color: '#4ade80' }}>{saved}</span>}</h2>

        <label style={{ fontSize: 13, color: '#9fb3b0' }}>Time format</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {['12h', '24h'].map(t => (
            <button key={t} onClick={() => savePrefs({ ...s, time_format: t })}
              className="refresh" style={{ flex: 1, background: s.time_format === t ? '#2dd4bf' : 'var(--panel-2)', color: s.time_format === t ? '#06231f' : 'var(--text)' }}>
              {t === '12h' ? '12-hour (2:30 PM)' : '24-hour (14:30)'}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 14 }}>Theme</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {['dark', 'light'].map(t => (
            <button key={t} onClick={() => savePrefs({ ...s, theme: t })}
              className="refresh" style={{ flex: 1, background: s.theme === t ? '#2dd4bf' : 'var(--panel-2)', color: s.theme === t ? '#06231f' : 'var(--text)' }}>
              {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 14 }}>Timezone</label>
        <input style={box} value={s.timezone || ''} onChange={e => setS({ ...s, timezone: e.target.value })}
          onBlur={() => savePrefs(s)} />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>🌍 Auto-detected from your location</div>
      </div>
      )}

      {/* Account */}
      {sub === 'account' && (
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🏢 Business Profile</h2>
        {profMsg && <div style={{ fontSize: 13, color: profMsg[0] === '✅' ? '#4ade80' : 'var(--muted)', marginBottom: 10 }}>{profMsg}</div>}

        {/* logo — single source, updates everywhere */}
        <label style={{ fontSize: 13, color: '#9fb3b0' }}>Logo 🖼️</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 14px' }}>
          {prof?.logo_path && <img src={`/api/me/logo/${prof.logo_path}`} alt="logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)' }} />}
          <label className="refresh" style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
            📤 Upload logo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogoPick} />
          </label>
        </div>

        <label style={{ fontSize: 13, color: '#9fb3b0' }}>Company name</label>
        <input style={box} value={prof?.business_name || ''} onChange={e => setProf({ ...prof, business_name: e.target.value })} />
        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 10 }}>Phone</label>
        <input style={box} value={prof?.phone || ''} onChange={e => setProf({ ...prof, phone: e.target.value })} />
        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 10 }}>Business email</label>
        <input style={box} value={prof?.email || ''} onChange={e => setProf({ ...prof, email: e.target.value })} />
        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 10 }}>Country</label>
        <input style={box} value={prof?.country || ''} onChange={e => setProf({ ...prof, country: e.target.value })} />
        <button className="refresh" onClick={saveProfile} style={{ marginTop: 12, background: '#2dd4bf', color: '#06231f' }}>💾 Save profile</button>

        <h2 style={{ marginTop: 26 }}>🔐 Account</h2>
        {msg && <div style={{ padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13, background: msg[0] === '✅' ? '#4ade8018' : '#fb718518', color: msg[0] === '✅' ? '#4ade80' : '#fb7185' }}>{msg}</div>}

        <label style={{ fontSize: 13, color: '#9fb3b0' }}>📧 Change email</label>
        <input style={box} value={em.email} onChange={e => setEm({ ...em, email: e.target.value })} placeholder="new@email.com" />
        <input style={box} type="password" value={em.password} onChange={e => setEm({ ...em, password: e.target.value })} placeholder="Current password" />
        <button className="refresh" onClick={saveEmail} style={{ marginTop: 8 }}>Update email</button>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 18 }}>🔑 Change password</label>
        <input style={box} type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} placeholder="Current password" />
        <input style={box} type="password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} placeholder="New password (min 6)" />
        <button className="refresh" onClick={savePw} style={{ marginTop: 8 }}>Change password</button>
      </div>
      )}

      {sub === 'email' && <EmailSetup />}
    </div>
  );
}

function EmailSetup() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 10, width: '100%', marginTop: 6 };

  useEffect(() => {
    api.emailSettings().then(d => setS(d.settings)).catch(() => setS({ mode: 'platform' }));
  }, []);

  async function save() {
    setMsg('');
    try { await api.saveEmailSettings(s); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  if (!s) return null;
  const MODES = [
    ['smtp', '🔧 My own SMTP'],
    ['self', '📥 Self-receive (reply from my inbox)'],
    ['platform', '🏢 Platform email (noreply)'],
  ];

  return (
    <div className="table-wrap" style={{ padding: 22 }}>
      <h2 style={{ marginTop: 0 }}>📧 Email sending {msg && <span style={{ fontSize: 13, color: '#4ade80' }}>{msg}</span>}</h2>

      <label style={{ fontSize: 13, color: '#9fb3b0' }}>How do you want to email clients?</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {MODES.map(([m, label]) => (
          <button key={m} className="refresh" onClick={() => setS({ ...s, mode: m })}
            style={{ textAlign: 'left', background: s.mode === m ? '#2dd4bf' : 'var(--panel-2)', color: s.mode === m ? '#06231f' : 'var(--text)' }}>
            {label}
          </button>
        ))}
      </div>

      {s.mode === 'smtp' && (
        <div style={{ marginTop: 12 }}>
          <input style={box} placeholder="SMTP host (e.g. smtp.gmail.com)" value={s.smtp_host || ''} onChange={e => setS({ ...s, smtp_host: e.target.value })} />
          <input style={box} type="number" placeholder="Port (587)" value={s.smtp_port || 587} onChange={e => setS({ ...s, smtp_port: Number(e.target.value) })} />
          <input style={box} placeholder="SMTP username" value={s.smtp_user || ''} onChange={e => setS({ ...s, smtp_user: e.target.value })} />
          <input style={box} type="password" placeholder="SMTP password" value={s.smtp_pass || ''} onChange={e => setS({ ...s, smtp_pass: e.target.value })} />
          <input style={box} placeholder="From name (e.g. Sunny Studios)" value={s.from_name || ''} onChange={e => setS({ ...s, from_name: e.target.value })} />
          <input style={box} placeholder="From email" value={s.from_email || ''} onChange={e => setS({ ...s, from_email: e.target.value })} />
        </div>
      )}

      <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 14 }}>📬 New-lead alerts go to</label>
      <input style={box} placeholder="you@email.com" value={s.notify_email || ''} onChange={e => setS({ ...s, notify_email: e.target.value })} />

      <button className="refresh" onClick={save} style={{ marginTop: 14, width: '100%', background: '#2dd4bf', color: '#06231f' }}>💾 Save email settings</button>
    </div>
  );
}

function ReferForm({ user }) {
  const [friend, setFriend] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setMsg(''); setErr('');
    if (!friend) return setErr('Enter your friend\'s email');
    setBusy(true);
    try {
      await api.createReferral(user?.email || '', friend);
      setMsg(`🎉 Invite sent to ${friend}! You'll both get a free month when they join on a paid plan.`);
      setFriend('');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="table-wrap" style={{ padding: 24, maxWidth: 520 }}>
      <h2 style={{ marginTop: 0 }}>👥 Refer a friend, both get a free month 🎁</h2>
      <p className="sub" style={{ marginBottom: 16 }}>
        Enter their email. When they sign up on a <b>paid plan</b>, you BOTH get 1 free month.
      </p>
      <label style={{ fontSize: 13, color: 'var(--muted)' }}>Friend's email</label>
      <input value={friend} onChange={e => setFriend(e.target.value)}
        placeholder="friend@email.com"
        style={{ width: '100%', padding: 10, margin: '6px 0 12px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)' }} />
      {err && <div className="err-banner">⚠️ {err}</div>}
      {msg && <div style={{ background: '#4ade8018', color: '#4ade80', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      <button className="refresh" onClick={send} disabled={busy} style={{ width: '100%' }}>
        {busy ? 'Sending…' : '📨 Send Invite'}
      </button>
    </div>
  );
}
