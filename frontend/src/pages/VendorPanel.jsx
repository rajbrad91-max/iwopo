import { useState, useEffect, useRef } from 'react';
import { api, getUser, clearSession, getAuthToken } from '../lib/api';
import { fmtTime } from '../lib/api';
import { useAppRoute } from '../lib/appRoute';
import { PROFESSIONS, LeadFormBody } from './InquiryForm';
import PasswordInput from '../components/PasswordInput';
import './inquiry.css';
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
  const { route, navigate } = useAppRoute('dashboard');
  const tab = route.tab;
  const setTab = (t) => navigate({ tab: t });
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
  // 🔴 how many leads are still status='new' — drives the sidebar badge.
  // Polled rather than derived from the leads list, because the badge has to be
  // right on every tab, not just when Leads is open.
  const [newLeadCount, setNewLeadCount] = useState(0);
  const refreshLeadCount = () =>
    api.leadsUnreadCount().then(d => setNewLeadCount(d.count || 0)).catch(() => {});

  useEffect(() => {
    if (!has('leads')) return;
    refreshLeadCount();
    const t = setInterval(refreshLeadCount, 60000);   // a minute is plenty for an inbox badge
    // catch up immediately when the vendor returns to the tab
    const onVis = () => { if (!document.hidden) refreshLeadCount(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [features]);

  // 📱 nav → also close sidebar on mobile.
  // Opening Leads marks them read and clears the badge straight away; leaving the
  // badge up while the vendor is looking at the list would be meaningless.
  const go = (t) => {
    setTab(t);
    if (window.innerWidth <= 820) setCollapsed(true);
    if (t === 'leads' && has('leads')) {
      setNewLeadCount(0);                                   // optimistic — the row is right there
      api.markLeadsSeen().catch(() => refreshLeadCount());  // if it failed, put the true count back
    } else if (has('leads')) {
      refreshLeadCount();
    }
  };

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
      localStorage.setItem('vf_time_format', st?.settings?.time_format || '12h');
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
        {has('leads') && <div className={`nav-item ${tab==='leads'?'active':''}`} onClick={() => go('leads')}><span className="nav-ic">📋</span><span className="nav-txt">Leads</span>{newLeadCount > 0 && <span className="nav-badge" title={`${newLeadCount} new lead${newLeadCount === 1 ? '' : 's'}`}>{newLeadCount > 99 ? '99+' : newLeadCount}</span>}</div>}
        {has('leads') && <div className={`nav-item ${tab==='bookings'?'active':''}`} onClick={() => go('bookings')}><span className="nav-ic">📅</span><span className="nav-txt">Bookings</span></div>}
        {has('contracts') && <div className={`nav-item ${tab==='contracts'?'active':''}`} onClick={() => go('contracts')}><span className="nav-ic">📄</span><span className="nav-txt">Contracts & Invoices</span></div>}
        {has('crew') && <div className={`nav-item ${tab==='crew'?'active':''}`} onClick={() => go('crew')}><span className="nav-ic">👷</span><span className="nav-txt">My Crew</span></div>}
        {has('galleries') && <div className={`nav-item ${tab==='galleries'?'active':''}`} onClick={() => go('galleries')}><span className="nav-ic">📸</span><span className="nav-txt">Galleries</span></div>}
        <div className="nav-group">SETUP</div>
        {has('leads') && <div className={`nav-item ${tab==='packages'?'active':''}`} onClick={() => go('packages')}><span className="nav-ic">📦</span><span className="nav-txt">My Packages</span></div>}
        {has('leads') && <div className={`nav-item ${tab==='inqform'?'active':''}`} onClick={() => go('inqform')}><span className="nav-ic">🎨</span><span className="nav-txt">Inquiry Form</span></div>}
        <div className={`nav-item ${tab==='services'?'active':''}`} onClick={() => go('services')}><span className="nav-ic">🧩</span><span className="nav-txt">My Services</span></div>
        <div className={`nav-item ${tab==='aichat'?'active':''}`} onClick={() => go('aichat')}><span className="nav-ic">🤖</span><span className="nav-txt">AI Chat</span></div>
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
              <h1>{tab === 'dashboard' ? 'Dashboard' : tab === 'refer' ? 'Refer a Friend' : tab === 'leads' ? 'Leads' : tab === 'settings' ? 'Settings' : tab === 'packages' ? 'My Packages' : tab === 'bookings' ? 'Bookings' : tab === 'inqform' ? 'Inquiry Form' : tab === 'contracts' ? 'Contracts & Invoices' : tab === 'crew' ? 'My Crew' : tab === 'galleries' ? 'Galleries' : tab === 'aichat' ? 'AI Chat' : tab === 'calendar' ? 'Calendar' : 'My Services'}</h1>
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
          <GalleriesView routeAlbum={route.album} onOpenAlbum={(id) => navigate({ tab: 'galleries', album: id ? String(id) : null })} />
        ) : tab === 'aichat' ? (
          <AiChatVendorView goServices={() => setTab('services')} />
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

// 🤖 Vendor AI Chat — conversation history (subscribed) or upsell (not)
function AiChatVendorView({ goServices }) {
  const [status, setStatus] = useState(null);
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.myChatbotStatus()
      .then(s => {
        setStatus(s);
        if (s.subscribed) {
          return api.myChatbotHistory()
            .then(d => setConvos(d.conversations || []))
            .catch(() => {});
        }
      })
      .catch(() => setStatus({ subscribed: false }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  // 🚫 not subscribed → upsell
  if (!status?.subscribed) {
    return (
      <div className="table-wrap ac-upsell">
        <div className="ac-upsell-icon">🤖</div>
        <h2 className="ac-upsell-title">Meet Tasveer, your AI assistant</h2>
        <p className="ac-upsell-text">
          Tasveer chats with visitors on your inquiry page 24/7 — answering their questions,
          collecting their details, and saving them straight into your Leads. You'll see every
          conversation right here.
        </p>
        <ul className="ac-upsell-list">
          <li>💬 Answers questions using your own info</li>
          <li>📋 Captures leads automatically, day and night</li>
          <li>🌍 Replies in your client's language</li>
          <li>📨 Passes messages straight to you</li>
        </ul>
        <button className="refresh ac-upsell-btn" onClick={goServices}>✨ Add AI Chat to my plan</button>
      </div>
    );
  }

  // ⚪ subscribed but switched off
  if (!status.active) {
    return (
      <div className="table-wrap ac-upsell">
        <div className="ac-upsell-icon">⏸️</div>
        <h2 className="ac-upsell-title">Your AI Chat is paused</h2>
        <p className="ac-upsell-text">Tasveer isn't answering visitors right now. Get in touch and we'll switch it back on.</p>
      </div>
    );
  }

  // 💬 reading one conversation
  if (open) {
    return (
      <>
        <button className="refresh ac-back" onClick={() => setOpen(null)}>← All conversations</button>
        <div className="table-wrap ac-thread">
          <div className="ac-thread-head">
            💬 Conversation · {new Date(open.messages[0].at).toLocaleString()}
          </div>
          {open.messages.map((m, i) => (
            <div key={i} className={`ac-msg ${m.role}`}>
              <div className="ac-msg-who">{m.role === 'user' ? '👤 Visitor' : '🤖 Tasveer'}</div>
              <div className="ac-msg-text">{m.content}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // 📜 conversation list
  return (
    <>
      <div className="ac-head">
        <div>
          <div className="ac-title">💬 Chat History</div>
          <div className="ac-sub">{convos.length} conversation{convos.length === 1 ? '' : 's'} · kept for 30 days</div>
        </div>
      </div>

      {convos.length === 0 ? (
        <div className="table-wrap ac-empty">No conversations yet. When visitors chat with Tasveer, they'll appear here 💬</div>
      ) : (
        <div className="ac-list">
          {convos.map(c => {
            const first = c.messages.find(m => m.role === 'user');
            return (
              <div key={c.session} className="ac-card" onClick={() => setOpen(c)}>
                <div className="ac-card-main">
                  <div className="ac-card-snippet">{first ? first.content : '—'}</div>
                  <div className="ac-card-meta">{c.messages.length} messages</div>
                </div>
                <div className="ac-card-date">{new Date(c.last_at).toLocaleDateString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// 🎯 Cover focal-point picker: click or drag to set where the cover centers.
// The same point is used on desktop AND mobile, so covers frame well at any aspect ratio.
function FocalPicker({ src, focus, onFocus, view, onView }) {
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

function GalleriesView({ routeAlbum, onOpenAlbum }) {
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
  const [tpl, setTpl] = useState('');
  const [showPw, setShowPw] = useState({ guest: false, admin: false });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [galleryToken, setGalleryToken] = useState('');
  const [copiedGallery, setCopiedGallery] = useState(false);
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
    catch (e) { alert('⚠️ ' + e.message); }
  }

  function copyGalleryUrl() {
    const url = `${window.location.origin}/gallery/${galleryToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGallery(true); setTimeout(() => setCopiedGallery(false), 2000);
    }).catch(() => { prompt('Copy your full gallery link:', url); });
  }

  function copyUrl(a) {
    const url = `${window.location.origin}/g/${a.public_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(() => { prompt('Copy this gallery link:', url); });
  }
  const [sendModal, setSendModal] = useState(null); // { album, email, body, editing }
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
    if (!confirm(`Delete ${checked.length} album(s) and all their photos? This can't be undone.`)) return;
    try {
      for (const id of checked) { await api.deleteAlbum(id); }
      setChecked([]); setSelectMode(false); load();
    } catch (e) { alert('⚠️ ' + e.message); }
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
      setTpl(s.instructions_template || '');
      setGalleryToken(s.gallery_token || '');
    }).catch(() => {});
    api.galleryTheme().then(d => setTheme(d.theme || {})).catch(() => {});
  }, []);
  function load() { setLoading(true); api.albums().then(d => setAlbums(d.albums || [])).catch(() => {}).finally(() => setLoading(false)); }

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
      guest_password: pwPrefix + tail,
      admin_password: spwPrefix + tail,
    }));
  }
  // 🔄 changing a prefix re-applies to the existing last-4 tail (PerfectPoses behaviour)
  function applyPrefix(which, val) {
    if (which === 'guest') setPwPrefix(val); else setSpwPrefix(val);
    setF(s => {
      const src = which === 'guest' ? s.guest_password : s.admin_password;
      const tail = last4(src);
      if (!tail) return s;
      return which === 'guest' ? { ...s, guest_password: val + tail } : { ...s, admin_password: val + tail };
    });
  }

  function resetForm() { setF(emptyAlbum()); setCoverFile(null); setCoverFocus('50% 50%'); setFocusView('desktop'); setEdit(null); setMsg(''); }
  async function create() {
    if (!f.title) return setMsg('⚠️ Gallery name required');
    try {
      // persist prefixes for next time
      api.saveAlbumSettings({ pw_prefix: pwPrefix, spw_prefix: spwPrefix, instructions_template: tpl }).catch(() => {});
      let album;
      if (edit) { const d = await api.updateAlbum(edit.id, f); album = d.album; }
      else { const d = await api.createAlbum(f); album = d.album; }
      if (coverFile && album) { try { await api.uploadAlbumCover(album.id, coverFile); } catch {} }
      // save focal point whenever there's a cover (new or existing)
      if (album && (coverFile || edit?.cover_photo)) { try { await api.saveCoverFocus(album.id, coverFocus); } catch {} }
      resetForm(); setShowNew(false); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function startEdit(a) {
    setEdit(a);
    setF({
      title: a.title || '', category: a.category || '', client_email: a.client_email || '',
      guest_password: a.guest_password || '', admin_password: a.admin_password || '',
    });
    setCoverFile(null); setCoverFocus(a.cover_focus || '50% 50%'); setFocusView('desktop'); setShowNew(true); setMsg('');
  }
  async function del(id) {
    if (!confirm('Delete this album and all its photos?')) return;
    await api.deleteAlbum(id); load();
  }

  // 📧 fill instructions template with this album's values
  function fillTpl(a, raw) {
    const base = raw || tpl || DEFAULT_GALLERY_TPL;
    return base
      .replaceAll('{client_name}', a.title || 'Client')
      .replaceAll('{guest_password}', a.guest_password || '')
      .replaceAll('{admin_password}', a.admin_password || '');
  }
  function openSend(a) {
    setSendMsg('');
    setSendModal({ album: a, email: a.client_email || '', body: fillTpl(a), editing: false });
  }
  async function doSend() {
    if (!sendModal?.email) { setSendMsg('⚠️ Email required'); return; }
    setSendMsg('Sending…');
    try {
      await api.emailAlbumInstructions(sendModal.album.id, { email: sendModal.email, body: sendModal.body });
      setSendMsg('✅ Sent!'); setTimeout(() => setSendModal(null), 1200);
    } catch (e) { setSendMsg('⚠️ ' + e.message); }
  }
  async function saveSettingsOnly() {
    try { await api.saveAlbumSettings({ pw_prefix: pwPrefix, spw_prefix: spwPrefix, instructions_template: tpl }); setShowSettings(false); }
    catch (e) { alert('⚠️ ' + e.message); }
  }

  if (open) return <AlbumDetail albumId={open} onBack={() => { setOpen(null); load(); }} />;
  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="gal-head">
        <h2 className="gal-title">📸 Galleries</h2>
        <div className="gal-head-btns">
          <button className="lead-ic-btn" onClick={() => { if (showNew) resetForm(); setShowNew(s => !s); }} title={showNew ? 'Cancel' : 'New album'}>{showNew ? '✕' : '➕'}</button>
          <button className={`lead-ic-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); setSearch(''); }} title="Search albums">🔍</button>
          <button className={`lead-ic-btn lead-ic-del ${selectMode ? 'is-on' : ''}`} onClick={onBinClick} title={selectMode ? (checked.length ? `Delete ${checked.length}` : 'Cancel select') : 'Select to delete'}>{selectMode && checked.length ? `🗑️ ${checked.length}` : '🗑️'}</button>
          <button className="lead-ic-btn" onClick={() => setShowSettings(true)} title="Settings">⚙️</button>
        </div>
      </div>

      {showSearch && (
        <input className="lead-search" autoFocus placeholder="🔍 Search albums by name or category…" value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {showNew && (
        <div className="table-wrap gal-form">
          <div className="gal-form-h">{edit ? '✏️ Edit Album' : '➕ New Album'}</div>

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
              <div><label className="lbl">Gallery Name *</label>
                <input className="gal-input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Susan &amp; Mike Wedding" />
              </div>
              <div><label className="lbl">Category</label>
                <input className="gal-input" list="gal-cat-list" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="Wedding" />
                <datalist id="gal-cat-list">
                  {['Wedding', 'Engagement', 'Pre-Wedding', 'Reception', 'Birthday', 'Portrait', 'Event', 'Other'].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </section>

            <section className="gal-card-sec">
              <h4 className="gal-sec-h">🔑 Access</h4>
              <div className="gal-sec-note gal-pw-hint">
                A prefix is added in front of the last 4 characters of the password —
                e.g. prefix <code>susan</code> + <code>4821</code> = <code>susan4821</code>.
              </div>
              <div><label className="lbl">🧑‍🤝‍🧑 Guest password</label>
                <div className="gal-pw-wrap">
                  <input className="gal-input" type={showPw.guest ? 'text' : 'password'} value={f.guest_password} onChange={e => setF({ ...f, guest_password: e.target.value })} />
                  <button type="button" className="gal-pw-eye" onClick={() => setShowPw(s => ({ ...s, guest: !s.guest }))} title={showPw.guest ? 'Hide' : 'Show'}>{showPw.guest ? '🙈' : '👁️'}</button>
                </div>
                <input className="gal-prefix gal-prefix-full" value={pwPrefix} onChange={e => applyPrefix('guest', e.target.value)} placeholder="guest prefix (optional)" title="Added in front of the last 4 characters" />
              </div>
              <div><label className="lbl">🔐 Admin password</label>
                <div className="gal-pw-wrap">
                  <input className="gal-input" type={showPw.admin ? 'text' : 'password'} value={f.admin_password} onChange={e => setF({ ...f, admin_password: e.target.value })} />
                  <button type="button" className="gal-pw-eye" onClick={() => setShowPw(s => ({ ...s, admin: !s.admin }))} title={showPw.admin ? 'Hide' : 'Show'}>{showPw.admin ? '🙈' : '👁️'}</button>
                </div>
                <input className="gal-prefix gal-prefix-full" value={spwPrefix} onChange={e => applyPrefix('admin', e.target.value)} placeholder="admin prefix (optional)" title="Added in front of the last 4 characters" />
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

          </div>

          <div className="gal-form-foot">
            <button className="refresh gal-save" onClick={create}>{edit ? '💾 Save changes' : '✅ Create album'}</button>
            {edit && <button className="refresh gal-mini-send" onClick={() => openSend(edit)}>📧 Send Instructions</button>}
            {edit?.public_token && <button className="refresh gal-copy-url" onClick={() => copyUrl(edit)}>{copiedUrl ? '✅ Copied!' : '🔗 Copy Gallery Link'}</button>}
            {msg && <span className="gal-err">{msg}</span>}
          </div>
        </div>
      )}

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
                  <input className="gal-input" readOnly value={galleryToken ? `${window.location.origin}/gallery/${galleryToken}` : 'Loading…'} onFocus={e => e.target.select()} />
                  <button className="refresh gal-copy-url" onClick={copyGalleryUrl} disabled={!galleryToken}>{copiedGallery ? '✅' : '🔗 Copy'}</button>
                </div>

                <label className="lbl gal-set-lbl">🔑 Default password prefixes</label>
                <div className="gal-set-prefixes">
                  <input className="gal-input" value={pwPrefix} onChange={e => setPwPrefix(e.target.value)} placeholder="Guest prefix" />
                  <input className="gal-input" value={spwPrefix} onChange={e => setSpwPrefix(e.target.value)} placeholder="Admin prefix" />
                </div>

                <label className="lbl gal-set-lbl">📧 Email instructions template</label>
                <div className="gal-set-hint">Placeholders: <code>{'{client_name}'}</code> <code>{'{guest_password}'}</code> <code>{'{admin_password}'}</code></div>
                <textarea className="gal-input gal-set-ta" value={tpl} onChange={e => setTpl(e.target.value)} placeholder="Dear {client_name}, your photos are ready…" />
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
                  {[['bg_color', 'Background', '#0f1115'], ['heading_color', 'Heading', '#f3f4f6'], ['accent_color', 'Accent', '#2dd4bf'], ['sub_color', 'Subtitle', '#9ca3af']].map(([k, lbl, def]) => (
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
                  <div style={{ textTransform: 'uppercase', letterSpacing: 3, fontSize: 10, color: theme.accent_color || '#2dd4bf', fontFamily: `'${theme.body_font || 'Jost'}',sans-serif` }}>{theme.title_text || 'Client Galleries'}</div>
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
            <div key={a.id} className={`table-wrap gal-card ${selectMode && checked.includes(a.id) ? 'gal-card-sel' : ''}`} onClick={() => { if (selectMode) toggleCheck(a.id, { stopPropagation() {} }); else setOpen(a.id); }}>
              {selectMode && (
                <div className="gal-card-check" onClick={e => toggleCheck(a.id, e)}>
                  <input type="checkbox" readOnly checked={checked.includes(a.id)} />
                </div>
              )}
              <div className="gal-card-cover">
                {a.cover_photo
                  ? <img src={api.albumCoverUrl(a.id)} alt={a.title} loading="lazy" />
                  : <div className="gal-card-noimg">🖼️</div>}
              </div>
              <div className="gal-card-body">
                <div className="gal-card-title">{a.title}</div>
                <div className="gal-card-cat">{a.category || '—'}</div>
                <div className="gal-card-meta">
                  <span>📷 {a.photo_count}</span>
                  {a.selected_count > 0 && <span className="gal-picked">✅ {a.selected_count}</span>}
                </div>
                {!selectMode && (
                  <div className="gal-card-actions">
                    <button className="gal-mini gal-mini-gear" onClick={e => { e.stopPropagation(); startEdit(a); }} title="Edit album">⚙️ Manage</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        );
      })()}

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
              <label className="lbl">Instructions</label>
              {sendModal.editing
                ? <button className="gal-gen" onClick={() => {
                    // save edited body back as the reusable template (re-insert placeholders isn't needed; save raw text with current values)
                    api.saveAlbumSettings({ pw_prefix: pwPrefix, spw_prefix: spwPrefix, instructions_template: sendModal.body }).then(() => setTpl(sendModal.body)).catch(() => {});
                    setSendModal(m => ({ ...m, editing: false }));
                  }}>💾 Save</button>
                : <button className="gal-gen" onClick={() => setSendModal(m => ({ ...m, editing: true }))}>✏️ Edit</button>}
            </div>
            <textarea className="gal-input gal-send-ta" readOnly={!sendModal.editing} value={sendModal.body} onChange={e => setSendModal(m => ({ ...m, body: e.target.value }))} />

            <div className="gal-send-foot">
              <button className="refresh gal-save" onClick={doSend}>📨 Send</button>
              {sendMsg && <span className="gal-err">{sendMsg}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const DEFAULT_GALLERY_TPL = `Dear {client_name},

Your photos are now ready to view and download! 🎉

Guest Password: {guest_password}
(Share this with friends and family)

Admin Password: {admin_password}
(Use this to manage or remove photos)

Thank you for choosing us! 💛`;

function AlbumDetail({ albumId, onBack }) {
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [events, setEvents] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState('');
  const [activeEvent, setActiveEvent] = useState('all'); // filter + upload target
  const [evModal, setEvModal] = useState(null); // { type:'add'|'edit'|'delete', ev, name }
  const [evBusy, setEvBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20); // infinite-scroll: how many thumbs are mounted
  const [pending, setPending] = useState([]); // local previews of files still uploading {uid, url, eventId}
  const [dragOver, setDragOver] = useState(false); // drag-and-drop upload zone highlight
  const [lightbox, setLightbox] = useState(null); // index into `visible` of the open full-screen photo
  const [favModal, setFavModal] = useState(false);      // ⭐ show the client-favorites panel
  const [favData, setFavData] = useState(null);         // { total, lists:[{email,count,photos}] }
  const [favBusy, setFavBusy] = useState(false);
  const [selModal, setSelModal] = useState(false);      // 📩 show the client's sent selection
  const [selData, setSelData] = useState(null);
  const [selBusy, setSelBusy] = useState(false);
  const [copiedNames, setCopiedNames] = useState(false);
  const [selActBusy, setSelActBusy] = useState(false);   // mark-complete / clear in flight
  const [selClearAsk, setSelClearAsk] = useState(false); // confirm clearing the selection
  const dropInputRef = useRef(null); // hidden input the big drop zone clicks
  const sentinelRef = useRef(null);
  const workerRef = useRef(null);
  const visibleLenRef = useRef(0); // holds current visible-photo count for the keyboard handler
  const token = getAuthToken();   // this tab's token, not whatever another tab last wrote

  // clean up the upload worker + any object URLs on unmount
  useEffect(() => () => {
    if (workerRef.current) workerRef.current.terminate();
    setPending(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
  }, []);

  // keyboard controls for the full-screen viewer: Esc closes, arrows navigate.
  // reads the count from a ref so it doesn't depend on `visible` (defined later).
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') setLightbox(i => (i > 0 ? i - 1 : i));
      else if (e.key === 'ArrowRight') setLightbox(i => (i < visibleLenRef.current - 1 ? i + 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // browser Back closes the full-screen photo instead of leaving the gallery.
  // On open we push a history entry; Back pops it and closes the viewer. Closing
  // via X/Esc/click goes back once to consume that entry, keeping history clean.
  const lbHistRef = useRef(false); // did WE push a history entry for the current lightbox?
  useEffect(() => {
    if (lightbox === null) return;
    window.history.pushState({ adLightbox: true }, '');
    lbHistRef.current = true;
    const onPop = () => { lbHistRef.current = false; setLightbox(null); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // if the viewer was closed by something other than Back, consume our entry
      if (lbHistRef.current) { lbHistRef.current = false; window.history.back(); }
    };
  }, [lightbox === null]);

  useEffect(() => { load(); }, [albumId]);
  function load() { api.album(albumId).then(d => {
    setAlbum(d.album); setPhotos(d.photos || []); setEvents(d.events || []);
    // per-client: default to the first event (no "All" tab)
    if ((d.events || []).length > 0) {
      setActiveEvent(prev => prev === 'all' ? d.events[0].id : prev);
    }
  }).catch(() => {}); }

  // refresh only the photo list (used mid-upload so new photos appear without resetting the view)
  function reloadPhotos() { return api.album(albumId).then(d => { setPhotos(d.photos || []); }).catch(() => {}); }

  // ⭐ open the client-favorites panel and load favorites grouped by email
  function openFavorites() {
    setFavModal(true); setFavBusy(true); setFavData(null);
    api.albumFavorites(albumId)
      .then(d => setFavData(d))
      .catch(() => setFavData({ total: 0, lists: [] }))
      .finally(() => setFavBusy(false));
  }

  // 📩 open the sent-selection panel (what the client's admin sent to the studio)
  function openSelection() {
    setSelModal(true); setSelBusy(true); setSelData(null); setCopiedNames(false);
    api.albumSelection(albumId)
      .then(d => setSelData(d))
      .catch(() => setSelData({ total: 0, events: [] }))
      .finally(() => setSelBusy(false));
  }

  // 📋 copy every selected file name, space-separated (DSC112 DSC113 …)
  async function copySelectionNames() {
    if (!selData?.events?.length) return;
    const names = selData.events.flatMap(ev => ev.photos.map(p => (p.filename || '').replace(/\.[^.]+$/, '')));
    const text = names.join(' ');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API blocked (http or permissions) — fall back to a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopiedNames(true);
    setTimeout(() => setCopiedNames(false), 2000);
  }

  // ✅ flag the selection as handled (or un-flag it)
  async function toggleSelectionComplete() {
    const next = !selData?.completed_at;
    setSelActBusy(true);
    try {
      const d = await api.completeSelection(albumId, next);
      setSelData(s => ({ ...s, completed_at: next ? (d.completed_at || new Date().toISOString()) : null }));
    } catch { /* leave state as-is */ }
    finally { setSelActBusy(false); }
  }

  // 🗑️ clear the sent selection + note (photos are not touched)
  async function clearSelection() {
    setSelActBusy(true);
    try {
      await api.clearSelection(albumId);
      setSelData({ total: 0, events: [], note: '', sent_at: null, completed_at: null });
      setSelClearAsk(false);
    } catch { /* leave state as-is */ }
    finally { setSelActBusy(false); }
  }

  // reset the infinite-scroll window when switching event tabs
  useEffect(() => { setVisibleCount(20); }, [activeEvent]);

  // infinite scroll: reveal 20 more each time the sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(c => c + 20);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [activeEvent, photos.length]);

  const isPerClient = true; // per-client is the only gallery mode

  function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    startUpload(files);
  }
  // drag-and-drop onto the big upload zone
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    startUpload(e.dataTransfer.files);
  }
  function onDragOver(e) { e.preventDefault(); if (!dragOver) setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false); }
  function startUpload(fileArr) {
    const files = [...fileArr].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    // in per-client mode uploads go into the active event (must pick one first)
    const eventId = isPerClient && activeEvent !== 'all' ? activeEvent : null;
    if (isPerClient && !eventId) { setProg('⚠️ Pick an event tab first to upload into it'); setTimeout(() => setProg(''), 2500); return; }
    const total = files.length;

    // 📸 instant previews: show the first 50 picked photos right away (dimmed + spinner).
    // Capped at 50 so huge batches (1000s of photos) don't fill browser memory with previews.
    const PREVIEW_CAP = 50;
    const previews = files.slice(0, PREVIEW_CAP).map((f, idx) => ({
      uid: `${Date.now()}_${idx}_${f.name}`,
      url: URL.createObjectURL(f),
      eventId: eventId ? String(eventId) : null,
    }));
    setPending(previews);
    setUploading(true); setProg(`Uploading 0 / ${total} photos…`);

    // upload on a background thread so it keeps running when the tab is hidden
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(new URL('../lib/uploadWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const finish = () => {
      setUploading(false);
      // drop all previews (real photos have replaced them) and free their memory
      setPending(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
      reloadPhotos();
    };
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') {
        setProg(`Uploading ${m.done} / ${m.total} photos…`);
        // photos 0..done have landed as real thumbs — drop that many previews from the front
        setPending(() => {
          const consumed = previews.slice(0, m.done);
          consumed.forEach(p => URL.revokeObjectURL(p.url));
          return previews.slice(m.done);
        });
      } else if (m.type === 'chunk') {
        reloadPhotos();
      } else if (m.type === 'done') {
        setProg(`✅ ${m.count} uploaded`);
        finish();
        setTimeout(() => setProg(''), 2500);
        worker.terminate(); workerRef.current = null;
      } else if (m.type === 'error') {
        setProg('⚠️ ' + m.message);
        finish();
        worker.terminate(); workerRef.current = null;
      }
    };
    worker.postMessage({ albumId, files, eventId, token, maxCount: 20 });
  }
  async function delPhoto(pid) {
    if (!confirm('Delete this photo?')) return;
    await api.deletePhoto(albumId, pid); load();
  }
  // event add/edit/delete now go through a styled in-app modal (evModal)
  function openAddEvent() { setEvModal({ type: 'add', ev: null, name: '' }); }
  function openEditEvent() { const ev = events.find(e => String(e.id) === String(activeEvent)); if (ev) setEvModal({ type: 'edit', ev, name: ev.name }); }
  function openDeleteEvent() { const ev = events.find(e => String(e.id) === String(activeEvent)); if (ev) setEvModal({ type: 'delete', ev, name: ev.name }); }

  async function commitEvent() {
    if (!evModal) return;
    const { type, ev, name } = evModal;
    const trimmed = (name || '').trim();
    if ((type === 'add' || type === 'edit') && !trimmed) return;
    setEvBusy(true);
    try {
      if (type === 'add') {
        const d = await api.addAlbumEvent(albumId, trimmed);
        setActiveEvent(d.event.id);
      } else if (type === 'edit') {
        if (trimmed !== ev.name) await api.renameAlbumEvent(albumId, ev.id, trimmed);
      } else if (type === 'delete') {
        await api.deleteAlbumEvent(albumId, ev.id);
        if (String(activeEvent) === String(ev.id)) setActiveEvent('all');
      }
      setEvModal(null);
      load();
    } catch (e) { alert('⚠️ ' + e.message); }
    finally { setEvBusy(false); }
  }

  if (!album) return <div className="loading">Loading…</div>;

  const shown = isPerClient && activeEvent !== 'all'
    ? photos.filter(p => String(p.event_id) === String(activeEvent))
    : photos;
  const visible = shown.slice(0, visibleCount); // infinite-scroll window
  visibleLenRef.current = visible.length; // keep the keyboard handler's bound current
  // previews for the current event view (per-client shows only the active event's uploads)
  const pendingShown = (isPerClient && activeEvent !== 'all')
    ? pending.filter(p => p.eventId === String(activeEvent))
    : pending;
  const uploadLabel = uploading ? '⏳ Uploading…'
    : isPerClient ? (activeEvent === 'all' ? '📤 Pick an event to upload' : '📤 Upload to this event')
    : '📤 Upload photos';

  return (
    <>
      <div className="ad-head">
        <div>
          <button className="refresh ad-back" onClick={onBack}>← Back</button>
          <h2 className="ad-title">🖼️ {album.title}</h2>
          <div className="ad-count">{photos.length} photos{isPerClient ? ` · ${events.length} events` : ''}</div>
        </div>
        <div className="ad-head-actions">
          <button className="refresh ad-ev-btn" onClick={openFavorites} title="See which photos clients marked as favorites">⭐ Favorites</button>
          <button className="refresh ad-ev-btn" onClick={openSelection} title="See the photo selection the client sent you">📩 Selection</button>
          {isPerClient && (
            <div className="ad-ev-actions">
              <button className="refresh ad-ev-btn" onClick={openAddEvent} title="Add a new event">➕ Add</button>
              <button className="refresh ad-ev-btn" onClick={openEditEvent} disabled={activeEvent === 'all'} title="Rename the selected event">✏️ Edit</button>
              <button className="refresh ad-ev-btn ad-ev-btn-del" onClick={openDeleteEvent} disabled={activeEvent === 'all'} title="Delete the selected event">🗑️ Delete</button>
            </div>
          )}
          <label className={`refresh ad-upload ${isPerClient && activeEvent === 'all' ? 'ad-upload-off' : ''}`}>
            {uploadLabel}
            <input type="file" accept="image/*" multiple hidden onChange={onFiles} disabled={uploading || (isPerClient && activeEvent === 'all')} />
          </label>
        </div>
      </div>

      {isPerClient && (
        <div className="ad-events">
          {events.map(ev => {
            const n = photos.filter(p => String(p.event_id) === String(ev.id)).length;
            return (
              <button key={ev.id} className={`pg-ev ${String(activeEvent) === String(ev.id) ? 'on' : ''}`} onClick={() => setActiveEvent(ev.id)}>
                <span className="pg-ev-name">{ev.name}</span>
                <span className="pg-ev-count">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {isPerClient && evModal && (
        <div className="al-overlay" onClick={() => !evBusy && setEvModal(null)}>
          <div className="gal-set-modal ev-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">
                {evModal.type === 'add' ? '➕ New event' : evModal.type === 'edit' ? '✏️ Rename event' : '🗑️ Delete event'}
              </h3>
              <button className="al-x" onClick={() => !evBusy && setEvModal(null)}>✕</button>
            </div>

            {evModal.type === 'delete' ? (
              <p className="ev-modal-text">
                Delete <strong>“{evModal.ev.name}”</strong>? The photos stay in the gallery but become ungrouped from this event.
              </p>
            ) : (
              <>
                <label className="lbl">Event name</label>
                <input
                  className="gal-input" autoFocus value={evModal.name}
                  onChange={e => setEvModal(m => ({ ...m, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && commitEvent()}
                  placeholder="e.g. Wedding, Reception, Mehndi"
                />
              </>
            )}

            <div className="ev-modal-foot">
              <button className="refresh ev-modal-cancel" onClick={() => setEvModal(null)} disabled={evBusy}>Cancel</button>
              <button
                className={`refresh ev-modal-ok ${evModal.type === 'delete' ? 'ev-modal-danger' : ''}`}
                onClick={commitEvent} disabled={evBusy}
              >
                {evBusy ? '…' : evModal.type === 'add' ? 'Add event' : evModal.type === 'edit' ? 'Save' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {favModal && (
        <div className="al-overlay" onClick={() => setFavModal(false)}>
          <div className="gal-set-modal ad-fav-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">⭐ Client favorites</h3>
              <button className="al-x" onClick={() => setFavModal(false)}>✕</button>
            </div>

            {favBusy ? (
              <div className="ad-fav-empty">Loading favorites…</div>
            ) : !favData || favData.total === 0 ? (
              <div className="ad-fav-empty">No favorites yet. When clients ⭐ photos in the gallery, their picks show up here — grouped by event, then by the email they used.</div>
            ) : (
              <div className="ad-fav-lists">
                <div className="ad-fav-total">{favData.total} favorite{favData.total === 1 ? '' : 's'} across {favData.events.length} event{favData.events.length === 1 ? '' : 's'}</div>
                {favData.events.map(ev => (
                  <div key={ev.event_id ?? 'none'} className="ad-fav-event">
                    <div className="ad-fav-event-head">
                      <span className="ad-fav-event-name">🗂️ {ev.event_name}</span>
                      <span className="ad-fav-count">{ev.count} photo{ev.count === 1 ? '' : 's'}</span>
                    </div>
                    {ev.lists.map(list => (
                      <div key={list.email} className="ad-fav-group">
                        <div className="ad-fav-group-head">
                          <span className="ad-fav-email">{list.email}</span>
                          <span className="ad-fav-count">{list.count} photo{list.count === 1 ? '' : 's'}</span>
                        </div>
                        <div className="ad-fav-grid">
                          {list.photos.map(ph => (
                            <div key={ph.photo_id} className="ad-fav-thumb" title={ph.filename}>
                              <img src={`${api.fileUrl(ph.photo_id, 'thumb')}?token=${token}`} loading="lazy" alt="" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selModal && (
        <div className="al-overlay" onClick={() => setSelModal(false)}>
          <div className="gal-set-modal ad-fav-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">📩 Client's selection</h3>
              <button className="al-x" onClick={() => setSelModal(false)}>✕</button>
            </div>
            {selBusy ? (
              <div className="ad-fav-empty">Loading selection…</div>
            ) : !selData || selData.total === 0 ? (
              <div className="ad-fav-empty">Nothing sent yet. When the client logs in with the admin password, picks photos with the ✓ tool, and clicks “Send to studio”, their final selection appears here — grouped by event.</div>
            ) : (
              <div className="ad-fav-lists">
                <div className="ad-sel-bar">
                  <div className="ad-fav-total">
                    {selData.total} photo{selData.total === 1 ? '' : 's'} selected across {selData.events.length} event{selData.events.length === 1 ? '' : 's'}
                    {selData.sent_at && <span className="ad-sel-when"> · sent {new Date(selData.sent_at).toLocaleString()}</span>}
                    {selData.completed_at && <span className="ad-sel-done">✓ Completed</span>}
                  </div>
                  <div className="ad-sel-acts">
                    <button className="refresh ad-ev-btn" onClick={copySelectionNames} title="Copy all selected file names">
                      {copiedNames ? '✓ Copied' : '📋 Copy names'}
                    </button>
                    <a className="refresh ad-ev-btn" href={`/api/albums/${albumId}/selection.zip?token=${token}`} title="Download the selected photos as a Zip file">⬇️ Download Zip</a>
                    <button className={`refresh ad-ev-btn ${selData.completed_at ? 'ad-btn-done' : ''}`} onClick={toggleSelectionComplete} disabled={selActBusy}
                      title={selData.completed_at ? 'Mark as not completed' : 'Mark this selection as handled'}>
                      {selData.completed_at ? '↩️ Mark not done' : '✅ Mark completed'}
                    </button>
                    <button className="refresh ad-ev-btn ad-btn-danger" onClick={() => setSelClearAsk(true)} disabled={selActBusy}
                      title="Clear this selection and note — your photos are not deleted">🗑️ Delete selection</button>
                  </div>
                </div>

                {selClearAsk && (
                  <div className="ad-sel-confirm">
                    <span>Clear this selection and the client's note? Your photos will <b>not</b> be deleted.</span>
                    <span className="ad-sel-confirm-acts">
                      <button className="refresh ad-ev-btn ad-btn-danger" onClick={clearSelection} disabled={selActBusy}>
                        {selActBusy ? 'Clearing…' : 'Yes, clear it'}
                      </button>
                      <button className="refresh ad-ev-btn" onClick={() => setSelClearAsk(false)} disabled={selActBusy}>Cancel</button>
                    </span>
                  </div>
                )}

                {selData.note && (
                  <div className="ad-sel-note">
                    <div className="ad-sel-note-h">📝 Client's note</div>
                    <p className="ad-sel-note-b">{selData.note}</p>
                  </div>
                )}

                {selData.events.map(ev => (
                  <div key={ev.event_id ?? 'none'} className="ad-fav-event">
                    <div className="ad-fav-event-head">
                      <span className="ad-fav-event-name">🗂️ {ev.event_name}</span>
                      <span className="ad-fav-count">{ev.count} photo{ev.count === 1 ? '' : 's'}</span>
                    </div>
                    <div className="ad-sel-grid">
                      {ev.photos.map(ph => (
                        <figure key={ph.photo_id} className="ad-sel-item">
                          <img src={`${api.fileUrl(ph.photo_id, 'thumb')}?token=${token}`} loading="lazy" alt="" />
                          <figcaption title={ph.filename}>{ph.filename}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {prog && <div className="ad-prog">{prog}</div>}

      {shown.length === 0 && pendingShown.length === 0 ? (
        (isPerClient && activeEvent === 'all' && events.length === 0) ? (
          <div className="table-wrap ad-empty">Click ➕ Add up top to create an event, then upload photos into it 📤</div>
        ) : (
          <div
            className={`ad-dropzone ${dragOver ? 'is-drag' : ''} ${uploading || (isPerClient && activeEvent === 'all') ? 'is-off' : ''}`}
            onClick={() => { if (!uploading && !(isPerClient && activeEvent === 'all')) dropInputRef.current?.click(); }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input ref={dropInputRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            <div className="ad-dropzone-inner">
              <div className="ad-dropzone-ico">📤</div>
              <div className="ad-dropzone-title">
                {isPerClient && activeEvent === 'all' ? 'Pick an event above to upload'
                  : dragOver ? 'Drop photos to upload' : 'Click to choose photos, or drag & drop them here'}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="ad-grid">
          {visible.map((p, idx) => (
            <div key={p.id} className="ad-photo" title={p.filename}>
              <img className="ad-photo-img" src={`${api.fileUrl(p.id, 'thumb')}?token=${token}`} loading="lazy" onClick={() => setLightbox(idx)} />
              {p.is_selected && <span className="ad-picked">✅ Picked</span>}
              <button className="ad-photo-del" onClick={() => delPhoto(p.id)}>🗑️</button>
              <span className="ad-photo-name">{(p.filename || '').replace(/\.[^.]+$/, '')}</span>
            </div>
          ))}
          {pendingShown.map(p => (
            <div key={p.uid} className="ad-photo is-uploading">
              <img src={p.url} />
              <span className="ad-photo-spin" />
            </div>
          ))}
        </div>
      )}
      {visible.length < shown.length && <div ref={sentinelRef} className="ad-grid-sentinel">Loading more…</div>}

      {lightbox !== null && visible[lightbox] && (
        <div className="ad-lb" onClick={() => setLightbox(null)}>
          <button className="ad-lb-close" onClick={() => setLightbox(null)}>✕</button>
          {lightbox > 0 && (
            <button className="ad-lb-nav prev" onClick={e => { e.stopPropagation(); setLightbox(i => i - 1); }}>‹</button>
          )}
          <img
            className="ad-lb-img"
            src={`${api.fileUrl(visible[lightbox].id, 'preview')}?token=${token}`}
            alt={visible[lightbox].filename || ''}
            onClick={e => e.stopPropagation()}
          />
          {lightbox < visible.length - 1 && (
            <button className="ad-lb-nav next" onClick={e => { e.stopPropagation(); setLightbox(i => i + 1); }}>›</button>
          )}
          <span className="ad-lb-name">{(visible[lightbox].filename || '').replace(/\.[^.]+$/, '')}</span>
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

function CalendarView({ onOpen, filter }) {
  const [bookings, setBookings] = useState([]);
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selDay, setSelDay] = useState(null);
  const [dir, setDir] = useState('left');

  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {});
  }, []);

  // 🔍 when searching from Bookings, only show matching events on the calendar
  const term = (filter || '').trim().toLowerCase();
  const shown = !term ? bookings : bookings.filter(b =>
    [b.name, b.event_type, b.event_date, b.location, b.phone, b.email]
      .some(v => v && String(v).toLowerCase().includes(term)));

  const byDay = {};
  shown.forEach(b => {
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
    <div className="cal-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="table-wrap cal-panel">
        <div className="cal-nav">
          <button className="refresh" onClick={() => move(-1)}>←</button>
          <h2 className="cal-month">🗓️ {monthName}</h2>
          <button className="refresh" onClick={() => move(1)}>→</button>
        </div>
        <div className="cal-dow">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div key={`${cur.y}-${cur.m}`} className={`cal-grid slide-${dir}`}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = key(d);
            const evts = byDay[k] || [];
            const isToday = k === today;
            const cls = ['cal-cell'];
            if (evts.length) cls.push('has-evt');
            if (selDay === k) cls.push('is-sel');
            else if (isToday) cls.push('is-today');
            return (
              <div key={i} className={cls.join(' ')} onClick={() => evts.length && setSelDay(k)}>
                <div className="cal-daynum">{d}</div>
                {evts.slice(0, 2).map(e => (
                  <div key={e.id} className="cal-daylbl">✅ {e.name}</div>
                ))}
                {evts.length > 2 && <div className="cal-daymore">+{evts.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {selDay && (byDay[selDay] || []).map(b => (
        <div key={b.id} className="table-wrap cal-evt" onClick={() => onOpen && onOpen(b)}>
          🎉 <b>{b.name}</b> · {b.event_type} · {b.timing_from ? `${fmtTime(b.timing_from)}–${b.timing_to ? fmtTime(b.timing_to) : '?'}` : 'time TBD'}
          {b.location ? ` · 📍 ${b.location}` : ''}
          {b.money ? ` · ⏳ $${b.money.balance} due` : ''}
          {onOpen && <span className="cal-evt-open">👁️ Open</span>}
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
  const SB = { new: 'trial', quoted: 'trial', booked: 'active' };
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
                  {(b.timing_from || b.timing_to) && <div className="ev-line">🕐 {b.timing_from ? fmtTime(b.timing_from) : '?'} — {b.timing_to ? fmtTime(b.timing_to) : '?'}</div>}
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

// ➕ Manual add-lead modal (mirrors the public inquiry form fields)
function AddLeadModal({ vendorId, onClose, onSaveDone }) {
  const [cfg, setCfg] = useState(null);
  const [p, setP] = useState({ role: '', name: '', email: '', phone: '', instagram: '', heard: '' });
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setPI = (k, v) => setP(s => ({ ...s, [k]: v }));
  const setAns = (id, v) => setAnswers(s => ({ ...s, [id]: v }));

  useEffect(() => {
    api.inquirySettings(vendorId).then(d => setCfg(d.settings)).catch(() => setCfg({}));
  }, [vendorId]);

  async function save() {
    setErr('');
    if (!p.name || !p.email) { setErr('Name and email are required'); return; }
    for (const fld of (cfg?.custom_fields || [])) {
      if (fld.required && !answers[fld.id]) { setErr(`"${fld.label}" is required`); return; }
    }
    setBusy(true);
    try {
      await api.createLead({ name: p.name, email: p.email, phone: p.phone, role: p.role, instagram: p.instagram, heard: p.heard, notes, custom_data: answers });
      onSaveDone();
    } catch (e) { setErr(e.message || 'Failed'); setBusy(false); }
  }

  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="al-modal iq-inline" onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">➕ Add Lead</h3>
          <button className="al-x" onClick={onClose}>✕</button>
        </div>
        {!cfg ? <div className="loading">Loading…</div> : (
          <>
            <LeadFormBody cfg={cfg} p={p} setPI={setPI} answers={answers} setAns={setAns} notes={notes} setNotes={setNotes} />
            {err && <div className="al-err">⚠️ {err}</div>}
            <button className="refresh al-save" onClick={save} disabled={busy}>{busy ? 'Saving…' : '💾 Save Lead'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('active'); // active | history
  const [filter, setFilter] = useState('all'); // all | new | quoted | booked
  const [checked, setChecked] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // 📤 which lead is mid-send, so its button can show progress
  const [sendingId, setSendingId] = useState(null);

  // 🗑️ bin click: 1st click → enter select mode; if items checked → delete; if in mode w/ none → exit
  function onBinClick() {
    if (!selectMode) { setSelectMode(true); return; }
    if (checked.length) { deleteChecked(); return; }
    setSelectMode(false);
  }
  async function deleteChecked() {
    if (!checked.length) return;
    if (!confirm(`Delete ${checked.length} lead(s)? This can't be undone.`)) return;
    try { await api.bulkDeleteLeads(checked); setMsg('🗑️ Deleted'); setTimeout(() => setMsg(''), 1500); setSelectMode(false); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  useEffect(() => { load(); }, [view]);
  async function load() {
    setLoading(true); setChecked([]); setSelectMode(false);
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

  // 📤 Email the packages straight from the list, so a vendor doesn't have to
  // open a lead just to send. Confirms first — this sends a real email — and
  // reloads afterwards so the status badge reflects whatever the send changed.
  async function sendPkgs(l, e) {
    e.stopPropagation();                        // don't open the lead behind it
    if (sendingId) return;
    if (!confirm(`Email the packages to ${l.name} at ${l.email}?`)) return;
    setSendingId(l.id);
    try {
      await api.sendPackages(l.id);
      setMsg(`📤 Sent to ${l.email}`);
      setTimeout(() => setMsg(''), 2500);
      load();
    } catch (err) {
      setMsg('⚠️ ' + (err.message || 'Could not send'));
      setTimeout(() => setMsg(''), 3500);
    } finally {
      setSendingId(null);
    }
  }

  if (sel) return <LeadDetail lead={sel} onBack={() => { setSel(null); load(); }} />;

  // 📊 stat tiles + filtering
  const counts = {
    all: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    quoted: leads.filter(l => l.status === 'quoted').length,
    booked: leads.filter(l => l.status === 'booked').length,
  };
  const byFilter = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const shown = search.trim()
    ? byFilter.filter(l => `${l.name} ${l.email} ${l.phone} ${l.event_type} ${l.location}`.toLowerCase().includes(search.toLowerCase()))
    : byFilter;

  // 🔢 Row number, counting down the table: the top row is #1. The list arrives
  // newest-first, so numbering follows that order rather than creation order —
  // otherwise the newest lead showed the highest number at the top and the
  // column read backwards. Built from the full list, not the visible rows, so
  // filtering or searching never renumbers what's left.
  const seq = new Map(leads.map((l, i) => [l.id, i + 1]));
  const seqOf = (id) => seq.get(id) ?? '—';
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
          {view === 'active' && <>
            <button className="lead-ic-btn" onClick={() => setShowAdd(true)} title="Add lead">➕</button>
            <button className={`lead-ic-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); setSearch(''); }} title="Search">🔍</button>
            <button className={`lead-ic-btn lead-ic-del ${selectMode ? 'is-on' : ''}`} onClick={onBinClick} title={selectMode ? (checked.length ? `Delete ${checked.length}` : 'Cancel select') : 'Select to delete'}>{selectMode && checked.length ? `🗑️ ${checked.length}` : '🗑️'}</button>
          </>}
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

      {showSearch && view === 'active' && (
        <input className="lead-search" autoFocus placeholder="🔍 Search name, email, phone, event…" value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {showAdd && <AddLeadModal vendorId={getUser()?.vendor_id} onClose={() => setShowAdd(false)} onSaveDone={() => { setShowAdd(false); load(); }} />}

      <div className="table-wrap">
        <table className="leads-table">
          <thead><tr>{view === 'active' && selectMode && <th className="col-check"></th>}<th className="col-num">#</th><th>Client</th><th>Event</th><th>Date</th><th>Location</th><th>Packages</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" className="empty">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan="9" className="empty">{view === 'active' ? 'No leads yet. Share your inquiry link! 📨' : 'No archived leads 📜'}</td></tr>
            ) : shown.map(l => (
              <tr key={l.id} onClick={() => { if (view !== 'active') return; if (selectMode) { setChecked(c => c.includes(l.id) ? c.filter(x => x !== l.id) : [...c, l.id]); } else { setSel(l); } }} className={view === 'active' ? 'row-clickable' : ''}>
                {view === 'active' && selectMode && (
                  <td className="cell-check" onClick={e => toggleCheck(l.id, e)}>
                    <input type="checkbox" readOnly checked={checked.includes(l.id)} className="lead-check" />
                  </td>
                )}
                <td className="col-num" data-label="#">{seqOf(l.id)}</td>
                <td className="biz" data-label="Client">{l.name}</td>
                <td data-label="Event">{l.event_type}</td>
                <td data-label="Date">{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
                <td data-label="Location">{l.location || '—'}</td>
                <td data-label="Packages">{l.package_name || '—'}</td>
                <td data-label="Status"><span className={`badge ${l.status === 'booked' ? 'active' : 'trial'}`}>{S_LABEL[l.status] || l.status}</span></td>
                <td data-label="Actions">
                  {view === 'active'
                    ? <div className="lead-actions">
                        {/* 📤 send from the list — no need to open the lead first.
                            Only offered once a package is assigned and an email
                            exists, since the mail has nothing to link to otherwise.
                            There's no Open button: the whole row is clickable. */}
                        {l.package_name && l.email && (
                          <button
                            className="lead-send"
                            disabled={sendingId === l.id}
                            onClick={e => sendPkgs(l, e)}
                            title={`Email the packages to ${l.email}`}
                          >
                            {sendingId === l.id ? '⏳ Sending…' : '📤 Send Packages'}
                          </button>
                        )}
                      </div>
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
  const [cfg, setCfg] = useState(null);
  const [ep, setEp] = useState({ role: lead.role || '', name: lead.name || '', email: lead.email || '', phone: lead.phone || '', instagram: lead.instagram || '', heard: lead.heard || '' });
  const [eAnswers, setEAnswers] = useState(lead.custom_data || {});
  const [eNotes, setENotes] = useState(lead.notes || '');
  const setEpi = (k, v) => setEp(s => ({ ...s, [k]: v }));
  const setEAns = (id, v) => setEAnswers(s => ({ ...s, [id]: v }));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkgs, setPkgs] = useState([]);
  const [pkgId, setPkgId] = useState(lead.package_id || '');
  const [gateway, setGateway] = useState(!!lead.gateway_enabled);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgMsg, setPkgMsg] = useState('');
  const [timer, setTimer] = useState({
    enabled: !!lead.timer_enabled,
    hours: lead.timer_hours ?? 72,
    started_at: lead.timer_started_at || null,
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function saveTimer(opts = {}) {
    const next = { enabled: timer.enabled, hours: Number(timer.hours) || 72, ...opts };
    try {
      const d = await api.saveTimer(lead.id, next);
      setTimer({ enabled: d.timer_enabled, hours: d.timer_hours, started_at: d.timer_started_at });
      setPkgMsg('✅ Timer saved'); setTimeout(() => setPkgMsg(''), 1500);
    } catch (e) { setPkgMsg('⚠️ ' + e.message); }
  }

  useEffect(() => {
    api.inquirySettings(lead.vendor_id).then(d => setCfg(d.settings)).catch(() => setCfg({}));
  }, [lead.vendor_id]);

  async function toggleGateway() {
    const next = !gateway;
    setGateway(next);
    try { await api.setGateway(lead.id, next); setPkgMsg(next ? '🔒 Secure login ON' : '🔓 Secure login OFF'); setTimeout(() => setPkgMsg(''), 1500); }
    catch (e) { setGateway(!next); setPkgMsg('⚠️ ' + e.message); }
  }
  // 📤 Emails the packages to the client. Same endpoint as the button in the
  // leads table, and it confirms first for the same reason: this sends a real
  // email, and a misclick can't be taken back.
  async function sendPackages() {
    if (pkgBusy) return;
    if (!lead.email) { setPkgMsg('⚠️ This lead has no email address'); setTimeout(() => setPkgMsg(''), 3000); return; }
    if (!confirm(`Email the packages to ${lead.name} at ${lead.email}?`)) return;
    setPkgBusy(true); setPkgMsg('');
    try { await api.sendPackages(lead.id); setPkgMsg(`📤 Sent to ${lead.email}`); setTimeout(() => setPkgMsg(''), 2500); }
    catch (e) { setPkgMsg('⚠️ ' + (e.message || 'Failed')); setTimeout(() => setPkgMsg(''), 3500); }
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

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.updateLead(lead.id, {
        name: ep.name, email: ep.email, phone: ep.phone,
        role: ep.role, instagram: ep.instagram, heard: ep.heard,
        notes: eNotes, custom_data: eAnswers,
      });
      setMsg('✅ Saved'); setEdit(false);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  const row = (label, value) => (
    <div className="ld-row">
      <div className="ld-label">{label}</div>
      <div>{value || '—'}</div>
    </div>
  );

  // ---- EDIT MODE ----
  if (edit) return (
    <div className="table-wrap ld-wrap iq-inline">
      <button className="refresh ld-cancel" onClick={() => setEdit(false)}>← Cancel</button>
      <h2 className="ld-h2">✏️ Edit Lead</h2>
      {msg && <div className="ld-msg is-err">{msg}</div>}
      {!cfg ? <div className="loading">Loading…</div> : (
        <>
          <LeadFormBody cfg={cfg} p={ep} setPI={setEpi} answers={eAnswers} setAns={setEAns} notes={eNotes} setNotes={setENotes} />
          <button className="refresh ld-save" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : '💾 Save changes'}
          </button>
        </>
      )}
    </div>
  );

  // ---- VIEW MODE ----
  return (
    <div className="ld-view">
      <div className="ld-topbar">
        <button className="refresh" onClick={onBack}>← Back to leads</button>
        <button className="refresh ld-edit-btn" onClick={() => { setF({ ...lead }); setEdit(true); }}>✏️ Edit Details</button>
      </div>
      <h2 className="ld-h2">{lead.name} · {lead.event_type}</h2>
      {msg && <div className="ld-msg is-ok">{msg}</div>}

      <div className="lead-grid">
      <div className="lead-left">

      {/* 👤 Contact Details */}
      <div className="ld-card">
        <div className="ld-card-h">👤 Contact Details</div>
        {row('🙋 Role', lead.role)}
        {row('📧 Email', lead.email)}
        {row('📞 Phone', lead.phone)}
        {row('📷 Instagram', lead.instagram)}
        {row('🔎 Heard via', lead.heard)}
      </div>

      {/* 🎉 Event Details — driven entirely by the vendor's own inquiry form.
          A fixed list of rows meant a DJ saw "Bride Getting Ready ❌ No" for a
          question their form never asked. Rows are built from the questions the
          client actually answered, using the vendor's own wording, and a row is
          only shown when there's an answer to put in it. */}
      {(() => {
        const defs = (Array.isArray(lead.form_snapshot) && lead.form_snapshot.length)
          ? lead.form_snapshot
          : (cfg?.custom_fields || []);
        const cd = lead.custom_data || {};
        const has = (v) => v !== '' && v !== null && v !== undefined && v !== false;

        // an answer's display value; checkboxes read as Yes, and a mapped column
        // wins over the raw answer because it's the coerced/cleaned version
        const valueFor = (f) => {
          const col = f.maps_to && lead[f.maps_to];
          const raw = cd[f.id];
          const v = has(col) ? col : raw;
          if (!has(v)) return null;
          if (v === true) return '✅ Yes';
          if (f.type === 'date') return String(v).slice(0, 10);
          return String(v);
        };

        const rows = defs.map(f => [f.label, valueFor(f)]).filter(([, v]) => v !== null);
        // notes aren't a form field — they're the free-text box every form has
        if (has(lead.notes)) rows.push(['📝 Notes', lead.notes]);
        if (!rows.length) return null;

        return (
          <div className="ld-card">
            <div className="ld-card-h">🎉 Event Details</div>
            {rows.map(([label, value], i) => (
              <div className="ld-row" key={i}>
                <div className="ld-label">{label}</div>
                <div>{value}</div>
              </div>
            ))}
          </div>
        );
      })()}

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
          <button className="refresh bx-primary ld-btn-sm" onClick={sendPackages} disabled={pkgBusy}>{pkgBusy ? 'Sending…' : '📤 Send Packages'}</button>
          <button className={`refresh ld-gate ld-btn-sm ${gateway ? 'is-on' : ''}`} onClick={toggleGateway}>🔒 Secure Login {gateway ? 'ON' : 'OFF'}</button>
          <div className={`ld-timer-btn ${timer.enabled ? 'is-on' : ''}`}>
            <button className="ld-timer-toggle" onClick={() => saveTimer({ enabled: !timer.enabled })}>⏳ Timer {timer.enabled ? 'ON' : 'OFF'}</button>
            <input className="ld-timer-hrs" type="number" min="1" max="720" value={timer.hours}
              onChange={e => setTimer(t => ({ ...t, hours: e.target.value }))}
              onBlur={() => timer.enabled && saveTimer()} title="Offer valid (hours)" />
            <span className="ld-timer-unit">h</span>
          </div>
        </div>
        {timer.enabled && (
          <div className="ld-timer-status">
            {timer.started_at
              ? <>▶ Expires in <b>{expiryText(timer.started_at, timer.hours)}</b></>
              : <>⚡ Starts when you send packages · <b>{timer.hours}h</b> window</>}
          </div>
        )}
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
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { title, body }

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await api.leadContracts(lead.id); setList(d.contracts || []); } catch {}
  }
  async function doPreview() {
    setBusy(true); setMsg('');
    try { const d = await api.previewContract(lead.id); setPreview(d); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function sendForSign() {
    setBusy(true); setMsg('');
    try {
      const tpls = await api.ctTemplates();
      const t = (tpls.templates || []).find(x => x.event_type && lead.event_type && x.event_type.toLowerCase() === String(lead.event_type).toLowerCase()) || (tpls.templates || [])[0];
      if (!t) throw new Error('No contract template. Set one up in Contracts & Invoices.');
      await api.createContractFromTemplate(lead.id, t.id);
      setMsg('✅ Contract ready — copy the signing link below'); setPreview(null); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function voidCt(id) {
    if (!confirm('Delete this contract?')) return;
    try { await api.voidContract(id); load(); } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function copyLink(token) {
    navigator.clipboard?.writeText(`https://iwopo.com/sign/${token}`);
    setMsg('🔗 Link copied!'); setTimeout(() => setMsg(''), 1500);
  }

  const S = { draft: '📝', sent: '📨', signed: '✅', void: '🚫' };
  return (
    <div className="ctb-wrap">
      <div className="ctb-head">
        <h3 className="ctb-h3">📄 Contract</h3>
        <button className="refresh ctb-preview" onClick={doPreview} disabled={busy}>{busy ? '…' : '👁️ Preview Contract'}</button>
      </div>
      <p className="ctb-hint">Auto-built from your Contract setup 🛠️</p>
      {msg && <div className={`ctb-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

      {list.length > 0 && (
        <div className="ctb-list">
          {list.map(c => (
            <div key={c.id} className="ctb-item">
              <span>{S[c.status]} <b>{c.title}</b> · {c.status}{c.signed_name ? ` by ${c.signed_name}` : ''}</span>
              <span className="ctb-actions">
                {c.status !== 'signed' && <span className="ctb-link" onClick={() => copyLink(c.token)}>🔗 Copy link</span>}
                {c.status === 'signed' && <span className="ctb-signed">{String(c.signed_at).slice(0, 10)}</span>}
                {c.status !== 'signed' && <span className="ctb-del" onClick={() => voidCt(c.id)}>🗑️</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="ctp-overlay" onClick={() => setPreview(null)}>
          <div className="ctp-modal" onClick={e => e.stopPropagation()}>
            <div className="ctp-head">
              <h3 className="ctp-title">📄 {preview.title}</h3>
              <button className="al-x" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="ctp-body">{preview.body}</div>
            <div className="ctp-foot">
              <button className="refresh" onClick={() => setPreview(null)}>Close</button>
              <button className="refresh ctb-preview" onClick={sendForSign} disabled={busy}>{busy ? 'Sending…' : '📨 Send for signing'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUSES = ['new', 'quoted', 'booked'];
const S_ICON = { new: '🆕', quoted: '📤', booked: '✅' };
const S_LABEL = { new: 'New', quoted: 'Package Sent', booked: 'Booking Confirmed' };

// ⏳ human "2d 4h" until offer expiry (or "expired")
function expiryText(startedAt, hours) {
  const end = new Date(startedAt).getTime() + (Number(hours) || 0) * 3600000;
  const ms = end - Date.now();
  if (ms <= 0) return 'expired';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MoneySection({ lead }) {
  const [data, setData] = useState(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('manual');
  const [money, setMoney] = useState({ deposit_percent: lead.deposit_percent ?? 30, discount_percent: lead.discount_percent ?? 0, price_override: lead.price_override ?? '' });
  const [status, setStatus] = useState(lead.status || 'new');
  const [webPay, setWebPay] = useState(lead.web_payment_enabled !== false);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await api.leadPayments(lead.id); setData(d); if (d.summary) setWebPay(d.summary.web_payment_enabled); } catch {}
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
  async function toggleWebPay() {
    const next = !webPay; setWebPay(next);
    try { await api.setWebPayment(lead.id, next); }
    catch (e) { setWebPay(!next); setMsg('⚠️ ' + e.message); }
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
  const pending = sum ? sum.balance : null;
  return (
    <div className="ms-wrap">
      {/* Status dropdown + web-payment toggle in one row */}
      <div className="ms-top-row">
        <div className="ms-status-row">
          <label className="ms-status-lbl">Status</label>
          <select className="ms-status-sel" value={status} onChange={e => changeStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{S_ICON[s]} {S_LABEL[s]}</option>)}
          </select>
        </div>
        <button className={`ms-webpay-chip ${webPay ? 'is-on' : ''}`} onClick={toggleWebPay}
          title={webPay ? 'Client can pay online by card' : 'Client pays in person only'}>
          💻 Online pay: <b>{webPay ? 'ON' : 'OFF'}</b>
        </button>
      </div>
      {msg && <div className={`ms-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</div>}

      <h3 className="ms-h3">💳 Payment & Deposit</h3>

      {/* deposit % + discount % + custom billed */}
      <div className="ms-fields">
        <div className="ms-field">
          <label className="ms-label">Deposit %</label>
          <input className="ms-input" type="number"
            value={money.deposit_percent} onChange={e => setMoney({ ...money, deposit_percent: e.target.value })} onBlur={saveMoney} />
        </div>
        <div className="ms-field">
          <label className="ms-label">Discount %</label>
          <input className="ms-input" type="number"
            value={money.discount_percent} onChange={e => setMoney({ ...money, discount_percent: e.target.value })} onBlur={saveMoney} />
        </div>
        <div className="ms-field">
          <label className="ms-label">Custom Billed ($)</label>
          <input className="ms-input" type="number" placeholder="auto"
            value={money.price_override} onChange={e => setMoney({ ...money, price_override: e.target.value })} onBlur={saveMoney} />
        </div>
      </div>

      {/* 3 tiles: Total / Received / Pending */}
      {sum && (
        <div className="ms-tiles">
          <div className="ms-tile ms-tile-total">
            <div className="ms-tile-lbl">Total Amount</div>
            <div className="ms-tile-val">${sum.final_total}</div>
            {sum.discount_amount > 0 && <div className="ms-tile-note">was ${sum.base_total}</div>}
          </div>
          <div className="ms-tile ms-tile-recv">
            <div className="ms-tile-lbl">Received</div>
            <div className="ms-tile-val">${sum.paid}</div>
          </div>
          <div className={`ms-tile ${pending > 0 ? 'ms-tile-pend' : 'ms-tile-clear'}`}>
            <div className="ms-tile-lbl">Pending</div>
            <div className="ms-tile-val">${pending}</div>
          </div>
        </div>
      )}
      {sum && <div className="ms-deposit-line">🔐 Deposit due: <b>${sum.deposit_amount}</b> ({sum.deposit_percent}%)</div>}

      {/* manual payments */}
      <div className="ms-mp-head">Manual Payments</div>
      <div className="ms-pay-row">
        <input className="ms-input ms-amt" type="number" placeholder="Amount $" value={amt} onChange={e => setAmt(e.target.value)} />
        <select className="ms-input ms-method" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="manual">Manual</option><option value="etransfer">E-transfer</option>
          <option value="cash">Cash</option><option value="card">Card</option>
        </select>
        <button className="refresh bx-primary ms-pay-btn" onClick={pay}>+ Add payment</button>
      </div>

      {data?.payments?.length > 0 ? (
        <div className="ms-pay-list">
          {data.payments.map(p => (
            <div key={p.id} className="ms-pay-item">
              <span>💵 <b>${Number(p.amount).toFixed(2)}</b> · {p.method} · {String(p.paid_at).slice(0, 10)}</span>
              <span className="bx-del" onClick={() => delPay(p.id)}>🗑️</span>
            </div>
          ))}
        </div>
      ) : <div className="ms-mp-empty">No manual payments recorded yet.</div>}
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
    navigator.clipboard?.writeText(`https://iwopo.com/invoice/${token}`);
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
    navigator.clipboard?.writeText(`https://iwopo.com/sign/${token}`);
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
  const [sel, setSel] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Loading…</div>;

  if (sel) return <LeadDetail lead={sel} onBack={() => setSel(null)} />;

  const now = new Date();
  const inMonth = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const inYear = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getFullYear() === now.getFullYear(); }).length;
  const nextYear = bookings.filter(b => { const d = b.event_date && new Date(b.event_date); return d && d.getFullYear() === now.getFullYear() + 1; }).length;

  // 🔢 Booking number, counting down the table so the top row is #1 — matching
  // the order the rows are actually rendered in. Built from the full list, not
  // the filtered rows, so searching never renumbers what's left.
  const bkSeq = new Map(bookings.map((b, i) => [b.id, i + 1]));
  const seqOf = (id) => bkSeq.get(id) ?? '—';

  // 🔍 search across client, event, date, location, phone, email
  const term = q.trim().toLowerCase();
  const match = (b) => !term || [b.name, b.event_type, b.event_date, b.location, b.phone, b.email]
    .some(v => v && String(v).toLowerCase().includes(term));
  const shown = bookings.filter(match);

  return (
    <div>
      <div className="bk-topbar">
        <div className="bk-stats">
          <div className="bk-stat"><span className="bk-stat-val">{inMonth}</span><span className="bk-stat-lbl">This Month</span></div>
          <div className="bk-stat"><span className="bk-stat-val">{inYear}</span><span className="bk-stat-lbl">This Year</span></div>
          <div className="bk-stat"><span className="bk-stat-val">{nextYear}</span><span className="bk-stat-lbl">Next Year</span></div>
        </div>
        <div className="bk-toggle">
          <button className={`bk-tog-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); if (showSearch) setQ(''); }} title="Search bookings">🔍</button>
          <button className={`bk-tog-btn ${mode === 'list' ? 'is-on' : ''}`} onClick={() => setMode('list')}>📋 List</button>
          <button className={`bk-tog-btn ${mode === 'calendar' ? 'is-on' : ''}`} onClick={() => setMode('calendar')}>🗓️ Calendar</button>
        </div>
      </div>

      {showSearch && (
        <div className="bk-search">
          <input className="gal-input" placeholder="🔍 Search bookings — client, event, date, location…"
            value={q} onChange={e => setQ(e.target.value)} autoFocus />
          {term && <span className="bk-search-count">{shown.length} match{shown.length === 1 ? '' : 'es'}</span>}
        </div>
      )}

      {mode === 'calendar' ? <CalendarView onOpen={setSel} filter={term} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th className="col-num">#</th><th>Client</th><th>Event</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan="7" className="empty">{term ? 'No bookings match your search 🔍' : "No bookings yet. Set a lead's status to ✅ booked!"}</td></tr>
              ) : shown.map(b => (
                <tr key={b.id} className="row-clickable" onClick={() => setSel(b)}>
                  <td className="col-num" data-label="#">{seqOf(b.id)}</td>
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
  { t: 'hours', label: '⏱️ Hours' },
  { t: 'location', label: '📍 Location' },
  { t: 'checkbox', label: '☑️ Checkbox' },
];

function FieldBuilder({ fields, setFields }) {
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, width: '100%', fontSize: 13 };
  const uid = () => 'f' + Math.random().toString(36).slice(2, 8);

  // 🔗 Which real lead columns a field can feed. Fetched from the API so the
  // builder always offers exactly what the server will accept.
  const [cols, setCols] = useState([]);
  useEffect(() => { api.mappableColumns().then(d => setCols(d.columns || [])).catch(() => {}); }, []);

  const add = (t) => setFields([...fields, { id: uid(), type: t, label: '', required: false, maps_to: '', options: t === 'dropdown' ? ['Option 1'] : [] }]);
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

          {/* ⏱️ an Hours field can calculate itself from two Time fields on the
              same form. Only Time fields are offered, and only ones that exist. */}
          {f.type === 'hours' && (() => {
            const times = fields.filter(x => x.type === 'time' && x.label);
            if (!times.length) return (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                💡 Add two <strong>🕐 Time</strong> fields to calculate hours automatically.
              </p>
            );
            return (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Calculate from ⏱️</label>
                  <select style={{ ...box, fontSize: 12 }} value={f.from_field || ''}
                    onChange={e => upd(i, { from_field: e.target.value })}>
                    <option value="">Client types it</option>
                    {times.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>…until</label>
                  <select style={{ ...box, fontSize: 12 }} value={f.to_field || ''}
                    onChange={e => upd(i, { to_field: e.target.value })}>
                    <option value="">Client types it</option>
                    {times.filter(t => t.id !== f.from_field).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })()}

          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input type="checkbox" checked={f.required} onChange={e => upd(i, { required: e.target.checked })} /> Required
          </label>

          {/* 📋 "Show on leads" — fills the EVENT column of the leads table.
              Only one field can, so ticking this unticks whichever field had it.
              It's the same maps_to mechanism as the dropdown below, surfaced as a
              checkbox because filling that column is what vendors actually ask for. */}
          {cols.some(c => c.key === 'event_type' && c.types.includes(f.type)) && (
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={f.maps_to === 'event_type'}
                onChange={e => {
                  const on = e.target.checked;
                  setFields(fields.map((o, idx) => {
                    if (idx === i) return { ...o, maps_to: on ? 'event_type' : '' };
                    // only one field may own the column — release it from any other
                    return on && o.maps_to === 'event_type' ? { ...o, maps_to: '' } : o;
                  }));
                }}
              />
              Show in the <strong style={{ color: 'var(--text)' }}>Event</strong> column on Leads
            </label>
          )}

          {/* 🔗 optional link to a real lead column, so the answer shows in
              Bookings / Calendar / the lead details rather than only in the
              custom-answers list. Only columns this field's type can fill.
              event_type is excluded — the checkbox above owns that one, so the
              same setting never appears in two controls. */}
          {cols.some(c => c.key !== 'event_type' && c.types.includes(f.type)) && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
                Where should this answer appear? 🔗
              </label>
              <select
                style={{ ...box, fontSize: 12 }}
                value={f.maps_to === 'event_type' ? '' : (f.maps_to || '')}
                disabled={f.maps_to === 'event_type'}
                onChange={e => upd(i, { maps_to: e.target.value })}
              >
                <option value="">📋 In the answers list only</option>
                {cols.filter(c => c.key !== 'event_type' && c.types.includes(f.type)).map(c => {
                  // one column can only be fed by one field
                  const taken = fields.some((o, oi) => oi !== i && o.maps_to === c.key);
                  return <option key={c.key} value={c.key} disabled={taken}>
                    ⭐ {c.label}{taken ? ' — used by another field' : ''}
                  </option>;
                })}
              </select>
              <p style={{ fontSize: 10.5, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
                {f.maps_to === 'event_type'
                  ? <>📋 Already showing in the <strong>Event</strong> column — untick above to change this.</>
                  : f.maps_to
                    ? <>⭐ Shows as <strong>{cols.find(c => c.key === f.maps_to)?.label}</strong> on the lead, and in Bookings, Calendar and contracts.</>
                    : <>📋 Saved with the inquiry and shown in the lead&apos;s answers list. Pick a field above to also show it on the lead card.</>}
              </p>
            </div>
          )}
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
    try {
      await api.saveInquirySettings(s);
      // Re-read from the server rather than trusting the local copy. A save that
      // half-succeeded, or a second tab editing the same form, would otherwise
      // leave the panel showing something the public form never received —
      // "✅ Saved" while the two quietly disagree.
      const fresh = await api.inquirySettings(user?.vendor_id);
      setS(fresh.settings);
      setMsg('✅ Saved');
      setTimeout(() => setMsg(''), 2500);
    }
    catch (e) { setMsg('⚠️ ' + e.message); }
    setSaving(false);
  }
  if (!s) return <div className="loading">Loading…</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🎨 Customize your inquiry form {msg && <span style={{ fontSize: 13, color: '#4ade80' }}>{msg}</span>}</h2>
        <p className="sub" style={{ marginBottom: 14 }}>
          Your link: <b style={{ color: '#2dd4bf' }}>iwopo.com/inquiry/{user?.vendor_id}</b> 🔗
          {' · '}
          {/* opens the live public form, so a vendor can check a change landed
              without hunting for the URL. Cache-busted because the page they
              last looked at may still be open in another tab. */}
          <a href={`/inquiry/${user?.vendor_id}?v=${Date.now()}`} target="_blank" rel="noreferrer"
            style={{ color: '#2dd4bf', textDecoration: 'underline' }}>
            👁️ Preview
          </a>
        </p>

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
    localStorage.setItem('vf_time_format', next.time_format || '12h');
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
        <PasswordInput style={box} value={em.password} onChange={e => setEm({ ...em, password: e.target.value })} placeholder="Current password" />
        <button className="refresh" onClick={saveEmail} style={{ marginTop: 8 }}>Update email</button>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 18 }}>🔑 Change password</label>
        <PasswordInput style={box} value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} placeholder="Current password" />
        <PasswordInput style={box} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} placeholder="New password (min 6)" />
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
          <PasswordInput style={box} placeholder="SMTP password" value={s.smtp_pass || ''} onChange={e => setS({ ...s, smtp_pass: e.target.value })} />
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
