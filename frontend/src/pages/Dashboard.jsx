import { useState, useEffect, useCallback, Fragment } from 'react';
import { api, getUser, fmtDateTime, logout as apiLogout } from '../lib/api';
import { COUNTRIES } from '../lib/countries';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar, Line
} from 'recharts';
import './super.css';
import './agentvoice.css';
import { useDialog } from '../lib/dialog.jsx';
import { PROFESSIONS } from '../lib/professions';
import DeleteVendorModal from '../components/DeleteVendor';
import PlanEditorTable from '../components/PlanEditorTable';
import RegionPricesTable from '../components/RegionPricesTable';

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', group: 'PLATFORM' },
  { id: 'services', icon: '🧩', label: 'Services & Packages', group: 'PLATFORM' },
  { id: 'manage', icon: '🛠️', label: 'Manage Services', group: 'PLATFORM' },
  { id: 'buyers', icon: '🛒', label: 'Buyers', group: 'PLATFORM' },
  { id: 'referrals', icon: '👥', label: 'Referrals', group: 'PLATFORM' },
  { id: 'billing', icon: '💳', label: 'Billing & Plans', group: 'PLATFORM' },
  { id: 'aichat', icon: '🤖', label: 'AI Chat', group: 'OPERATE' },
  { id: 'support', icon: '🎫', label: 'Support', group: 'OPERATE' },
  { id: 'settings', icon: '🔧', label: 'Settings', group: 'OPERATE' },
];
const TEAL = '#2dd4bf';

export default function Dashboard({ onLogout }) {
  const [view, setView] = useState('dashboard');
  const [vendors, setVendors] = useState([]);
  const [packages, setPackages] = useState([]);
  const [overview, setOverview] = useState(null);   // 📊 the real figures (GET /admin/overview)
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vf_sa_collapsed') === '1');
  useEffect(() => { localStorage.setItem('vf_sa_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  const [saTheme, setSaTheme] = useState(() => localStorage.getItem('vf_super_theme') || 'dark');
  const user = getUser();

  // 🌗 apply super theme to .sa-wrap only (never touches vendor panels)
  useEffect(() => { localStorage.setItem('vf_super_theme', saTheme); }, [saTheme]);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const [v, p, o] = await Promise.all([api.vendors(), api.adminPackages(), api.adminOverview().catch(() => null)]);
      setVendors(v.vendors || []);
      setPackages(p.packages || []);
      setOverview(o);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  function logout() { apiLogout(); onLogout(); }

  return (
    <div className={`sa-wrap ${collapsed ? 'sa-collapsed' : ''}`} data-sa-theme={saTheme}>
      <aside className={`sa-sidebar ${sidebarOpen ? 'show' : ''}`}>
        <div className="sa-brand"><img src="/logo_icon.png" alt="iwopo" className="sa-brand-img" /><div>IWOPO<br /><small>SUPER</small></div></div>
        <div className="sa-collapse-row" onClick={() => setCollapsed(c => !c)} title="Auto-hide sidebar">
          <span className="sa-collapse-lbl">Auto-hide</span>
          <span className={`sa-collapse-switch ${collapsed ? 'on' : ''}`} />
        </div>
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
            {view === 'dashboard' && <DashboardView vendors={vendors} packages={packages} overview={overview} />}
            {view === 'services' && <ServicesView />}
            {view === 'manage' && <ManageServicesView />}
            {view === 'buyers' && <BuyersView vendors={vendors} overview={overview} onChanged={load} />}
            {view === 'referrals' && <ReferralsView />}
            {view === 'billing' && <BillingView packages={packages} overview={overview} />}
            {view === 'aichat' && <AiChatView vendors={vendors} />}
            {view === 'support' && <SupportView />}
            {view === 'settings' && <SettingsView saTheme={saTheme} setSaTheme={setSaTheme} user={user} />}
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

  // 🔔 each top-bar button: its own icon on a tile tinted in its colour (Raj, 2026-11-05 — the emoji didn't say what they were)
  const Bell = ({ icon, tone, n, title, onClick }) => (
    <button className={`sa-bell sa-bell-${tone}`} title={title} aria-label={title} onClick={onClick}>
      {icon}
      {n > 0 && <span className="sa-bell-badge">{n}</span>}
    </button>
  );

  return (
    <div className="sa-bells">
      <Bell icon={<SupportIcon />} tone="support" n={c.messages} title="Support messages" onClick={() => open('messages', 'support')} />
      <Bell icon={<PaidIcon />} tone="paid" n={c.paid} title="New paid subscribers" onClick={() => open('paid', 'buyers')} />
      <Bell icon={<TrialIcon />} tone="trial" n={c.trials} title="New trial subscribers" onClick={() => open('trials', 'buyers')} />
    </div>
  );
}

/* 🎧 💲 🎟️ The top-bar icons — two-tone line drawings (outline in the button's colour, one part filled with its tint).
   Support: a headset. New paid: a person with a dollar sign. New trial: a person with a ticket where the "+" would be. */
const SupportIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 14v-3a8 8 0 1 1 16 0v3" />
    <path d="M18 19c0 1.657 -2.686 3 -6 3" />
    <path className="tw" d="M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z" />
    <path className="tw" d="M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z" />
  </svg>
);
const PaidIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path className="tw" d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
    <path d="M6 21v-2a4 4 0 0 1 4 -4h3" />
    <path d="M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5" />
    <path d="M19 21v1m0 -8v1" />
  </svg>
);
const TrialIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path className="tw" d="M7 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
    <path d="M5 21v-2a4 4 0 0 1 4 -4h2" />
    <path className="tw" d="M14.5 14.5h6.5a1 1 0 0 1 1 1v1.25a1.25 1.25 0 0 0 0 2.5v1.25a1 1 0 0 1 -1 1h-6.5a1 1 0 0 1 -1 -1v-1.25a1.25 1.25 0 0 0 0 -2.5v-1.25a1 1 0 0 1 1 -1z" />
    <path d="M18.5 15.5v.6m0 1.9v.6m0 1.9v.4" />
  </svg>
);

/* ---------- DASHBOARD ---------- */
function DashboardView({ vendors, packages, overview }) {
  /* 📈 new sellers per month and the plans in use come from GET /admin/overview. Both used to be invented — an
     MRR line from $4.1k to $6.4k and a 'Service Performance' of 88% down to 28% — on a platform with six sellers. */
  const growth = overview?.growth || [];
  // 🌍 Where sellers actually are. This used to be a hardcoded list that read as
  // real — Canada 52, US 38 — on a platform with three sellers. It now comes
  // from the vendors table, and says so plainly when there's nothing to show.
  const [geo, setGeo] = useState(null);
  useEffect(() => { api.adminVendorStats().then(setGeo).catch(() => setGeo({ countries: [], unset: 0, total: 0 })); }, []);
  /* 🍩 Vendors per profession, counted for real. This was a hardcoded list —
     Photographer 61, Editor 14, 360 Booth 9 — on a platform with three
     vendors, and it charted trades that existed nowhere else in the product.
     It now comes from what vendors actually picked, using the same list the
     inquiry form and the public page use. */
  const TYPE_COLOURS = ['#2dd4bf','#4ade80','#60a5fa','#fbbf24','#a78bfa','#f472b6','#22d3ee','#fb923c','#e879f9','#34d399','#f87171','#c084fc','#94a3b8'];
  const vTypes = [
    ...(geo?.professions || []).map((p, i) => ({
      n: `${PROFESSIONS[p.key]?.icon || ''} ${PROFESSIONS[p.key]?.label || p.key}`.trim(),
      v: p.count,
      c: TYPE_COLOURS[i % TYPE_COLOURS.length],
    })),
    ...(geo?.professions_unset ? [{ n: 'Not set', v: geo.professions_unset, c: '#7c9199' }] : []),
  ];
  const cName = (code) => (COUNTRIES.find(c => c.code === code)?.name) || `🌐 ${code}`;
  const countries = (geo?.countries || []).map(c => [cName(c.code), c.count]);
  const maxC = Math.max(1, ...countries.map(c => c[1]));

  // 📦 sellers on each plan, as they stand
  const palette = ['#2dd4bf','#60a5fa','#a78bfa','#fbbf24','#4ade80','#f472b6','#22d3ee','#fb923c'];
  const planData = (overview?.plans || []).filter(p => p.sellers > 0).map((p, i) => ({ name: p.name, v: p.sellers, c: palette[i % palette.length] }));
  const onPlans = planData.reduce((a, p) => a + p.v, 0);

  return (
    <>
      <div className="sa-stats">
        {/* Real counts, and nothing invented (GET /admin/overview, lib/billing.js's rules). "Paid" used to be every
            seller not on a trial — the owner account and expired trials included. */}
        <StatCard label="Total Sellers" value={vendors.length} trend={`${geo?.unset ?? 0} without a country set`} cls="up" />
        <StatCard label="Active Trials" value={overview?.trial ?? '—'} trend={overview ? `${overview.trials_ending_soon} ending within 7 days` : 'Loading…'} cls="warn" />
        <StatCard label="Paying Sellers" value={overview?.paying_total ?? '—'} trend={overview ? `${money(overview.mrr) || '$0'} a month` : 'Loading…'} cls="up" />
        <StatCard label="Packages" value={packages.length} trend="Live tiers" cls="up" />
      </div>

      <div className="sa-grid-2">
        <div className="sa-box">
          <h3>📈 Seller Growth</h3><div className="sa-box-sub">New sellers each month — last 8 months</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growth}>
                <CartesianGrid stroke="#223238" />
                <XAxis dataKey="label" tick={{ fill: '#7c9199', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#7c9199', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a282d', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
                <Bar dataKey="sellers" name="New sellers" fill="#14b8a655" stroke="#14b8a6" radius={[6,6,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sa-box">
          <h3>🌍 Sellers by Country</h3><div className="sa-box-sub">Where your sellers are based</div>
          <div className="sa-country-list">
            {countries.length === 0 ? (
              <div className="sa-cty-empty">
                {geo === null ? 'Loading…'
                  : geo.total === 0 ? 'No sellers yet.'
                  : `No countries recorded yet — ${geo.unset} of ${geo.total} seller${geo.total === 1 ? '' : 's'} haven't set one in their profile.`}
              </div>
            ) : countries.map(c => (
              <div key={c[0]} className="sa-cty-row">
                <div className="sa-cty-info">
                  <div className="sa-cty-top"><span>{c[0]}</span><span className="cnt">{c[1]} seller{c[1] === 1 ? '' : 's'}</span></div>
                  <div className="sa-cty-bar"><div className="sa-cty-fill" style={{ width: `${c[1] / maxC * 100}%` }} /></div>
                </div>
              </div>
            ))}
            {countries.length > 0 && geo?.unset > 0 && (
              <div className="sa-cty-empty">{geo.unset} seller{geo.unset === 1 ? '' : 's'} haven&apos;t set a country.</div>
            )}
          </div>
        </div>
      </div>

      <div className="sa-grid-2eq">
        <div className="sa-box">
          <h3>📦 Plans in Use</h3><div className="sa-box-sub">Sellers on each plan</div>
          {planData.length === 0 ? <div className="sa-cty-empty">{overview ? 'No seller is on a plan yet.' : 'Loading…'}</div> : (
          <div style={{ minHeight: 180, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="50%" height={210}>
              <PieChart>
                <Pie data={planData} dataKey="v" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {planData.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="sa-adopt">
              {planData.map((s, i) => (
                <div key={i}>
                  <div className="sa-ad-top"><span>{s.name}</span><span className="cnt">{s.v} seller{s.v === 1 ? '' : 's'}</span></div>
                  <div className="sa-ad-bar"><div className="sa-ad-fill" style={{ width: `${s.v / onPlans * 100}%`, background: s.c }} /></div>
                </div>
              ))}
            </div>
          </div>)}
        </div>

        <div className="sa-box">
          <h3>🍩 Vendors by Type</h3><div className="sa-box-sub">Vendors per profession</div>
          {/* 🍩 the box grows with its list — every trade now has a row, and a fixed 180px pushed "Not set" out of the card
             (Raj, 2026-11-05); the list sits in two columns beside a fixed-size donut */}
          <div className="sa-type-box">
            <div className="sa-type-pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vTypes} dataKey="v" nameKey="n" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {vTypes.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="sa-legend sa-legend-cols">
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
function ServicesView() {
  const [rev, setRev] = useState(0);   // bumps when the pricing table saves, so the standalone list re-reads the same add-on rows
  const dialog = useDialog();
  const [offers, setOffers] = useState([]);
  const [showOffer, setShowOffer] = useState(false);
  const [nf, setNf] = useState({ code: '', label: '', percent_off: '', ends_at: '' });

  useEffect(() => { loadOffers(); }, []);
  async function loadOffers() {
    try { const d = await api.offers(); setOffers(d.offers || []); } catch {}
  }
  async function addOffer() {
    if (!nf.code || !nf.percent_off) return dialog.alert('A coupon needs both a code and a percentage off.', { title: 'Missing details', error: true });
    try {
      await api.createOffer({ ...nf, percent_off: Number(nf.percent_off) });
      setNf({ code: '', label: '', percent_off: '', ends_at: '' });
      setShowOffer(false);
      loadOffers();
    } catch (e) { dialog.alert(e.message, { error: true }); }
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
              <button onClick={async () => { if (await dialog.confirm('This offer will be deleted.', { title: 'Delete offer?', okLabel: 'Delete' })) { await api.deleteOffer(o.id); loadOffers(); } }} title="delete">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* PACKAGES — the public pricing table, editable in place (components/PlanEditorTable.jsx) */}
      <div className="sa-section-title sa-pt-title">Packages & Pricing 🎁</div>
      <PlanEditorTable onSaved={() => setRev(r => r + 1)} />
      {/* 🌍 every territory's fixed prices and the profit from each plan (components/RegionPricesTable.jsx) */}
      <RegionPricesTable rev={rev} />

      {/* STANDALONE SERVICES */}
      <StandaloneServices rev={rev} />
    </>
  );
}

function StandaloneServices({ rev = 0 }) {
  const [services, setServices] = useState([]);
  const [edit, setEdit] = useState(false);
  useEffect(() => { load(); }, [rev]);
  function load() { api.adminServices().then(d => setServices((d.services || []).filter(s => Number(s.price) > 0))).catch(() => {}); }
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

function CountryPriceEditor({ type, item, onSaved }) {
  const dialog = useDialog();
  const [cp, setCp] = useState(item.country_prices || {});
  const [country, setCountry] = useState('CA-BC');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(next) {
    setSaving(true);
    try { await api.updateCountryPrices(type, item.id, next); setCp(next); onSaved && onSaved(); }
    catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
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
  const dialog = useDialog();
  const [tiers, setTiers] = useState(() => (service.tiers || []).map(t => ({ ...t })));
  const [saving, setSaving] = useState(false);
  const set = (i, k, v) => setTiers(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  async function save() {
    setSaving(true);
    try {
      const clean = tiers.map(t => ({ label: t.label, price: Number(t.price) || 0, price_annual: t.price_annual === '' || t.price_annual == null ? null : Number(t.price_annual) }));
      await api.updateServiceTiers(service.id, clean);
      onSaved && onSaved();
    } catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
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
  const dialog = useDialog();
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
    } catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
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

/**
 * 📦 How much storage this package includes.
 *
 * Edited on the package rather than per vendor, so raising it here raises it
 * for every vendor on this package at once — which is what makes it a property
 * of what they bought rather than a number someone has to remember to copy onto
 * each account.
 */


/**
 * 🔓 What vendors on this plan actually get (2026-11-01). Shown on every package card; checkboxes in Edit mode.
 * Separate from "INCLUDED" above, which is only what the pricing page lists.
 */


/* ---------- MANAGE SERVICES ---------- */


function ManageServicesView() {
  // Read from the services table rather than a copy kept here. This list had
  // drifted into its own vocabulary — two separate rows for the one chatbot,
  // and "File Flyer" where the rest of the system said "Storage" — so toggling
  // a service in one screen had no effect on any of the others.
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  useEffect(() => {
    api.adminServices()
      .then(d => setList((d.services || []).filter(s => s.feature_key)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  if (active) {
    const svc = list.find(s => s.feature_key === active);
    if (!svc) return null;
    return (
      <>
        <button className="sa-view-btn" onClick={() => setActive(null)}>← Back to services</button>
        <div className="sa-box sa-svc-detail">
          <div className="sa-svc-detail-icon">{svc.icon}</div>
          <h2 className="sa-svc-detail-name">{svc.name}</h2>
          <p className="sa-svc-detail-desc">{svc.description}</p>
          <div className="sa-trial-pill">
            {svc.is_live ? '🚧 Admin panel coming next' : '🏗️ Not built yet — nothing to configure'}
          </div>
        </div>
      </>
    );
  }

  const live = list.filter(s => s.is_live);
  const planned = list.filter(s => !s.is_live);
  const card = (s) => (
    <div key={s.feature_key} className={`sa-manage-card ${s.is_live ? '' : 'is-planned'}`}
      onClick={() => setActive(s.feature_key)}>
      <div className="sa-manage-icon">{s.icon}</div>
      <div className="sa-manage-name">{s.name}</div>
      <div className="sa-manage-desc">{s.description}</div>
      {!s.is_live && <div className="sa-manage-badge">🏗️ Not built yet</div>}
    </div>
  );

  return (
    <>
      <div className="sa-section-title">Manage Services 🛠️</div>
      <div className="sa-hint sa-hint-tight">
        Every service, named the same way here, in a vendor&apos;s plan and in their panel.
        Vendors see only what they subscribe to.
      </div>
      <div className="sa-manage-grid">{live.map(card)}</div>

      {planned.length > 0 && (
        <>
          <div className="sa-section-title sa-section-mt">Planned 🏗️</div>
          <div className="sa-hint sa-hint-tight">
            Sold on the pricing page but not built. Switching one on for a vendor is refused,
            because there would be nothing for them to open.
          </div>
          <div className="sa-manage-grid">{planned.map(card)}</div>
        </>
      )}
    </>
  );
}

/* ---------- REFERRALS ---------- */
function CouponBuilder() {
  const dialog = useDialog();
  const [coupons, setCoupons] = useState([]);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [f, setF] = useState({ code: '', percent_off: '', applies_to: 'all', ends_at: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  function load() {
    api.offers().then(d => setCoupons(d.offers || [])).catch(() => {});
    api.adminServices().then(d => setServices(d.services || [])).catch(() => {});
    api.adminPackages().then(d => setPackages((d.packages || []).filter(p => p.price_monthly != null))).catch(() => {});
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
                    <span style={{ cursor: 'pointer' }} onClick={async () => { if (await dialog.confirm('This coupon will be deleted.', { title: 'Delete coupon?', okLabel: 'Delete' })) { await api.deleteOffer(c.id); load(); } }}>🗑️</span>
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

function FeatureToggles({ vendorId }) {
  const dialog = useDialog();
  const [feats, setFeats] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api.vendorFeatures(vendorId).then(d => setFeats(d.features || [])).catch(() => setFeats([]));
  }, [vendorId]);

  async function toggle(f) {
    setBusy(f.key);
    try {
      await api.setVendorFeature(vendorId, f.key, { enabled: !f.enabled });
      const d = await api.vendorFeatures(vendorId);
      setFeats(d.features || []);
    } catch (e) {
      /* This swallowed the answer. The server refuses to switch on a feature
         marked as not built and says exactly that — File Flyer was flagged
         is_live=false long after it shipped, so the toggle did nothing and
         explained nothing, and the time went on wondering whether the button
         was broken. */
      dialog.alert(e.message, { title: 'Could not change that', error: true });
    }
    setBusy('');
  }

  if (!feats) return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>Loading…</div>;
  return (
    <div>
      {feats.map(f => (
        <div key={f.key} className="sa-feat-row">
          <span className="sa-feat-name">{f.label}{f.overridden && <span className="sa-feat-ovr" title="Manually overridden — not following the plan default">override</span>}</span>
          <button
            className={`sa-feat-toggle ${f.enabled ? 'is-on' : ''}`}
            onClick={() => toggle(f)}
            disabled={busy === f.key}
            aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.label}`}
          >
            <span className="sa-feat-knob" />
          </button>
        </div>
      ))}
    </div>
  );
}

function VendorDrawer({ vendorId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  /* Named so the plan picker can call it: changing a plan changes the storage
     figures beside it, and a drawer still showing the old allowance is how
     somebody sets the same thing twice. */
  const load = useCallback(() => {
    api.vendorDetail(vendorId).then(setD).catch(e => setErr(e.message));
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

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
            {/* from the subscription, not the old vendors.plan column */}
            {row('Plan', d.storage?.limit_source === 'plan' ? d.storage.plan_name : 'Free trial')}
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

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>Feature access</div>
            <FeatureToggles vendorId={vendorId} />

            <div className="sa-section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}>File Flyer storage</div>
            <PlanPicker vendorId={vendorId} storage={d.storage} onChanged={load} />
            <StorageLimit vendorId={vendorId} storage={d.storage} onSaved={load} />

            <Membership vendorId={vendorId} membership={d.membership} onChanged={load} />
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

/**
 * ⏸️ Membership (Raj, 2026-11-07): stop at the end of the paid period, stop now (no refund) or resume — the account,
 * its data and contact stay, so they can come back. Deleting the account is the separate 🗑️ in Buyers.
 */
function Membership({ vendorId, membership: m, onChanged }) {
  const [busy, setBusy] = useState('');
  const [sure, setSure] = useState(false);   // "stop now" asks twice
  const [msg, setMsg] = useState('');
  if (!m) return null;
  const day = (x) => (x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  async function go(when) {
    setBusy(when); setMsg('');
    try { await api.vendorMembership(vendorId, when); setSure(false); onChanged(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }
  return (
    <div className="sa-mem">
      <div className="sa-mem-title">⏸️ Membership</div>
      {!m.paying ? <div className="sa-mem-line">Not paying right now — nothing to stop.</div> : (
        <>
          <div className="sa-mem-line">
            <b>{m.plan}</b> · {m.cycle || 'monthly'} · {m.stopping ? <span className="sa-mem-warn">stops {day(m.period_end)}</span> : <>renews {day(m.period_end)}</>}
          </div>
          <div className="sa-mem-actions">
            {m.stopping
              ? <button type="button" className="sa-view-btn" disabled={!!busy} onClick={() => go('resume')}>{busy === 'resume' ? 'Resuming…' : '▶️ Resume membership'}</button>
              : <button type="button" className="sa-view-btn" disabled={!!busy} onClick={() => go('period_end')}>{busy === 'period_end' ? 'Stopping…' : '⏸️ Stop at period end'}</button>}
            {!sure
              ? <button type="button" className="sa-mem-now" disabled={!!busy} onClick={() => setSure(true)}>⏹️ Stop now</button>
              : <button type="button" className="sa-mem-now is-sure" disabled={!!busy} onClick={() => go('now')}>{busy === 'now' ? 'Stopping…' : 'Confirm: stop today, no refund'}</button>}
          </div>
        </>
      )}
      <div className="sa-mem-line sa-mem-muted">📜 Terms: {m.terms_accepted_at ? `agreed ${day(m.terms_accepted_at)} (version ${m.terms_version})` : 'no record (signed up before the tick box)'}</div>
      <div className="sa-mem-line sa-mem-muted">📬 Offers: {m.marketing_opt_in ? `agreed ${day(m.marketing_opt_in_at)}` : 'not agreed'}</div>
      {msg && <div className="sa-mem-line">{msg}</div>}
    </div>
  );
}

/** 👋 Everyone who paid and stopped (or is stopping): who a win-back offer could go to. Export takes only those who agreed. */
function FormerSubscribers() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.formerSubscribers().then(d => setRows(d.former || [])).catch(() => setRows([])); }, []);
  const day = (x) => (x ? String(x).slice(0, 10) : '—');
  function exportAgreed() {
    const ok = (rows || []).filter(r => r.offers && r.email);
    const csv = ['business,name,email,last_plan,state,ended'].concat(ok.map(r => [r.business_name, r.name, r.email, r.plan, r.state, day(r.ended_at)].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `iwopo-former-subscribers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }
  const agreed = (rows || []).filter(r => r.offers).length;
  return (
    <>
      <div className="sa-section-title sa-former-title">👋 Former subscribers
        <button type="button" className="sa-view-btn" disabled={!agreed} onClick={exportAgreed}>⬇️ Export the {agreed} who agreed to offers</button>
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Last plan</th><th>State</th><th>Ended</th><th>Offers</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={5}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5}>Nobody has stopped paying yet.</td></tr>
              : rows.map(r => (
                <tr key={r.vendor_id}>
                  <td><b>{r.business_name}</b><div className="sa-former-mail">{r.email}</div></td>
                  <td>{r.plan || '—'}</td>
                  <td>{r.state === 'stopping' ? '⏸️ stopping' : '⏹️ ended'}</td>
                  <td>{day(r.ended_at)}</td>
                  <td>{r.offers ? '📬 agreed' : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * 🎫 Which plan this vendor is on — and therefore what they are allowed.
 *
 * Nothing in the app created a subscription before this, so a vendor who paid
 * stayed on the trial allowance until somebody set a per-vendor override by
 * hand. The plan is the answer; the override below is for the exceptions.
 */
function PlanPicker({ vendorId, storage, onChanged }) {
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.plansList().then(d => setPlans(d.plans || [])).catch(() => {}); }, []);

  const onPlan = storage?.limit_source === 'plan';
  const current = onPlan ? plans.find(p => p.name === storage.plan_name)?.id ?? '' : '';

  async function pick(v) {
    setBusy(true); setMsg('');
    try {
      await api.setVendorPlan(vendorId, v === '' ? null : Number(v));
      setMsg('✅ Saved');
      onChanged?.();
      setTimeout(() => setMsg(''), 1800);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: '6px 0 14px' }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
        Plan {storage?.limit_source === 'override'
          ? <span>— <b style={{ color: 'var(--text)' }}>an override is in force</b>, so the plan is not deciding the limit</span>
          : null}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={current} disabled={busy} onChange={e => pick(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
                   background: 'var(--panel)', color: 'var(--text)', fontSize: 13 }}>
          <option value="">Free trial</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.storage_gb ? p.storage_gb + ' GB' : 'no storage set'}
            </option>
          ))}
        </select>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{msg}</span>}
      </div>
    </div>
  );
}

/**
 * 💾 One vendor's File Flyer allowance.
 *
 * Per-vendor on purpose rather than a plan feature — the allowance is a
 * commercial decision about a particular vendor, and hanging it off a plan
 * would mean changing everyone on that plan to change one of them.
 */
function StorageLimit({ vendorId, storage, onSaved }) {
  const [mb, setMb] = useState(storage?.limit_mb ?? 1024);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  /* useState only reads its argument once, so changing the plan above left this
     box showing the OLD allowance — 512000 MB beside a vendor who had just been
     moved to 200 GB. A super admin who then pressed Save would have set an
     override they never meant to, pinning them at the previous plan's figure. */
  useEffect(() => { setMb(storage?.limit_mb ?? 1024); }, [storage?.limit_mb]);

  // the line above the box reads the vendor's REAL limit, not what is being typed (empty read "of MB")
  const usedMb = (Number(storage?.used_bytes || 0) / 1024 / 1024);
  const limitMb = Number(storage?.limit_mb || 0);
  const pct = limitMb > 0 ? Math.min(100, Math.round(usedMb / limitMb * 100)) : 0;
  const fromPlan = storage?.limit_source !== 'override';

  async function save() {
    setBusy(true); setMsg('');
    try {
      // 🧹 empty = no override: the vendor goes back to their plan's storage (it used to save 0 MB and block uploads)
      await api.setVendorStorage(vendorId, String(mb).trim() === '' ? null : Number(mb));
      setMsg('✅ Saved');
      setTimeout(() => setMsg(''), 1800);
      onSaved?.();   // re-read the vendor so the line above shows the limit that now applies
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="sa-limit">
      <div className="sa-limit-use">
        Using <b>{usedMb.toFixed(1)} MB</b> of {limitMb.toLocaleString('en-US')} MB ({pct}%) · {fromPlan ? 'from the plan' : 'set here'}
      </div>
      <progress className={`sa-limit-bar${pct > 90 ? ' is-high' : ''}`} value={pct} max={100} aria-label="Storage used" />
      <div className="sa-limit-row">
        <input type="number" min="0" className="sa-limit-in" value={mb} placeholder="Plan's storage" title="Leave empty to use the plan's storage" onChange={e => setMb(e.target.value)} />
        <span className="sa-limit-unit">MB</span>
        <button className="refresh" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Set limit'}</button>
        {msg && <span className={`sa-limit-msg${msg[0] === '✅' ? ' is-ok' : ''}`}>{msg}</span>}
      </div>
      <div className="sa-limit-hint">Leave the box empty and press Set limit to go back to the plan's storage.</div>
    </div>
  );
}

/* ---------- BUYERS ---------- */
/** 🏷️ a seller's billing state (lib/adminOverview.js) as a badge: its words and its colour */
const BILLING_STATE = {
  owner: ['👑 Owner', 'active'], paying: ['Paying', 'active'], past_due: ['Past due', 'past'], trial: ['Trial', 'trial'], expired: ['Trial ended', 'past'],
};

function BuyersView({ vendors, overview, onChanged }) {
  const [openId, setOpenId] = useState(null);
  const [delId, setDelId] = useState(null);   // 🗑️ the vendor being deleted
  const [refCount, setRefCount] = useState(0);
  useEffect(() => {
    api.referrals().then(d => setRefCount((d.referrals || []).filter(r => r.status === 'rewarded').length)).catch(() => {});
  }, []);


  return (
    <>
      <div className="sa-stats">
        <StatCard label="💰 Paying Users" value={overview?.paying_total ?? '—'} trend="Stripe subscriptions" cls="up" />
        <StatCard label="🎁 Users on Trials" value={overview?.trial ?? '—'} trend="Not yet paying" cls="warn" />
        <StatCard label="👥 Referrals" value={refCount} trend="Paid · with discount" cls="up" />
        <StatCard label="🆕 New This Month" value={overview?.new_this_month ?? '—'} trend="Signed up this month" cls="neutral" />
      </div>
      <div className="sa-section-title">All Buyers</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Plan</th><th>Status</th><th>Storage</th><th></th></tr></thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan="5" className="sa-empty">No buyers yet.</td></tr>
            ) : vendors.map(v => (
              <tr key={v.id}>
                <td className="biz">{v.business_name}</td>
                {/* ⚠️ This showed vendors.plan, a column nothing ever wrote —
                    so every buyer read "starter" whatever they were paying.
                    The real answer comes from the active subscription. */}
                <td>{v.storage?.limit_source === 'plan' ? v.storage.plan_name
                   : v.storage?.limit_source === 'override' ? <span className="sa-muted">Override</span>
                   : <span className="sa-muted">Trial</span>}</td>
                {(() => { const [word, cls] = BILLING_STATE[overview?.states?.[v.id]] || [v.status, v.status]; return <td><span className={`sa-badge ${cls}`}>{word}</span></td>; })()}
                {/* Storage in the LIST, not only behind Manage. This is where a
                    super admin notices someone is nearly full, and a number
                    that needs a click is a number nobody looks at. */}
                <td>{v.storage ? <StorageCell s={v.storage} /> : <span className="sa-muted">—</span>}</td>
                <td className="sa-row-actions">
                  <button className="sa-view-btn" onClick={() => setOpenId(v.id)}>Manage</button>
                  <button type="button" className="sa-del-btn" title="Delete this vendor" aria-label={`Delete ${v.business_name}`} onClick={() => setDelId(v.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <VendorDrawer vendorId={openId} onClose={() => setOpenId(null)} />}
      {delId && <DeleteVendorModal vendorId={delId} onClose={() => setDelId(null)} onDeleted={() => { setDelId(null); onChanged?.(); }} />}
      <FormerSubscribers />
    </>
  );
}

/**
 * 💾 One buyer's storage: a bar, the figures, and where the limit came from.
 *
 * Amber past 80% and red past 95% — a vendor at 96% is about to be refused an
 * upload, and that is worth seeing before they write in about it.
 */
function StorageCell({ s }) {
  const pct = Math.min(100, s.percent ?? 0);
  const tone = pct >= 95 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#2dd4bf';
  return (
    <div className="sa-store" title={`${fmtBytes(s.used_bytes)} of ${fmtMb(s.limit_mb)} — limit from ${s.limit_source}`}>
      <div className="sa-store-bar"><span style={{ width: pct + '%', background: tone }} /></div>
      <div className="sa-store-txt">
        {fmtBytes(s.used_bytes)} / {fmtMb(s.limit_mb)}
        {s.limit_source === 'override' && <span className="sa-store-tag">set</span>}
      </div>
    </div>
  );
}

/** Bytes a person can read — MB below a gigabyte, GB above, TB above that. */
function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(2) + ' TB';
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576) return Math.round(b / 1048576) + ' MB';
  return Math.max(0, Math.round(b / 1024)) + ' KB';
}
function fmtMb(mb) {
  const m = Number(mb) || 0;
  return m >= 1024 ? (m / 1024 >= 100 ? Math.round(m / 1024) : (m / 1024).toFixed(0)) + ' GB' : m + ' MB';
}

/* ---------- BILLING ---------- */
/* ---------- BILLING ----------
   💳 Real figures (GET /admin/overview): what paying sellers bring in at today's plan prices, the trials, and who is
   past due. They used to be invented — $6.4k MRR, $76.8k ARR, 19 trials, 3 past due with "▲ 8.2%". */
function BillingView({ packages, overview }) {
  const o = overview;
  return (
    <>
      <div className="sa-stats">
        <StatCard label="MRR" value={o ? (money(o.mrr) || '$0') : '—'} trend="At today's plan prices" cls="up" />
        <StatCard label="ARR" value={o ? (money(o.arr) || '$0') : '—'} trend="A year of today’s subscriptions" cls="up" />
        <StatCard label="Active Trials" value={o?.trial ?? '—'} trend={o ? `${o.trials_ending_soon} ending within 7 days` : 'Loading…'} cls="warn" />
        <StatCard label="Past Due" value={o?.past_due ?? '—'} trend={o ? `${money(o.owed) || '$0'} owed` : 'Loading…'} cls="neutral" />
      </div>
      <div className="sa-section-title">Revenue by Plan</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Plan</th><th>Sellers on it</th><th>Paying</th><th>MRR</th></tr></thead>
          <tbody>
            {!o ? <tr><td colSpan="4" className="sa-empty">Loading…</td></tr> : o.plans.map(p => (
              <tr key={p.id}>
                <td className="biz">{p.name}</td><td>{p.sellers}</td><td>{p.paying}</td><td>{money(p.mrr) || '$0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sa-section-title">Package Prices</div>
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

/* ---------- SUPPORT ----------
   🎧 The messages vendors send from Help & Support (support_messages — filed here before any email goes). This
   used to list three invented tickets (BeatDrop DJ, Glow by Mona, 360 Spin Co). */
function SupportView() {
  /* 🎧 Messages vendors send from Help & Support, with their screenshot if they added one; and the video guides shown
     on that page (Raj, 2026-11-07) */
  const [messages, setMessages] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.adminMessages().then(d => setMessages(d.messages || [])).catch(() => setMessages([])); }, []);
  async function viewShot(id) {
    setErr('');
    try { window.open(URL.createObjectURL(await api.adminMessageAttachment(id)), '_blank', 'noopener'); }
    catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="sa-section-title">Support Messages</div>
      {err && <div className="sa-hint">⚠️ {err}</div>}
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>From</th><th>Subject</th><th>Received</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {messages === null ? <tr><td colSpan="5" className="sa-empty">Loading…</td></tr>
              : messages.length === 0 ? <tr><td colSpan="5" className="sa-empty">No support messages yet.</td></tr>
              : messages.map(m => (
                <Fragment key={m.id}>
                  <tr className="sa-msg-row" onClick={() => setOpen(open === m.id ? null : m.id)}>
                    <td className="biz">{m.from_email || '—'}</td>
                    <td>{m.subject || String(m.body || '').slice(0, 80) || '—'}{m.has_attachment && <span className="sa-msg-clip" title="Has a screenshot"> 📎</span>}</td>
                    <td>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                    <td><span className={`sa-badge ${m.status === 'open' ? 'trial' : 'active'}`}>{m.status || 'open'}</span></td>
                    <td className="sa-msg-toggle">{open === m.id ? '▲' : '▼'}</td>
                  </tr>
                  {open === m.id && (
                    <tr className="sa-msg-open"><td colSpan="5">
                      <p className="sa-msg-body">{m.body || '—'}</p>
                      {m.has_attachment && <button type="button" className="sa-view-btn" onClick={() => viewShot(m.id)}>📎 View screenshot</button>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
      <HelpVideosAdmin />
    </>
  );
}

/** 🎬 The video guides on the vendors' Help & Support page: paste a YouTube link and a title; remove any. */
function HelpVideosAdmin() {
  const [videos, setVideos] = useState(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.helpVideos().then(d => setVideos(d.videos || [])).catch(() => setVideos([])); }, []);
  async function add() {
    setBusy(true); setMsg('');
    try { setVideos((await api.adminAddHelpVideo(title, url)).videos); setTitle(''); setUrl(''); setMsg('✅ Added — vendors see it on Help & Support'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    try { setVideos((await api.adminRemoveHelpVideo(id)).videos); } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  return (
    <>
      <div className="sa-section-title sa-hv-title">🎬 Help videos</div>
      <div className="sa-hint">Shown on every vendor's Help &amp; Support page, in this order.</div>
      <div className="sa-hv-add">
        <input className="sa-hv-in" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title, e.g. Setting up your inquiry form" maxLength={140} />
        <input className="sa-hv-in" value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube link" />
        <button type="button" className="sa-view-btn" disabled={busy || !title.trim() || !url.trim()} onClick={add}>{busy ? 'Adding…' : '+ Add video'}</button>
      </div>
      {msg && <div className="sa-hint">{msg}</div>}
      <ul className="sa-hv-list">
        {videos === null ? <li>Loading…</li> : videos.length === 0 ? <li className="sa-hint">No videos yet — vendors see “coming soon”.</li>
          : videos.map(v => (
            <li key={v.id}>
              <span>{v.title} <a href={`https://youtu.be/${v.youtube_id}`} target="_blank" rel="noreferrer" className="sa-hv-link">youtu.be/{v.youtube_id}</a></span>
              <button type="button" className="sa-mem-now" onClick={() => remove(v.id)}>Remove</button>
            </li>
          ))}
      </ul>
    </>
  );
}

/* ---------- SETTINGS ---------- */
// 🤖 AI Chat — subscribers + knowledge pages
const KFIELDS = [
  { k: 'business_name', label: '🏢 Business name', type: 'input' },
  { k: 'tagline', label: '✨ About us / tagline', type: 'area' },
  { k: 'about_team', label: '👥 About the team', type: 'area' },
  { k: 'service_area', label: '📍 City / service area', type: 'input' },
  { k: 'contact', label: '📞 Contact (phone / email / socials)', type: 'area' },
  { k: 'hours', label: '🕒 Hours', type: 'input' },
  { k: 'services', label: '📸 Services offered', type: 'area' },
  { k: 'languages', label: '🗣️ Languages the team speaks', type: 'input' },
  { k: 'delivery_time', label: '⏱️ Delivery / turnaround time', type: 'input' },
  { k: 'packages', label: '💰 Packages (what they include — prices optional)', type: 'area' },
  { k: 'faqs', label: '❓ FAQs (Q: … / A: …)', type: 'area' },
  { k: 'policies', label: '📋 Policies (booking, deposit, travel, cancellation)', type: 'area' },
  { k: 'avoid_topics', label: '🚫 Things to avoid', type: 'area' },
  { k: 'tone_notes', label: '🎭 Tone / personality notes', type: 'area' },
  { k: 'notes', label: '📝 Anything else', type: 'area' },
];

function AiChatView({ vendors }) {
  const dialog = useDialog();
  const [tab, setTab] = useState('subs');
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openVendor, setOpenVendor] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);
  function load() {
    setLoading(true);
    api.chatbotSubscribers().then(d => setSubs(d.subscribers || [])).catch(() => {}).finally(() => setLoading(false));
  }
  async function toggleActive(s) {
    try { await api.chatbotSetActive(s.vendor_id, !s.active); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function addSub(vendorId) {
    if (!vendorId) return;
    try { await api.chatbotAddSubscriber(Number(vendorId)); setAdding(false); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function removeSub(s) {
    if (!await dialog.confirm(`${s.business_name} will lose access to the AI chatbot.`, { title: 'Remove from chatbot?', okLabel: 'Remove' })) return;
    try { await api.chatbotRemoveSubscriber(s.vendor_id); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  if (openVendor) return <KnowledgePage vendorId={openVendor} onBack={() => { setOpenVendor(null); load(); }} />;

  const notSubscribed = vendors.filter(v => !subs.some(s => s.vendor_id === v.id));

  return (
    <>
      <div className="cb-tabs">
        <button className={`cb-tab ${tab === 'subs' ? 'on' : ''}`} onClick={() => setTab('subs')}>👥 Subscribers</button>
        <button className={`cb-tab ${tab === 'costs' ? 'on' : ''}`} onClick={() => setTab('costs')}>💰 Costs</button>
        <button className={`cb-tab ${tab === 'api' ? 'on' : ''}`} onClick={() => setTab('api')}>🔑 API Key</button>
      </div>

      {tab === 'costs' && <ChatbotCosts />}
      {tab === 'api' && <ChatbotApiKey />}
      {tab === 'subs' && (
        <>
          <div className="cb-head">
            <div>
              <div className="sa-section-title">🤖 Chatbot Subscribers</div>
              <div className="cb-sub">{subs.length} subscriber{subs.length === 1 ? '' : 's'} · {subs.filter(s => s.active).length} active</div>
            </div>
            {!adding ? (
              <button className="sa-btn-teal cb-add-btn" onClick={() => setAdding(true)}>➕ Add subscriber</button>
            ) : (
              <div className="cb-add-row">
                <select className="cb-select" defaultValue="" onChange={e => addSub(e.target.value)}>
                  <option value="">Pick a vendor…</option>
                  {notSubscribed.map(v => <option key={v.id} value={v.id}>{v.business_name}</option>)}
                </select>
                <button className="cb-cancel" onClick={() => setAdding(false)}>✕</button>
              </div>
            )}
          </div>

          {loading ? <div className="sa-loading">Loading…</div>
            : subs.length === 0 ? <div className="sa-box cb-empty">No chatbot subscribers yet. Add one above 🤖</div>
            : (
              <div className="cb-list">
                {subs.map(s => (
                  <div key={s.vendor_id} className="cb-card" onClick={() => setOpenVendor(s.vendor_id)}>
                    <div className="cb-card-main">
                      <div className="cb-card-name">{s.business_name}</div>
                      <div className="cb-card-meta">
                        {s.email} · {s.has_knowledge ? '📚 Knowledge filled' : '📭 No knowledge yet'}
                      </div>
                    </div>
                    <div className="cb-card-right" onClick={e => e.stopPropagation()}>
                      <span className={`cb-status ${s.active ? 'on' : 'off'}`}>{s.active ? '🟢 Active' : '⚪ Inactive'}</span>
                      <button className={`cb-toggle ${s.active ? 'on' : ''}`} onClick={() => toggleActive(s)} title={s.active ? 'Turn off' : 'Turn on'}>
                        <span className="cb-knob" />
                      </button>
                      <button className="cb-del" onClick={() => removeSub(s)} title="Remove">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </>
  );
}

// 💰 per-vendor cost tracking
function ChatbotCosts() {
  const [d, setD] = useState(null);
  useEffect(() => { api.chatbotCosts().then(setD).catch(() => {}); }, []);
  if (!d) return <div className="sa-loading">Loading…</div>;
  return (
    <>
      <div className="sa-section-title">💰 Chatbot Costs</div>
      <div className="cb-sub">What each vendor's chatbot is costing you (Anthropic API usage).</div>
      <div className="cb-total">Total spend: <b>${d.total_usd.toFixed(4)}</b></div>
      {d.vendors.length === 0 ? <div className="sa-box cb-empty">No chatbot usage yet.</div> : (
        <div className="table-wrap">
          <table className="sa-table">
            <thead><tr><th>Vendor</th><th>Messages</th><th>Input tokens</th><th>Output tokens</th><th>Cost</th><th>Last used</th></tr></thead>
            <tbody>
              {d.vendors.map(v => (
                <tr key={v.vendor_id}>
                  <td>{v.business_name}</td>
                  <td>{v.messages}</td>
                  <td>{Number(v.input_tokens).toLocaleString()}</td>
                  <td>{Number(v.output_tokens).toLocaleString()}</td>
                  <td><b>${Number(v.cost_usd).toFixed(4)}</b></td>
                  <td>{v.last_used ? fmtDateTime(v.last_used, { dateOnly: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* 🌪️ Tornado's voice on Google Gemini Live: the key (hidden like the others) and
   which of Google's male voices it speaks with (Raj, 2026-10-11: Gemini Live
   is a few dollars a month; ElevenLabs agents were ~1,000 credits a minute). */
const GEMINI_VOICES = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Umbriel', 'Algenib', 'Alnilam', 'Achird', 'Sadaltager', 'Enceladus', 'Rasalgethi'];
function GeminiVoiceSettings({ s, setS, editing }) {
  const [msg, setMsg] = useState('');
  async function pick(v) {
    try { await api.savePlatformSettings({ gemini_voice: v }); setS(x => ({ ...x, gemini_voice: v })); setMsg(`✅ Tornado now speaks as ${v}`); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  return (
    <div className="av">
      <div className="av-hd">🌪️ Tornado's voice (Google Gemini Live)</div>
      <p className="av-sub">Real-time voice for the Tornado app. Create a key at aistudio.google.com → Get API key. It stays on the server; the app only ever gets a single-use, 30-minute token.</p>
      <label className="lbl">Gemini API key</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="AIza…"
        value={s.gemini_api_key || ''} onChange={e => setS({ ...s, gemini_api_key: e.target.value })} />
      <label className="lbl av-gap">Deepgram API key (Tornado's ear, optional)</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="Deepgram key"
        value={s.deepgram_api_key || ''} onChange={e => setS({ ...s, deepgram_api_key: e.target.value })} />
      <label className="lbl av-gap">PC voice address (Tornado's voice when your PC is on)</label>
      <input className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="http://100.73.28.96:8880"
        value={s.local_voice_url || ''} onChange={e => setS({ ...s, local_voice_url: e.target.value })} />
      <label className="lbl av-gap">PC voice password</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="from ~/tts/voice_token on the PC"
        value={s.local_voice_token || ''} onChange={e => setS({ ...s, local_voice_token: e.target.value })} />
      <label className="lbl av-gap">Voice (Google's male voices)</label>
      <div className="av-chips">
        {GEMINI_VOICES.map(v => (
          <button key={v} type="button" className={`av-chip ${(s.gemini_voice || 'Charon') === v ? 'is-on' : ''}`} onClick={() => pick(v)}>{v}</button>
        ))}
      </div>
      <p className="av-sub av-gap">Hear them at aistudio.google.com → Stream → Voice.</p>
      {msg && <div className="av-msg">{msg}</div>}
    </div>
  );
}

/* 🔑 The clients' AI chatbot key, kept masked. The AI Agent (the owner's
   private assistant) has its own key in Settings, so Anthropic's bill keeps
   the two apart (Raj, 2026-10-10). */
/** 🔒 Settings that are keys or passwords — write-only: never read back, only replaced. */
const SECRET_FIELDS = ['aws_secret_key', 'r2_secret_access_key', 'r2_private_secret_access_key', 'r2_public_secret_access_key', 'smtp_pass', 'stripe_connect_webhook_secret'];

function ApiKeyBox({ field, modelField, title, sub, modelHint, missing }) {
  const [s, setS] = useState(null);
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.platformSettings().then(r => setS(r.settings || {})).catch(() => {}); }, []);
  if (!s) return <div className="sa-loading">Loading…</div>;

  async function startEdit() {
    setEditing(true); setShow(false);
    setS(v => ({ ...v, [field]: '' }));                  // 🔒 write-only: paste a new key, or leave empty to keep the current one
  }
  async function save() {
    try {
      await api.savePlatformSettings({ [field]: s[field], [modelField]: s[modelField] });
      setEditing(false); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1800);
      api.platformSettings().then(r => setS(r.settings || {})).catch(() => {});
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  const val = () => (editing ? (s[field] || '') : (s[field] ? '••••••••••••••••' : ''));

  return (
    <>
      <div className="sa-section-title">{title}</div>
      <div className="cb-sub">{sub}</div>
      <div className="sa-box cb-api">
        <div className="cb-api-row">
          <div className="cb-api-field">
            <label className="lbl">API Key</label>
            <input className="cb-input" type={editing && !show ? 'password' : 'text'} readOnly={!editing} value={val()} autoComplete="off"
              placeholder={editing ? 'Paste a new key (empty keeps the current one)' : 'not set'}
              onChange={e => setS({ ...s, [field]: e.target.value })} />
          </div>
          <div className="cb-api-field">
            <label className="lbl">Model (optional)</label>
            <input className="cb-input" readOnly={!editing} value={s[modelField] || ''}
              placeholder={modelHint}
              onChange={e => setS({ ...s, [modelField]: e.target.value })} />
          </div>
        </div>
        <div className="cb-api-actions">
          {!editing ? (
            <button className="sa-btn-teal" onClick={startEdit}>✏️ Edit</button>
          ) : (
            <>
              <button className="sa-btn-teal" onClick={() => setShow(v => !v)}>{show ? '🙈 Hide' : '👁️ Show'}</button>
              <button className="sa-btn-teal" onClick={save}>💾 Save</button>
              <button className="cb-cancel" onClick={() => { setEditing(false); setShow(false); }}>✕</button>
            </>
          )}
          {msg && <span className="cb-msg">{msg}</span>}
        </div>
        {!s[field] && <div className="cb-warn">⚠️ {missing}</div>}
      </div>
    </>
  );
}

function ChatbotApiKey() {
  return (
    <>
      <ApiKeyBox field="anthropic_api_key" modelField="anthropic_model" title="🔑 AI Chatbot key"
        sub="Powers Wopo Assistant for every subscriber, leads from calls and photo descriptions. Kept masked."
        modelHint="claude-haiku-5-5"
        missing="No key — Wopo Assistant replies with a fallback message until you add one." />
    </>
  );
}

// ❓📨 unanswered questions + visitor messages for a vendor
function ChatbotInbox({ vendorId }) {
  const dialog = useDialog();
  const [pending, setPending] = useState([]);
  const [messages, setMessages] = useState([]);
  const [answers, setAnswers] = useState({});

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [vendorId]);
  function load() {
    api.chatbotPending(vendorId).then(d => setPending(d.pending || [])).catch(() => {});
    api.chatbotMessages(vendorId).then(d => setMessages(d.messages || [])).catch(() => {});
  }
  async function resolve(p, dismiss) {
    try { await api.chatbotResolvePending(p.id, answers[p.id] || '', dismiss); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function markRead(m) {
    try { await api.chatbotMarkRead(m.id); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  const unread = messages.filter(m => m.status === 'unread');
  if (pending.length === 0 && messages.length === 0) return null;

  return (
    <>
      {pending.length > 0 && (
        <div className="sa-box cb-inbox">
          <div className="cb-inbox-title">❓ Questions Wopo Assistant couldn't answer ({pending.length})</div>
          <div className="cb-inbox-hint">Answer these, then add them to the FAQs below so Wopo Assistant knows next time.</div>
          {pending.map(p => (
            <div key={p.id} className="cb-pending">
              <div className="cb-pending-q">“{p.question}”</div>
              <div className="cb-pending-row">
                <input className="cb-input" placeholder="Answer (optional — for your reference)"
                  value={answers[p.id] || ''} onChange={e => setAnswers({ ...answers, [p.id]: e.target.value })} />
                <button className="sa-btn-teal" onClick={() => resolve(p, false)}>✅ Done</button>
                <button className="cb-cancel" onClick={() => resolve(p, true)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="sa-box cb-inbox">
          <div className="cb-inbox-title">📨 Messages for the vendor ({unread.length} unread)</div>
          {messages.map(m => (
            <div key={m.id} className={`cb-vmsg ${m.status === 'unread' ? 'unread' : ''}`}>
              <div className="cb-vmsg-top">
                <span className="cb-vmsg-who">{m.name || 'Visitor'}{m.contact ? ` · ${m.contact}` : ''}</span>
                <span className="cb-vmsg-date">{fmtDateTime(m.created_at, { dateOnly: true })}</span>
              </div>
              <div className="cb-vmsg-body">{m.message}</div>
              {m.status === 'unread' && <button className="cb-mark" onClick={() => markRead(m)}>Mark read</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KnowledgePage({ vendorId, onBack }) {
  const dialog = useDialog();
  const [k, setK] = useState(null);
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [vendorId]);
  function load() {
    api.chatbotKnowledge(vendorId).then(d => {
      setK(d.knowledge); setSub(d.subscriber); setCode(d.subscriber?.access_code || '');
    }).catch(() => {});
  }
  async function save() {
    try { await api.chatbotSaveKnowledge(vendorId, k); setEditing(false); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1800); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function saveCode() {
    try {
      const d = await api.chatbotSetCode(vendorId, code);
      setSub(s => ({ ...s, access_code: d.access_code }));
      setMsg('✅ Access code saved'); setTimeout(() => setMsg(''), 1800);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function copyLink() {
    const url = `${window.location.origin}/knowledge/${sub.share_token}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => dialog.prompt('Select and copy this link:', url, { title: 'Copy link', readOnly: true, okLabel: 'Done' }));
  }

  if (!k || !sub) return <div className="sa-loading">Loading…</div>;
  const shareUrl = `${window.location.origin}/knowledge/${sub.share_token}`;

  return (
    <>
      <div className="cb-head">
        <div>
          <button className="cb-back" onClick={onBack}>← Subscribers</button>
          <div className="sa-section-title">📚 {sub.business_name} — Knowledge</div>
          <div className="cb-sub">This is what the chatbot knows about them.</div>
        </div>
        <div className="cb-actions">
          <button className="sa-btn-teal" onClick={() => setShowShare(v => !v)}>🔗 Share with vendor</button>
          {!editing
            ? <button className="sa-btn-teal" onClick={() => setEditing(true)}>✏️ Edit</button>
            : <button className="sa-btn-teal" onClick={save}>💾 Save</button>}
        </div>
      </div>

      {showShare && (
        <div className="sa-box cb-share">
          <div className="cb-share-title">🔗 Shareable fill-in link</div>
          <div className="cb-share-hint">Send this to the vendor. They enter the access code, fill it in, and it's ready for the chatbot.</div>
          <div className="cb-share-row">
            <input className="cb-input" readOnly value={shareUrl} onFocus={e => e.target.select()} />
            <button className="sa-btn-teal" onClick={copyLink}>{copied ? '✅' : '🔗 Copy'}</button>
          </div>
          <div className="cb-share-row">
            <input className="cb-input" placeholder="Set an access code (e.g. studio2026)" value={code} onChange={e => setCode(e.target.value)} />
            <button className="sa-btn-teal" onClick={saveCode}>🔑 Save code</button>
          </div>
          {!sub.access_code && <div className="cb-warn">⚠️ No access code set — anyone with the link can edit. Set one above.</div>}
        </div>
      )}

      {msg && <div className="cb-msg">{msg}</div>}

      <ChatbotInbox vendorId={vendorId} />

      <div className="sa-box cb-knowledge">
        {KFIELDS.map(f => (
          <div key={f.k} className="cb-field">
            <label className="lbl">{f.label}</label>
            {f.type === 'input'
              ? <input className="cb-input" readOnly={!editing} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />
              : <textarea className="cb-input cb-area" readOnly={!editing} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />}
          </div>
        ))}
      </div>
    </>
  );
}

function FaceEngineSettings() {
  const dialog = useDialog();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [reMsg, setReMsg] = useState('');
  const [qstat, setQstat] = useState(null);
  const [credOpen, setCredOpen] = useState(false);
  /* R2 is a long block of eight fields that is set once and then never looked
     at again. Folded away by default, like the AWS credentials above it. */
  const [r2Open, setR2Open] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMsg, setAiMsg] = useState(null);

  /** Removing a credential is its own act — see the comment on the button. */
  async function clearAiKey() {
    if (!await dialog.confirm(
      'Your AI Agent will stop answering until a new key is added.',
      { title: 'Remove the AI Agent key?', okLabel: 'Remove' })) return;
    try {
      await api.clearPlatformKeys(['agent_api_key']);
      setS(v => ({ ...v, agent_api_key: '' }));
      setAiMsg({ ok: true, text: 'Key removed.' });
    } catch (e) { setAiMsg({ ok: false, text: '⚠️ ' + e.message }); }
  }

  /** One token back is the cheapest proof a key works. */
  async function testAi() {
    setAiTesting(true); setAiMsg(null);
    try {
      const r = await api.testAi('agent');
      setAiMsg({ ok: true, text: `✅ The AI Agent replied "${r.said}" using ${r.model || 'the default model'}` });
    } catch (e) {
      setAiMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not reach the AI Agent') });
    } finally { setAiTesting(false); }
  }

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  /** Actually send one, and say what the mail server said. */
  async function sendTest() {
    setTesting(true); setTestMsg(null);
    try {
      const r = await api.testPlatformEmail(testTo.trim());
      setTestMsg({ ok: true, text: `✅ Sent to ${r.to} from ${r.from}. If it does not arrive, check the spam folder — that usually means the domain's SPF or DKIM records are missing.` });
    } catch (e) {
      setTestMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not send') });
    } finally { setTesting(false); }
  }
  const box = { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 9, width: '100%' };
  const roBox = { ...box, opacity: 0.7, cursor: 'not-allowed' };

  useEffect(() => { api.platformSettings().then(d => setS(d.settings || {})).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    const tick = () => api.faceQueueStatus().then(d => { if (alive) setQstat(d); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 5000); // live refresh every 5s
    return () => { alive = false; clearInterval(iv); };
  }, []);
  if (!s) return null;

  async function save(next) {
    setS(next);
    /* "Every number" is an empty number id, and the server skips empty values
       so a blank box never wipes a key — so emptying it is asked for by name. */
    const payload = { ...next };
    try { await api.savePlatformSettings(payload); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function startEdit() {
    // 🔒 write-only keys: the secret boxes open empty — paste a new one, or leave empty to keep the current one
    setS(v => ({ ...v, ...Object.fromEntries(SECRET_FIELDS.map(k => [k, ''])) }));
    setEditing(true); setShow(false);
  }
  function stopEdit() {
    setEditing(false); setShow(false);
    // re-mask by reloading masked view
    api.platformSettings().then(d => setS(d.settings || {})).catch(() => {});
  }
  async function reindex() {
    if (!await dialog.confirm('Every photo will be re-processed with the current engine. All existing face data is cleared first, and this cannot be undone.', { title: 'Re-index all photos?', okLabel: 'Re-index everything' })) return;
    setReMsg('🔄 Resetting…');
    try { const r = await api.reindexAll(); setReMsg(`✅ Reset ${r.reset} photos — open each album and click Index Faces`); }
    catch (e) { setReMsg('⚠️ ' + e.message); }
    setTimeout(() => setReMsg(''), 6000);
  }
  const awsMode = s.aws_mode || 'aws_off';
  const awsUsed = awsMode === 'aws_on' || awsMode === 'aws_safety_net';
  const MODES = [
    { k: 'aws_off', icon: '🖥️', title: 'Local only', desc: 'Free. Runs on your server. Adapts to traffic (1–2 photos at a time).' },
    { k: 'aws_safety_net', icon: '🛟', title: 'Safety net', desc: 'Local normally — overflows to AWS only when photos pile up. Recommended.' },
    { k: 'aws_on', icon: '☁️', title: 'AWS always', desc: 'Every album on AWS Rekognition. Fastest, ~$1 per 1000 photos.' },
  ];
  // display value: masked unless editing+show
  const val = (k) => {
    // 🔒 always masked when just viewing — real values only appear in edit mode + Show
    if (!editing) return s[k] ? '••••••••••••' : '';
    if (show) return s[k] || '';
    return s[k] ? '••••••••••••' : '';
  };

  return (
    <>
      <div className="sa-section-title" style={{ marginTop: 22 }}>🧠 Face Recognition Engine</div>
      <div className="sa-box" style={{ padding: 18 }}>

        {/* 3-mode picker */}
        <div className="fr-modes">
          {MODES.map(m => (
            <button key={m.k} className={`fr-mode ${awsMode === m.k ? 'on' : ''}`} onClick={() => save({ ...s, aws_mode: m.k })}>
              <div className="fr-mode-top">{m.icon} {m.title}</div>
              <div className="fr-mode-desc">{m.desc}</div>
            </button>
          ))}
        </div>

        {/* live queue status */}
        {qstat && (
          <div className="fr-status">
            <span>📊 Backlog: <b>{qstat.backlog}</b></span>
            <span>⚙️ CPU load: <b>{qstat.load}</b>/{qstat.cores}</span>
            <span>🧵 Indexing: <b>{qstat.concurrency}</b> at a time</span>
            <span>{qstat.overflowing ? '🛟 Overflowing to AWS' : (qstat.aws_mode === 'aws_on' ? '☁️ AWS' : '🖥️ Local')}</span>
          </div>
        )}

        <div style={{ margin: '14px 0' }}>
          <button className="sa-btn-teal" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={reindex}>🔄 Re-index all photos</button>
          {reMsg && <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--muted)' }}>{reMsg}</span>}
        </div>

        {/* AWS credentials — collapsible, always masked until you choose to edit/show */}
        {awsUsed && (
          <div className="fr-cred">
            <button className="fr-cred-head" onClick={() => setCredOpen(o => !o)}>
              <span>🔑 AWS Credentials</span>
              <span className="fr-cred-chev">{credOpen ? '▲' : '▼'}</span>
            </button>

            {credOpen && (
              <div className="fr-cred-body">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  {!editing ? (
                    <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={startEdit}>✏️ Edit</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setShow(v => !v)}>{show ? '🙈 Hide' : '👁️ Show'}</button>
                      <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                      <button style={{ padding: '5px 12px', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--text)', cursor: 'pointer' }} onClick={stopEdit}>✕</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label className="lbl">AWS Access Key</label><input style={editing ? box : roBox} readOnly={!editing} value={val('aws_access_key')} onChange={e => setS({ ...s, aws_access_key: e.target.value })} /></div>
                  <div><label className="lbl">AWS Secret Key</label><input style={editing ? box : roBox} readOnly={!editing} value={val('aws_secret_key')} onChange={e => setS({ ...s, aws_secret_key: e.target.value })} /></div>
                  <div><label className="lbl">AWS Region</label><input style={editing ? box : roBox} readOnly={!editing} value={val('aws_region')} onChange={e => setS({ ...s, aws_region: e.target.value })} /></div>
                </div>
              </div>
            )}
            {awsMode === 'aws_safety_net' && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>💡 AWS only kicks in when the local backlog gets deep, then hands back automatically.</div>}
          </div>
        )}

        {/* R2 is object storage and has nothing to do with the face engine. It
            was nested inside the AWS branch above, so on any account whose face
            mode is "Local only" — which is the default, and what live runs —
            the entire storage section simply did not exist. Two panels running
            identical code looked different, and the settings were unreachable
            on the one that mattered. */}
        <div className="fr-cred">
              <button type="button" className="fr-cred-head" style={{ marginTop: 26 }}
                onClick={() => setR2Open(o => !o)} aria-expanded={r2Open}>
                <span>🪣 Cloudflare R2 storage</span>
                <span className="fr-cred-chev">{r2Open ? '▲' : '▼'}</span>
              </button>

              {r2Open && (
              <div className="fr-cred-body">
                {/* Its own Edit control. These fields share the read-only lock
                    with the AWS block above, but that block's Edit button only
                    renders when AWS mode is on — so with AWS off there was no
                    way to type in any of this at all. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  {!editing ? (
                    <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={startEdit}>✏️ Edit</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                      <button style={{ padding: '5px 12px', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--text)', cursor: 'pointer' }} onClick={stopEdit}>✕</button>
                    </div>
                  )}
                </div>

              <div><label className="lbl">Account ID</label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  value={s.r2_account_id || ''}
                  onChange={e => setS({ ...s, r2_account_id: e.target.value })} /></div>

              <div><label className="lbl">Shared Access Key ID</label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="used by either bucket with no key of its own"
                  value={s.r2_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Shared Secret Access Key</label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  value={s.r2_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_secret_access_key: e.target.value })} /></div>

              {/* ── 🔒 private ─────────────────────────────────────────── */}
              <div className="sa-sec-hd" style={{ marginTop: 22 }}>🔒 Private bucket — client galleries &amp; File Flyer</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Reached only by album password or share token. Public access must stay OFF on this bucket.
              </div>

              <div><label className="lbl">Bucket name</label>
                <input style={editing ? box : roBox} readOnly={!editing} placeholder="iwopo-private"
                  value={s.r2_bucket_private || ''}
                  onChange={e => setS({ ...s, r2_bucket_private: e.target.value })} /></div>

              <div><label className="lbl">Access Key ID <span style={{ color: 'var(--muted)' }}>— optional</span></label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_private_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_private_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Secret Access Key <span style={{ color: 'var(--muted)' }}>— optional</span></label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_private_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_private_secret_access_key: e.target.value })} /></div>

              {/* ── 🌐 public ──────────────────────────────────────────── */}
              <div className="sa-sec-hd" style={{ marginTop: 22 }}>🌐 Public bucket — website images &amp; logos</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Deliberately world-readable. Nothing private should ever be written here.
              </div>

              <div><label className="lbl">Bucket name</label>
                <input style={editing ? box : roBox} readOnly={!editing} placeholder="iwopo-public"
                  value={s.r2_bucket_public || ''}
                  onChange={e => setS({ ...s, r2_bucket_public: e.target.value })} /></div>

              <div><label className="lbl">Access Key ID <span style={{ color: 'var(--muted)' }}>— optional</span></label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_public_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_public_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Secret Access Key <span style={{ color: 'var(--muted)' }}>— optional</span></label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_public_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_public_secret_access_key: e.target.value })} /></div>

              <div><label className="lbl">Public URL</label>
                <input style={editing ? box : roBox} readOnly={!editing}
                  placeholder="https://cdn.yourdomain.com"
                  value={s.r2_public_url || ''}
                  onChange={e => setS({ ...s, r2_public_url: e.target.value })} /></div>

              <div className="cb-warn" style={{ marginTop: 10 }}>
                🔒 The two buckets must be different. Galleries and File Flyer files are reached
                by password or share token — putting them in the public bucket lets anyone with
                the file&rsquo;s URL walk past both. Saving the same name for both is refused.
              </div>
              </div>
              )}
        </div>

        {/* 💳 Stripe Connect — vendors connect their OWN Stripe for client card payments (lib/stripeConnect.js) */}
        <div className="fr-cred">
          <div className="fr-cred-head sa-connect-head"><span>💳 Stripe Connect — client card payments</span></div>
          <div className="fr-cred-body">
            {/* its own Edit — the shared one sits inside folded sections, so these keys were otherwise read-only */}
            <div className="sa-connect-actions">
              {!editing
                ? <button type="button" className="sa-btn-teal sa-connect-btn" onClick={startEdit}>✏️ Edit</button>
                : <>
                    <button type="button" className="sa-btn-teal sa-connect-btn" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                    <button type="button" className="sa-connect-x" onClick={stopEdit}>✕</button>
                  </>}
            </div>
            <div><label className="lbl">Connect client ID (ca_…)</label>
              <input style={editing ? box : roBox} readOnly={!editing} autoComplete="off" placeholder="ca_…"
                value={s.stripe_connect_client_id || ''} onChange={e => setS({ ...s, stripe_connect_client_id: e.target.value })} /></div>
            <div><label className="lbl">Connected-accounts webhook secret (whsec_…)</label>
              <input style={editing ? box : roBox} readOnly={!editing} autoComplete="off"
                placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''}
                value={s.stripe_connect_webhook_secret || ''} onChange={e => setS({ ...s, stripe_connect_webhook_secret: e.target.value })} /></div>
            <p className="sa-connect-note">From the Stripe dashboard → Connect settings (client ID) and Developers → Webhooks (the endpoint listening to connected accounts). Money from clients goes to each vendor&rsquo;s own Stripe — never through iwopo.</p>
          </div>
        </div>

        {/* 📧 Platform email.
            These were environment variables, which meant the one person who
            could set them had to edit a file on the server — so they never were,
            and nothing in the product could send anything at all. */}
        <div className="fr-cred">
          <button type="button" className="fr-cred-head" style={{ marginTop: 26 }}
            onClick={() => setMailOpen(o => !o)} aria-expanded={mailOpen}>
            <span>📧 Platform email</span>
            <span className="fr-cred-chev">{mailOpen ? '▲' : '▼'}</span>
          </button>

          {mailOpen && (
          <div className="fr-cred-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              {!editing ? (
                <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={startEdit}>✏️ Edit</button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                  <button style={{ padding: '5px 12px', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--text)', cursor: 'pointer' }} onClick={stopEdit}>✕</button>
                </div>
              )}
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
              Used for everything iwopo sends. A vendor who sets their own mail
              account under Setup Email uses that instead, so their clients see
              their address rather than ours.
            </p>

            <div><label className="lbl">Host</label>
              <input style={editing ? box : roBox} readOnly={!editing}
                placeholder="smtp.resend.com"
                value={s.smtp_host || ''}
                onChange={e => setS({ ...s, smtp_host: e.target.value })} /></div>

            <div><label className="lbl">Port</label>
              <input style={editing ? box : roBox} readOnly={!editing}
                placeholder="587"
                value={s.smtp_port || ''}
                onChange={e => setS({ ...s, smtp_port: e.target.value })} /></div>

            <div><label className="lbl">Username</label>
              <input style={editing ? box : roBox} readOnly={!editing}
                value={s.smtp_user || ''}
                onChange={e => setS({ ...s, smtp_user: e.target.value })} /></div>

            <div><label className="lbl">Password</label>
              <input type="password" style={editing ? box : roBox} readOnly={!editing}
                value={s.smtp_pass || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                onChange={e => setS({ ...s, smtp_pass: e.target.value })} /></div>

            <div><label className="lbl">From address</label>
              <input style={editing ? box : roBox} readOnly={!editing}
                placeholder="noreply@iwopo.com"
                value={s.smtp_from || ''}
                onChange={e => setS({ ...s, smtp_from: e.target.value })} /></div>

            <div><label className="lbl">From name</label>
              <input style={editing ? box : roBox} readOnly={!editing}
                placeholder="iwopo"
                value={s.smtp_from_name || ''}
                onChange={e => setS({ ...s, smtp_from_name: e.target.value })} /></div>

            {/* Mail fails quietly — a wrong port or a rejected password looks
                exactly like a saved form and silence. This actually sends one. */}
            <div className="sa-sec-hd" style={{ marginTop: 22 }}>Send a test</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input style={box} placeholder="your@email.com"
                value={testTo} onChange={e => setTestTo(e.target.value)} />
              <button className="sa-btn-teal" style={{ padding: '7px 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}
                disabled={testing} onClick={sendTest}>
                {testing ? 'Sending…' : 'Send test'}
              </button>
            </div>
            {testMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: testMsg.ok ? '#4ade80' : '#f87171' }}>
                {testMsg.text}
              </div>
            )}
          </div>
          )}
        </div>

        {/* 🤖 The AI Agent — the platform owner's private assistant (Raj,
            2026-10-10). Its own key: the clients' chatbot keeps its key under
            AI Chat → API Key, so the two never share a bill. */}
        <div className="fr-cred">
          <button type="button" className="fr-cred-head" style={{ marginTop: 26 }}
            onClick={() => setAiOpen(o => !o)} aria-expanded={aiOpen}>
            <span>🤖 AI Agent</span>
            <span className="fr-cred-chev">{aiOpen ? '▲' : '▼'}</span>
          </button>

          {aiOpen && (
          <div className="fr-cred-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              {!editing ? (
                <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={startEdit}>✏️ Edit</button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sa-btn-teal" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                  <button style={{ padding: '5px 12px', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--text)', cursor: 'pointer' }} onClick={stopEdit}>✕</button>
                </div>
              )}
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
              Your private AI Agent (panel → 🤖 AI Agent) — only you use it.
              The clients' chatbot has its own key under AI Chat → API Key. Get a
              key at console.anthropic.com — charged per use, a fraction of a
              cent per question.
            </p>

            <div><label className="lbl">API key</label>
              <input type="password" style={editing ? box : roBox} readOnly={!editing}
                placeholder="sk-ant-…"
                value={s.agent_api_key || ''}
                onChange={e => setS({ ...s, agent_api_key: e.target.value })} /></div>

            <div className="sa-sec-hd" style={{ marginTop: 22 }}>Check the key</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <button className="sa-btn-teal" style={{ padding: '7px 14px', fontSize: 12.5 }}
                disabled={aiTesting} onClick={testAi}>
                {aiTesting ? 'Checking…' : 'Say hello to the AI Agent'}
              </button>
              {/* 🗑️ Emptying the box and saving deliberately does NOT remove a
                  key — the form sends every field on every save, so that would
                  wipe working credentials by accident. Removing one is its own
                  act, which is also the only way to revoke a key that leaked. */}
              {s.agent_api_key && (
                <button style={{ padding: '7px 14px', fontSize: 12.5, background: 'var(--panel-2)',
                  border: '1px solid var(--line)', borderRadius: 7, color: 'var(--red)', cursor: 'pointer' }}
                  onClick={clearAiKey}>
                  🗑️ Remove key
                </button>
              )}
            </div>
            {aiMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: aiMsg.ok ? '#4ade80' : '#f87171' }}>
                {aiMsg.text}
              </div>
            )}
            <GeminiVoiceSettings s={s} setS={setS} editing={editing} />
          </div>
          )}
        </div>

        {/* 📞 Calls & texts (Quo) are now each vendor's own: Calls & Messages → Calls & Texts → ⚙️ (2026-10-23) */}
        <p className="sa-hint">📞 Calls &amp; texts (Quo) are set up by each vendor in Calls &amp; Messages → ⚙️.</p>
        {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: '#4ade80' }}>{msg}</div>}
      </div>
    </>
  );
}

function SettingsView({ saTheme, setSaTheme, user }) {
  return (
    <>
    <div className="sa-compact-row">
      <span className="sa-compact-lbl">🌗 Panel theme</span>
      <span className="sa-compact-seg">
        {['dark', 'light'].map(t => (
          <button key={t} type="button" onClick={() => setSaTheme(t)}
            className={`sa-seg-btn ${saTheme === t ? 'is-on' : ''}`}>
            {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
        ))}
      </span>
    </div>
    <AdminsView user={user} />
    <FaceEngineSettings />
    </>
  );
}


/* ---------- ADMINS ---------- */
/**
 * 🔐 The super admin's own account.
 *
 * The Edit button here did nothing, and it was the only place this was ever
 * meant to live — the super panel had no way to change its own name, email or
 * password, so the only route to a new password was editing the database by
 * hand. That is a bad position to be in on the day you need to rotate one.
 *
 * Email and password each demand the current password. Anyone sitting at an
 * unlocked laptop should not be able to take the account over in two clicks.
 */
function AdminsView({ user }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const say = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  async function saveName() {
    if (!name.trim() || name === user?.name) return;
    setBusy('name');
    try { await api.updateMyName(name.trim()); say('✅ Name saved — it updates everywhere next time you sign in'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }

  async function saveEmail() {
    if (!email.trim() || !curPw) return say('⚠️ Enter your current password to change the email');
    setBusy('email');
    try { await api.changeEmail(email.trim(), curPw); setCurPw(''); say('✅ Email changed — sign in with it next time'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }

  async function savePassword() {
    if (!curPw || !newPw) return say('⚠️ Both passwords are needed');
    setBusy('pw');
    try { await api.changePassword(curPw, newPw); setCurPw(''); setNewPw(''); say('✅ Password changed'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }

  return (
    <>
      {/* One line rather than a four-column table with a header row above a
          single entry. If a second admin is ever added, this becomes a list of
          the same rows — the table can come back when it earns its header. */}
      <div className="sa-compact-row">
        <span className="sa-compact-lbl">🔐 {user?.name} <span className="sa-compact-dim">· {user?.email || 'raj@iwopo.com'}</span></span>
        <span className="sa-compact-seg">
          <span className="sa-badge active">super_admin</span>
          <button type="button" className={`sa-view-btn ${open ? 'active-btn' : ''}`} onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Edit'}
          </button>
        </span>
      </div>

      {open && (
        <div className="sa-box sa-acct">
          <div className="sa-acct-row">
            <label className="sa-acct-lbl">Display name</label>
            <input className="sa-set-input" value={name} onChange={e => setName(e.target.value)} />
            <button className="sa-view-btn" disabled={busy === 'name'} onClick={saveName}>
              {busy === 'name' ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="sa-acct-row">
            <label className="sa-acct-lbl">Sign-in email</label>
            <input className="sa-set-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="sa-view-btn" disabled={busy === 'email'} onClick={saveEmail}>
              {busy === 'email' ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="sa-acct-row">
            <label className="sa-acct-lbl">Current password</label>
            <input className="sa-set-input" type="password" value={curPw} autoComplete="current-password"
              placeholder="Needed for email or password" onChange={e => setCurPw(e.target.value)} />
            <span />
          </div>

          <div className="sa-acct-row">
            <label className="sa-acct-lbl">New password</label>
            <input className="sa-set-input" type="password" value={newPw} autoComplete="new-password"
              placeholder="At least 6 characters" onChange={e => setNewPw(e.target.value)} />
            <button className="sa-view-btn" disabled={busy === 'pw'} onClick={savePassword}>
              {busy === 'pw' ? 'Saving…' : 'Change'}
            </button>
          </div>

          {msg && <div className="sa-acct-msg">{msg}</div>}
        </div>
      )}
    </>
  );
}
