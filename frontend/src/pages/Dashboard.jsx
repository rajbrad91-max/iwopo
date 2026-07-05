import { useState, useEffect } from 'react';
import { api, getUser, clearSession } from '../lib/api';
import { COUNTRIES } from '../lib/countries';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar, Line
} from 'recharts';
import './super.css';

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', group: 'PLATFORM' },
  { id: 'services', icon: '🧩', label: 'Services & Packages', group: 'PLATFORM' },
  { id: 'manage', icon: '🛠️', label: 'Manage Services', group: 'PLATFORM' },
  { id: 'buyers', icon: '🛒', label: 'Buyers', group: 'PLATFORM' },
  { id: 'referrals', icon: '👥', label: 'Referrals', group: 'PLATFORM' },
  { id: 'billing', icon: '💳', label: 'Billing & Plans', group: 'PLATFORM' },
  { id: 'support', icon: '🎫', label: 'Support', group: 'OPERATE' },
  { id: 'settings', icon: '🔧', label: 'Platform Settings', group: 'OPERATE' },
  { id: 'admins', icon: '🔐', label: 'Admins', group: 'OPERATE' },
];
const TEAL = '#2dd4bf';

export default function Dashboard({ onLogout }) {
  const [view, setView] = useState('dashboard');
  const [vendors, setVendors] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saTheme, setSaTheme] = useState(() => localStorage.getItem('vf_super_theme') || 'dark');
  const user = getUser();

  // 🌗 apply super theme to .sa-wrap only (never touches vendor panels)
  useEffect(() => { localStorage.setItem('vf_super_theme', saTheme); }, [saTheme]);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const [v, p] = await Promise.all([api.vendors(), api.packages()]);
      setVendors(v.vendors || []);
      setPackages(p.packages || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  function logout() { clearSession(); onLogout(); }

  const trials = vendors.filter(v => v.status === 'trial').length;

  return (
    <div className="sa-wrap" data-sa-theme={saTheme}>
      <aside className={`sa-sidebar ${sidebarOpen ? 'show' : ''}`}>
        <div className="sa-brand"><span className="hex">⬡</span><div>VOWFLO<br /><small>SUPER</small></div></div>
        {['PLATFORM', 'OPERATE'].map(g => (
          <div key={g}>
            <div className="sa-nav-label">{g}</div>
            {NAV.filter(n => n.group === g).map(n => (
              <div key={n.id} className={`sa-nav-item ${view === n.id ? 'active' : ''}`}
                onClick={() => { setView(n.id); setSidebarOpen(false); }}>
                <span className="ico">{n.icon}</span> {n.label}
              </div>
            ))}
          </div>
        ))}
        <div className="sa-nav-item sa-logout" onClick={logout}><span className="ico">🚪</span> Log out</div>
      </aside>

      {sidebarOpen && <div className="sa-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="sa-main">
        <div className="sa-topbar">
          <div className="sa-topbar-left">
            <span className="sa-hamburger" onClick={() => setSidebarOpen(true)}>☰</span>
            <div>
              <h1>{NAV.find(n => n.id === view)?.label}</h1>
              <div className="sa-sub">Welcome back, {user?.name} 👋</div>
            </div>
          </div>
          <AdminBells goView={setView} />
        </div>

        {loading ? <div className="sa-loading">Loading…</div> : (
          <>
            {view === 'dashboard' && <DashboardView vendors={vendors} packages={packages} trials={trials} />}
            {view === 'services' && <ServicesView packages={packages} onReload={load} />}
            {view === 'manage' && <ManageServicesView />}
            {view === 'buyers' && <BuyersView vendors={vendors} />}
            {view === 'referrals' && <ReferralsView />}
            {view === 'billing' && <BillingView packages={packages} />}
            {view === 'support' && <SupportView />}
            {view === 'settings' && <SettingsView saTheme={saTheme} setSaTheme={setSaTheme} />}
            {view === 'admins' && <AdminsView user={user} />}
          </>
        )}
      </main>
    </div>
  );
}

function money(v) { return v == null ? null : `$${Number(v).toFixed(2)}`; }

function AdminBells({ goView }) {
  const [c, setC] = useState({ messages: 0, paid: 0, trials: 0 });
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 🔄 live every 30s
    return () => clearInterval(t);
  }, []);
  function load() { api.adminCounts().then(setC).catch(() => {}); }

  async function open(group, view) {
    try { await api.markCountSeen(group); } catch {}
    setC(x => ({ ...x, [group]: 0 }));
    goView(view);
  }

  const Bell = ({ emoji, n, title, onClick }) => (
    <button className="sa-bell" title={title} onClick={onClick}>
      {emoji}
      {n > 0 && <span className="sa-bell-badge">{n}</span>}
    </button>
  );

  return (
    <div className="sa-bells">
      <Bell emoji="📨" n={c.messages} title="Support messages" onClick={() => open('messages', 'support')} />
      <Bell emoji="💰" n={c.paid} title="New paid subscribers" onClick={() => open('paid', 'buyers')} />
      <Bell emoji="🎁" n={c.trials} title="New trial subscribers" onClick={() => open('trials', 'buyers')} />
    </div>
  );
}

/* ---------- DASHBOARD ---------- */
function DashboardView({ vendors, packages, trials }) {
  const growth = [
    { m: 'Nov', mrr: 4.1, sellers: 6 }, { m: 'Dec', mrr: 4.6, sellers: 8 },
    { m: 'Jan', mrr: 5.0, sellers: 7 }, { m: 'Feb', mrr: 5.3, sellers: 9 },
    { m: 'Mar', mrr: 5.7, sellers: 8 }, { m: 'Apr', mrr: 6.0, sellers: 11 },
    { m: 'May', mrr: 6.2, sellers: 9 }, { m: 'Jun', mrr: 6.4, sellers: 12 },
  ];
  const vTypes = [
    { n: '📸 Photographer', v: 61, c: '#2dd4bf' }, { n: '💄 Makeup', v: 17, c: '#4ade80' },
    { n: '🎬 Editor', v: 14, c: '#60a5fa' }, { n: '🎧 DJ', v: 10, c: '#fbbf24' },
    { n: '🎪 360 Booth', v: 9, c: '#a78bfa' }, { n: 'Other', v: 17, c: '#7c9199' },
  ];
  const countries = [
    ['Canada', '🇨🇦', 52], ['United States', '🇺🇸', 38], ['United Kingdom', '🇬🇧', 16],
    ['Australia', '🇦🇺', 11], ['India', '🇮🇳', 7], ['Other', '🌐', 4],
  ];
  const maxC = Math.max(...countries.map(c => c[2]));

  // Sellable items — packages + standalone services (as sold)
  const palette = ['#2dd4bf','#60a5fa','#a78bfa','#fbbf24','#4ade80','#f472b6','#22d3ee','#fb923c'];
  const sellables = [
    '🎬 Studio Special', '🏢 Vendor Suite', '📸 Galleries',
    '🤖 AI Chatbot', '💬 Non-AI Chatbot', '☁️ File & Cloud', '🌐 Website Builder',
  ];
  const svcData = sellables.map((name, i) => ({
    name, v: 88 - i * 10, c: palette[i % palette.length],
  }));

  return (
    <>
      <div className="sa-stats">
        <StatCard label="Total Sellers" value={vendors.length || 128} trend="▲ 12 this month" cls="up" />
        <StatCard label="MRR" value="$6.4k" trend="▲ 8.2%" cls="up" />
        <StatCard label="Active Trials" value={trials || 19} trend="7 ending soon" cls="warn" />
        <StatCard label="Packages" value={packages.length || 3} trend="Live tiers" cls="up" />
      </div>

      <div className="sa-grid-2">
        <div className="sa-box">
          <h3>Revenue & Seller Growth</h3><div className="sa-box-sub">MRR vs new sellers — last 8 months</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growth}>
                <CartesianGrid stroke="#223238" />
                <XAxis dataKey="m" tick={{ fill: '#7c9199', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7c9199', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a282d', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
                <Bar dataKey="sellers" fill="#14b8a655" stroke="#14b8a6" radius={[6,6,0,0]} />
                <Line type="monotone" dataKey="mrr" stroke={TEAL} strokeWidth={3} dot={{ fill: TEAL, r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sa-box">
          <h3>🌍 Sellers by Country</h3><div className="sa-box-sub">Where your sellers are based</div>
          <div className="sa-country-list">
            {countries.map(c => (
              <div key={c[0]} className="sa-cty-row">
                <span className="sa-cty-flag">{c[1]}</span>
                <div className="sa-cty-info">
                  <div className="sa-cty-top"><span>{c[0]}</span><span className="cnt">{c[2]} sellers</span></div>
                  <div className="sa-cty-bar"><div className="sa-cty-fill" style={{ width: `${c[2]/maxC*100}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sa-grid-2eq">
        <div className="sa-box">
          <h3>📊 Service Performance</h3><div className="sa-box-sub">Adoption across your services</div>
          <div style={{ minHeight: 180, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="50%" height={210}>
              <PieChart>
                <Pie data={svcData} dataKey="v" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {svcData.map((d, i) => <Cell key={i} fill={d.c} stroke="#131e22" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="sa-adopt">
              {svcData.slice(0, 7).map((s, i) => (
                <div key={i} className="sa-ad-row">
                  <div className="sa-ad-top"><span>{s.name}</span><span className="cnt">{s.v}%</span></div>
                  <div className="sa-ad-bar"><div className="sa-ad-fill" style={{ width: `${s.v}%`, background: s.c }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sa-box">
          <h3>🍩 Vendors by Type</h3><div className="sa-box-sub">Vendors per profession</div>
          <div style={{ height: 180, display: 'flex' }}>
            <ResponsiveContainer width="45%" height="100%">
              <PieChart>
                <Pie data={vTypes} dataKey="v" nameKey="n" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {vTypes.map((d, i) => <Cell key={i} fill={d.c} stroke="#131e22" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="sa-legend">
              {vTypes.map((t, i) => (
                <div key={i} className="sa-legend-item">
                  <span className="sa-legend-dot" style={{ background: t.c }} />{t.n}
                  <span className="sa-legend-val">{t.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, trend, cls }) {
  return (
    <div className="sa-card">
      <div className="sa-label">{label}</div>
      <div className="sa-value">{value}</div>
      <div className={`sa-trend ${cls}`}>{trend}</div>
    </div>
  );
}

/* ---------- SERVICES & PACKAGES ---------- */
function ServicesView({ packages, onReload }) {
  const [editMode, setEditMode] = useState(false);
  const [offers, setOffers] = useState([]);
  const [showOffer, setShowOffer] = useState(false);
  const [nf, setNf] = useState({ code: '', label: '', percent_off: '', ends_at: '' });

  useEffect(() => { loadOffers(); }, []);
  async function loadOffers() {
    try { const d = await api.offers(); setOffers(d.offers || []); } catch {}
  }
  async function addOffer() {
    if (!nf.code || !nf.percent_off) return alert('Code + percent needed');
    try {
      await api.createOffer({ ...nf, percent_off: Number(nf.percent_off) });
      setNf({ code: '', label: '', percent_off: '', ends_at: '' });
      setShowOffer(false);
      loadOffers();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      {/* OFFERS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="sa-section-title" style={{ margin: 0 }}>Offers & Discounts 🎁</div>
        <button className="sa-view-btn" onClick={() => setShowOffer(!showOffer)}>
          {showOffer ? '✕ Cancel' : '+ New Offer'}
        </button>
      </div>

      {showOffer && (
        <div className="sa-box" style={{ marginBottom: 12 }}>
          <div className="sa-offer-form">
            <input placeholder="CODE (e.g. SUMMER20)" value={nf.code} onChange={e => setNf({ ...nf, code: e.target.value.toUpperCase() })} />
            <input placeholder="Label" value={nf.label} onChange={e => setNf({ ...nf, label: e.target.value })} />
            <input placeholder="% off" type="number" value={nf.percent_off} onChange={e => setNf({ ...nf, percent_off: e.target.value })} style={{ width: 80 }} />
            <input placeholder="Ends" type="date" value={nf.ends_at} onChange={e => setNf({ ...nf, ends_at: e.target.value })} />
            <button className="sa-btn-teal" onClick={addOffer}>Create</button>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="sa-offer-list">
          {offers.map(o => (
            <div key={o.id} className={`sa-offer-chip ${o.active ? '' : 'off'}`}>
              <span className="oc-code">🏷️ {o.code}</span>
              <span className="oc-pct">{o.percent_off}% off</span>
              {o.label && <span className="oc-label">{o.label}</span>}
              {o.ends_at && <span className="oc-end">till {String(o.ends_at).slice(0, 10)}</span>}
              <button onClick={async () => { await api.toggleOffer(o.id); loadOffers(); }} title="toggle">{o.active ? '🟢' : '⚪'}</button>
              <button onClick={async () => { if (confirm('Delete offer?')) { await api.deleteOffer(o.id); loadOffers(); } }} title="delete">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* PACKAGES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, marginTop: 18 }}>
        <div className="sa-section-title" style={{ margin: 0 }}>Packages & Pricing 🎁</div>
        <button className={`sa-view-btn ${editMode ? 'active-btn' : ''}`}
          onClick={() => setEditMode(!editMode)}>
          {editMode ? '✓ Done' : '✏️ Edit Prices'}
        </button>
      </div>
      <div className="sa-hint" style={{ marginTop: 0, marginBottom: 14 }}>
        {editMode ? 'Click any price to change it, then Save.' : 'Every package includes a 30-day free trial.'}
      </div>
      <div className="sa-pkg-grid">
        {packages.map(p => <PackageCard key={p.id} pkg={p} editMode={editMode} onSaved={onReload} />)}
      </div>

      {/* STANDALONE SERVICES */}
      <StandaloneServices />
    </>
  );
}

function StandaloneServices() {
  const [services, setServices] = useState([]);
  const [edit, setEdit] = useState(false);
  useEffect(() => { load(); }, []);
  function load() { api.services().then(d => setServices((d.services || []).filter(s => Number(s.price) > 0))).catch(() => {}); }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, marginTop: 22 }}>
        <div className="sa-section-title" style={{ margin: 0 }}>Standalone Services 🧩</div>
        <button className={`sa-view-btn ${edit ? 'active-btn' : ''}`} onClick={() => setEdit(!edit)}>
          {edit ? '✓ Done' : '✏️ Edit Prices'}
        </button>
      </div>
      <div className="sa-hint" style={{ marginTop: 0, marginBottom: 14 }}>
        {edit ? 'Click a price to change it, then Save. Shows live on the public page.' : 'Individual services sold on their own.'}
      </div>
      <div className="sa-pkg-grid">
        {services.map(s => (
          <div key={s.id} className="sa-box" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 26 }}>{s.icon}</div>
            <div style={{ fontWeight: 700 }}>{s.name}{s.is_addon ? ' · add-on' : ''}</div>
            {edit
              ? <><ServicePriceEditor service={s} onSaved={load} />{s.tiers && <TierEditor service={s} onSaved={load} />}<CountryPriceEditor type="service" item={s} onSaved={load} /></>
              : <>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{s.tiers ? 'from ' : ''}${s.price}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/mo</span>{s.price_annual ? <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', fontWeight: 600 }}>${s.price_annual}/yr</span> : null}</div>
                  {s.tiers && (
                    <div style={{ marginTop: 4 }}>
                      {s.tiers.map(t => (
                        <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: 'var(--muted)' }}>
                          <span>{t.label}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>${t.price}/mo{t.price_annual ? ` · $${t.price_annual}/yr` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <CountryPriceList cp={s.country_prices} />
                </>}
          </div>
        ))}
      </div>
    </>
  );
}

// read a country_prices entry (number legacy OR {m,y}) → {m, y}
function cpEntry(v) {
  if (v == null) return { m: null, y: null };
  if (typeof v === 'object') return { m: v.m ?? null, y: v.y ?? null };
  return { m: v, y: null };
}

function CountryPriceList({ cp }) {
  const entries = Object.entries(cp || {}).filter(([k]) => k !== 'default');
  if (!entries.length) return null;
  const nameOf = (c) => COUNTRIES.find(x => x.code === c)?.name || c;
  return (
    <div style={{ marginTop: 6, borderTop: '1px dashed var(--line)', paddingTop: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>🌍 Exceptions</div>
      {entries.map(([c, v]) => {
        const e = cpEntry(v);
        return (
          <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '1px 0', color: 'var(--muted)' }}>
            <span>{nameOf(c)}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>${e.m}/mo{e.y ? ` · $${e.y}/yr` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function CountryPriceEditor({ type, item, baseField = 'price', onSaved }) {
  const [cp, setCp] = useState(item.country_prices || {});
  const [country, setCountry] = useState('CA-BC');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(next) {
    setSaving(true);
    try { await api.updateCountryPrices(type, item.id, next); setCp(next); onSaved && onSaved(); }
    catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  }
  function add() {
    if (m === '') return;
    save({ ...cp, [country]: { m: Number(m), y: y === '' ? null : Number(y) } });
    setM(''); setY('');
  }
  function remove(code) {
    const n = { ...cp }; delete n[code]; save(n);
  }
  const nameOf = (c) => COUNTRIES.find(x => x.code === c)?.name || c;
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px' };

  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>🌍 Country exceptions (default = USD)</div>
      {Object.entries(cp).map(([c, v]) => {
        const e = cpEntry(v);
        return (
          <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
            <span>{nameOf(c)}</span>
            <span style={{ display: 'flex', gap: 8 }}><b>${e.m}/mo{e.y ? ` · $${e.y}/yr` : ''}</b><span style={{ cursor: 'pointer' }} onClick={() => remove(c)}>🗑️</span></span>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
        <select style={{ ...box, flex: 1, fontSize: 12, minWidth: 140 }} value={country} onChange={e => setCountry(e.target.value)}>
          {COUNTRIES.filter(c => c.code !== 'default').map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input style={{ ...box, width: 60 }} type="number" placeholder="mo$" value={m} onChange={e => setM(e.target.value)} />
        <input style={{ ...box, width: 60 }} type="number" placeholder="yr$" value={y} onChange={e => setY(e.target.value)} />
        <button className="sa-btn-teal" onClick={add} disabled={saving} style={{ padding: '5px 10px' }}>+</button>
      </div>
    </div>
  );
}

function TierEditor({ service, onSaved }) {
  const [tiers, setTiers] = useState(() => (service.tiers || []).map(t => ({ ...t })));
  const [saving, setSaving] = useState(false);
  const set = (i, k, v) => setTiers(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  async function save() {
    setSaving(true);
    try {
      const clean = tiers.map(t => ({ label: t.label, price: Number(t.price) || 0, price_annual: t.price_annual === '' || t.price_annual == null ? null : Number(t.price_annual) }));
      await api.updateServiceTiers(service.id, clean);
      onSaved && onSaved();
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  }
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', padding: '5px 7px', width: 62 };
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>📦 Tiers (mo / yr)</div>
      {tiers.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 5 }}>
          <span style={{ width: 46, fontSize: 12 }}>{t.label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>$</span>
          <input style={box} type="number" value={t.price} onChange={e => set(i, 'price', e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>yr$</span>
          <input style={box} type="number" placeholder="—" value={t.price_annual ?? ''} onChange={e => set(i, 'price_annual', e.target.value)} />
        </div>
      ))}
      <button className="sa-btn-teal" onClick={save} disabled={saving} style={{ padding: '5px 12px', marginTop: 4 }}>{saving ? '…' : 'Save tiers'}</button>
    </div>
  );
}

function ServicePriceEditor({ service, onSaved }) {
  const [p, setP] = useState(service.price ?? '');
  const [pa, setPa] = useState(service.price_annual ?? '');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.updateServicePrice(service.id, {
        price: p === '' ? 0 : Number(p),
        price_annual: pa === '' ? null : Number(pa),
        price_annual_regular: service.price_annual_regular ?? null,
      });
      onSaved && onSaved();
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>mo $</span>
        <input type="number" value={p} onChange={e => setP(e.target.value)}
          style={{ width: 68, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px' }} />
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>yr $</span>
        <input type="number" value={pa} onChange={e => setPa(e.target.value)} placeholder="—"
          style={{ width: 68, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px' }} />
        <button className="sa-btn-teal" onClick={save} disabled={saving} style={{ padding: '5px 12px' }}>{saving ? '…' : 'Save'}</button>
      </div>
    </div>
  );
}

function PriceEditor({ item, isPackage, onSaved }) {
  const [m, setM] = useState(item.price_monthly ?? '');
  const [y, setY] = useState(item.price_annual ?? '');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const body = { price_monthly: m === '' ? null : Number(m), price_annual: y === '' ? null : Number(y), price_annual_regular: item.price_annual_regular ?? null };
      if (isPackage) await api.updatePackagePrice(item.id, body);
      else await api.updateItemPrice(item.id, body);
      onSaved && onSaved();
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  }
  return (
    <div className="sa-price-edit">
      <span>$</span><input value={m} onChange={e => setM(e.target.value)} placeholder="mo" />
      <span>/yr $</span><input value={y} onChange={e => setY(e.target.value)} placeholder="yr" />
      <button onClick={save} disabled={saving}>{saving ? '…' : '💾'}</button>
    </div>
  );
}

function PackageCard({ pkg, editMode, onSaved }) {
  const hasAnnual = pkg.price_annual != null;
  return (
    <div className="sa-pkg-card">
      <div className="sa-pkg-head">
        <div className="sa-pkg-icon">{pkg.icon}</div>
        <div>
          <div className="sa-pkg-name">{pkg.name}</div>
          <div className="sa-pkg-tag">{pkg.tagline}</div>
        </div>
      </div>

      {pkg.price_monthly != null ? (
        editMode ? <><PriceEditor item={pkg} isPackage onSaved={onSaved} /><CountryPriceEditor type="package" item={pkg} baseField="price_monthly" onSaved={onSaved} /></> : (
          <div className="sa-pkg-price">
            <span className="amt">{money(pkg.price_monthly)}</span><span className="per">/mo</span>
            {hasAnnual && (
              <div className="sa-pkg-annual">
                or <b>{money(pkg.price_annual)}</b>/yr
                {pkg.price_annual_regular && <s>{money(pkg.price_annual_regular)}</s>}
              </div>
            )}
            <CountryPriceList cp={pkg.country_prices} />
          </div>
        )
      ) : (
        <div className="sa-pkg-price"><span className="amt-sm">À la carte</span></div>
      )}

      <div className="sa-trial-pill">🎁 {pkg.trial_days}-day free trial</div>

      {pkg.included?.length > 0 && (
        <div className="sa-pkg-sec">
          <div className="sa-pkg-sec-label">✓ INCLUDED</div>
          {pkg.included.map(i => (
            <div key={i.id} className="sa-pkg-item">
              <span>{i.icon} {i.name}</span>
              {i.detail && <span className="sa-pkg-detail">{i.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {pkg.standalone?.length > 0 && (
        <div className="sa-pkg-sec">
          <div className="sa-pkg-sec-label">SERVICES</div>
          {pkg.standalone.map(i => (
            <div key={i.id} className="sa-pkg-item sa-pkg-item-col">
              <span>{i.icon} {i.name}{i.detail ? ` · ${i.detail}` : ''}</span>
              {editMode ? <PriceEditor item={i} onSaved={onSaved} /> : (
                <span className="sa-pkg-iprice">
                  {money(i.price_monthly)}{i.price_annual ? ` · ${money(i.price_annual)}/yr` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pkg.addons?.length > 0 && (
        <div className="sa-pkg-sec">
          <div className="sa-pkg-sec-label">➕ ADD-ONS</div>
          {pkg.addons.map(i => (
            <div key={i.id} className="sa-pkg-item sa-pkg-item-col">
              <span>{i.icon} {i.name}{i.detail ? ` · ${i.detail}` : ''}</span>
              {editMode ? <PriceEditor item={i} onSaved={onSaved} /> : (
                <span className="sa-pkg-iprice">
                  {money(i.price_monthly)}{i.price_annual ? ` · ${money(i.price_annual)}/yr` : ''}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- MANAGE SERVICES ---------- */
const MANAGE_SERVICES = [
  { key: 'galleries', icon: '📸', name: 'Galleries', desc: 'Client albums & downloads', sold: true },
  { key: 'leads', icon: '📋', name: 'Leads & Bookings', desc: 'Leads, bookings & inquiry form', sold: true },
  { key: 'contracts', icon: '📄', name: 'Contracts', desc: 'Contracts & print requests', sold: true },
  { key: 'calendar', icon: '📅', name: 'Calendar', desc: 'Bookings & crew scheduling', sold: true },
  { key: 'smartchat', icon: '🤖', name: 'Smart Chat Assistant', desc: 'AI chatbot for their site', sold: true },
  { key: 'chat', icon: '💬', name: 'Chat Assistant', desc: 'Non-AI chatbot', sold: true },
  { key: 'website', icon: '🌐', name: 'Website Builder', desc: 'Portfolio, pages & images', sold: true },
  { key: 'fileflyer', icon: '📦', name: 'File Flyer', desc: 'Large file transfer & cloud', sold: true },
  { key: 'analytics', icon: '📊', name: 'Analytics', desc: 'Visitor & album analytics', sold: false },
  { key: 'liveshoots', icon: '🎥', name: 'Live Shoots', desc: 'Live shoot management', sold: false },
];

function ManageServicesView() {
  const [active, setActive] = useState(null);
  if (active) {
    const svc = MANAGE_SERVICES.find(s => s.key === active);
    return (
      <>
        <button className="sa-view-btn" onClick={() => setActive(null)} style={{ marginBottom: 14 }}>← Back to services</button>
        <div className="sa-box" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 46 }}>{svc.icon}</div>
          <h2 style={{ margin: '10px 0 6px' }}>{svc.name}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{svc.desc}</p>
          <div className="sa-trial-pill" style={{ marginTop: 14 }}>🚧 Admin panel coming next</div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="sa-section-title">Manage Services 🛠️</div>
      <div className="sa-hint" style={{ marginTop: 0, marginBottom: 14 }}>
        Full control of every service. Vendors see only what they subscribe to.
      </div>
      <div className="sa-manage-grid">
        {MANAGE_SERVICES.map(s => (
          <div key={s.key} className="sa-manage-card" onClick={() => setActive(s.key)}>
            <div className="sa-manage-icon">{s.icon}</div>
            <div className="sa-manage-name">{s.name}</div>
            <div className="sa-manage-desc">{s.desc}</div>
            {!s.sold && <div className="sa-manage-badge">👑 Your-only</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- REFERRALS ---------- */
function CouponBuilder() {
  const [coupons, setCoupons] = useState([]);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [f, setF] = useState({ code: '', percent_off: '', applies_to: 'all', ends_at: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  function load() {
    api.offers().then(d => setCoupons(d.offers || [])).catch(() => {});
    api.services().then(d => setServices(d.services || [])).catch(() => {});
    api.packages().then(d => setPackages((d.packages || []).filter(p => p.price_monthly != null))).catch(() => {});
  }

  async function create() {
    if (!f.code || !f.percent_off) return setMsg('⚠️ Code + % required');
    try {
      await api.createOffer({ ...f, percent_off: Number(f.percent_off) });
      setF({ code: '', percent_off: '', applies_to: 'all', ends_at: '' });
      setMsg('✅ Coupon created'); setTimeout(() => setMsg(''), 1500); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  function targetLabel(a) {
    if (!a || a === 'all') return 'All services & packages';
    const [t, id] = a.split(':');
    if (t === 'service') return '🧩 ' + (services.find(s => s.id == id)?.name || 'service');
    if (t === 'package') return '📦 ' + (packages.find(p => p.id == id)?.name || 'package');
    return a;
  }

  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9 };

  return (
    <>
      <div className="sa-section-title" style={{ marginBottom: 8 }}>Coupons 🎟️</div>
      <div className="sa-box" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...box, width: 150 }} placeholder="CODE (SUMMER20)" value={f.code}
            onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <input style={{ ...box, width: 90 }} type="number" placeholder="% off" value={f.percent_off}
            onChange={e => setF({ ...f, percent_off: e.target.value })} />
          <select style={{ ...box, minWidth: 200 }} value={f.applies_to}
            onChange={e => setF({ ...f, applies_to: e.target.value })}>
            <option value="all">All services & packages</option>
            <optgroup label="Packages">
              {packages.map(p => <option key={'p' + p.id} value={`package:${p.id}`}>📦 {p.name}</option>)}
            </optgroup>
            <optgroup label="Services">
              {services.map(s => <option key={'s' + s.id} value={`service:${s.id}`}>🧩 {s.name}</option>)}
            </optgroup>
          </select>
          <input style={{ ...box, width: 150 }} type="date" value={f.ends_at}
            onChange={e => setF({ ...f, ends_at: e.target.value })} title="Expiry (optional)" />
          <button className="sa-btn-teal" onClick={create}>+ Create coupon</button>
          {msg && <span style={{ fontSize: 13, color: msg[0] === '✅' ? '#4ade80' : '#fb7185' }}>{msg}</span>}
        </div>
      </div>

      {coupons.length > 0 && (
        <div className="sa-table-wrap" style={{ marginBottom: 20 }}>
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Applies to</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id}>
                  <td className="biz">🎟️ {c.code}</td>
                  <td>{c.percent_off}% off</td>
                  <td>{targetLabel(c.applies_to)}</td>
                  <td>{c.ends_at ? String(c.ends_at).slice(0, 10) : '—'}</td>
                  <td><span className={`sa-badge ${c.active ? 'active' : 'trial'}`}>{c.active ? 'active' : 'off'}</span></td>
                  <td style={{ display: 'flex', gap: 10 }}>
                    <span style={{ cursor: 'pointer' }} onClick={async () => { await api.toggleOffer(c.id); load(); }}>{c.active ? '🟢' : '⚪'}</span>
                    <span style={{ cursor: 'pointer' }} onClick={async () => { if (confirm('Delete coupon?')) { await api.deleteOffer(c.id); load(); } }}>🗑️</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReferralsView() {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const d = await api.referrals(); setRefs(d.referrals || []); } catch {}
    finally { setLoading(false); }
  }
  const rewarded = refs.filter(r => r.status === 'rewarded').length;
  return (
    <>
      <CouponBuilder />
      <div className="sa-section-title" style={{ marginBottom: 8 }}>Referrals 👥</div>
      <div className="sa-stats">
        <StatCard label="Total Referrals" value={refs.length} trend="Email-based" cls="up" />
        <StatCard label="Rewarded" value={rewarded} trend="🎁 free month each" cls="up" />
        <StatCard label="Pending" value={refs.length - rewarded} trend="Awaiting paid signup" cls="warn" />
      </div>
      <div className="sa-hint" style={{ marginBottom: 12 }}>
        🎁 Reward = 1 free month for BOTH — applied when the friend signs up on a <b>paid</b> plan.
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Referrer</th><th>Friend</th><th>Reward</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="sa-empty">Loading…</td></tr>
            ) : refs.length === 0 ? (
              <tr><td colSpan="4" className="sa-empty">No referrals yet.</td></tr>
            ) : refs.map(r => (
              <tr key={r.id}>
                <td className="biz">{r.referrer_email}</td>
                <td>{r.friend_email}</td>
                <td>{r.reward}</td>
                <td><span className={`sa-badge ${r.status === 'rewarded' ? 'active' : 'trial'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VendorDrawer({ vendorId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.vendorDetail(vendorId).then(setD).catch(e => setErr(e.message));
  }, [vendorId]);

  const fmt = (x) => x ? String(x).slice(0, 10) : '—';
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60 };
  const panel = { position: 'fixed', top: 0, right: 0, height: '100vh', width: 440, maxWidth: '92vw', background: 'var(--panel)', borderLeft: '1px solid var(--line)', zIndex: 61, padding: 24, overflowY: 'auto' };
  const row = (k, v) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v ?? '—'}</span>
    </div>
  );

  return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Vendor details</h2>
          <span style={{ cursor: 'pointer', fontSize: 20 }} onClick={onClose}>✕</span>
        </div>
        {err && <div className="sa-empty">⚠️ {err}</div>}
        {!d && !err && <div className="sa-loading">Loading…</div>}
        {d && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{d.vendor.business_name}</div>
            <div style={{ marginBottom: 16 }}><span className={`sa-badge ${d.vendor.status}`}>{d.vendor.status}</span></div>

            <div className="sa-section-title" style={{ fontSize: 12, margin: '6px 0' }}>Account</div>
            {row('Plan', d.vendor.plan)}
            {row('Country', d.vendor.country)}
            {row('🌍 Signup IP', d.vendor.signup_ip)}
            {row('Storage', d.vendor.storage_mb ? `${d.vendor.storage_mb} MB` : '—')}
            {row('Joined', fmt(d.vendor.created_at))}

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>Contact</div>
            {d.users.map(u => (
              <div key={u.id}>
                {row('👤 Name', u.name)}
                {row('📧 Email', u.email)}
                {row('Role', u.role)}
              </div>
            ))}

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>Referred by</div>
            {d.referredBy
              ? row('🎁 ' + d.referredBy.referrer_email, d.referredBy.status)
              : <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>Not referred</div>}

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>Services subscribed</div>
            {d.services.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>No services yet</div>
              : d.services.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                  <span>{s.icon} {s.name}</span>
                  <span style={{ color: s.enabled ? 'var(--green,#4ade80)' : 'var(--muted)' }}>{s.enabled ? '✅ active' : 'off'} · ${s.price}</span>
                </div>
              ))}

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>Subscription history</div>
            {d.subscriptions.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>No subscription records</div>
              : d.subscriptions.map(su => (
                <div key={su.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                  <span>{su.plan_name || 'Plan'} · <span style={{ color: 'var(--muted)' }}>{su.status}</span></span>
                  <span style={{ color: 'var(--muted)' }}>{fmt(su.started_at)}{su.ends_at ? ` → ${fmt(su.ends_at)}` : ''}</span>
                </div>
              ))}
          </>
        )}
      </div>
    </>
  );
}

/* ---------- BUYERS ---------- */
function BuyersView({ vendors }) {
  const [openId, setOpenId] = useState(null);
  const [refCount, setRefCount] = useState(0);
  useEffect(() => {
    api.referrals().then(d => setRefCount((d.referrals || []).filter(r => r.status === 'rewarded').length)).catch(() => {});
  }, []);

  const paid = vendors.filter(v => v.status === 'active').length;
  const trials = vendors.filter(v => v.status === 'trial').length;
  const now = new Date();
  const newThisMonth = vendors.filter(v => {
    if (!v.created_at) return false;
    const d = new Date(v.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <>
      <div className="sa-stats">
        <StatCard label="💰 Paid Users" value={paid} trend="Active subscriptions" cls="up" />
        <StatCard label="🎁 Users on Trials" value={trials} trend="Not yet paying" cls="warn" />
        <StatCard label="👥 Referrals" value={refCount} trend="Paid · with discount" cls="up" />
        <StatCard label="🆕 New This Month" value={newThisMonth} trend="Signed up this month" cls="neutral" />
      </div>
      <div className="sa-section-title">All Buyers</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Plan</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan="4" className="sa-empty">No buyers yet.</td></tr>
            ) : vendors.map(v => (
              <tr key={v.id}>
                <td className="biz">{v.business_name}</td>
                <td>{v.plan}</td>
                <td><span className={`sa-badge ${v.status}`}>{v.status}</span></td>
                <td><button className="sa-view-btn" onClick={() => setOpenId(v.id)}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <VendorDrawer vendorId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* ---------- BILLING ---------- */
function BillingView({ packages }) {
  return (
    <>
      <div className="sa-stats">
        <StatCard label="MRR" value="$6.4k" trend="▲ 8.2%" cls="up" />
        <StatCard label="ARR" value="$76.8k" trend="▲ 8.2%" cls="up" />
        <StatCard label="Active Trials" value="19" trend="7 ending soon" cls="warn" />
        <StatCard label="Past Due" value="3" trend="$210 owed" cls="neutral" />
      </div>
      <div className="sa-section-title" style={{ marginTop: 6 }}>Package Revenue</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Package</th><th>Monthly</th><th>Annual</th><th>Trial</th></tr></thead>
          <tbody>
            {packages.map(p => (
              <tr key={p.id}>
                <td className="biz">{p.icon} {p.name}</td>
                <td>{money(p.price_monthly) || '—'}</td>
                <td>{money(p.price_annual) || '—'}</td>
                <td>{p.trial_days}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- SUPPORT ---------- */
function SupportView() {
  const tickets = [
    ['BeatDrop DJ', "Can't upload setlist", 'High', 'past', 'Open', 'trial'],
    ['Glow by Mona', 'Billing question', 'Low', 'trial', 'Resolved', 'active'],
    ['360 Spin Co', 'Gallery link broken', 'High', 'past', 'Open', 'trial'],
  ];
  return (
    <>
      <div className="sa-section-title">Support Tickets</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Issue</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {tickets.map((t, i) => (
              <tr key={i}>
                <td className="biz">{t[0]}</td><td>{t[1]}</td>
                <td><span className={`sa-badge ${t[3]}`}>{t[2]}</span></td>
                <td><span className={`sa-badge ${t[5]}`}>{t[4]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- SETTINGS ---------- */
function SettingsView({ saTheme, setSaTheme }) {
  return (
    <div className="sa-box" style={{ padding: 0 }}>
      <div className="sa-settings-row">
        <div><div className="sr-name">🌗 Panel Theme</div><div className="sr-desc">Super panel only — doesn't affect vendors</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['dark', 'light'].map(t => (
            <button key={t} onClick={() => setSaTheme(t)}
              style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                border: '1px solid var(--line)',
                background: saTheme === t ? '#2dd4bf' : 'var(--panel-2)',
                color: saTheme === t ? '#06231f' : 'var(--text)' }}>
              {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>
      </div>
      <SettingRow name="Platform Name" desc="Shown across all panels" input="Vowflo" />
      <SettingRow name="Default Trial Length" desc="Days before billing starts" input="30" small />
      <SettingRow name="Maintenance Mode" desc="Take platform offline" toggle />
      <SettingRow name="Auto-suspend Past Due" desc="After 7 days unpaid" toggle on />
    </div>
  );
}
function SettingRow({ name, desc, input, small, toggle, on }) {
  const [isOn, setOn] = useState(on);
  return (
    <div className="sa-settings-row">
      <div><div className="sr-name">{name}</div><div className="sr-desc">{desc}</div></div>
      {input && <input className="sa-set-input" style={{ width: small ? 80 : 180 }} defaultValue={input} />}
      {toggle && <div className={`sa-switch ${isOn ? 'on' : ''}`} onClick={() => setOn(!isOn)} />}
    </div>
  );
}

/* ---------- ADMINS ---------- */
function AdminsView({ user }) {
  return (
    <>
      <div className="sa-section-title">Admin Users</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            <tr><td className="biz">{user?.name} (you)</td><td>{user?.email || 'raj@vowflo.com'}</td><td><span className="sa-badge active">super_admin</span></td><td><button className="sa-view-btn">Edit</button></td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
