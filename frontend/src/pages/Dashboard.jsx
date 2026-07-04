import { useState, useEffect } from 'react';
import { api, getUser, clearSession } from '../lib/api';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar, Line
} from 'recharts';
import './super.css';

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', group: 'PLATFORM' },
  { id: 'services', icon: '🧩', label: 'Services & Packages', group: 'PLATFORM' },
  { id: 'buyers', icon: '🛒', label: 'Buyers', group: 'PLATFORM' },
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
  const user = getUser();

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
    <div className="sa-wrap">
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
          <div className="sa-role-pill">🔑 super_admin</div>
        </div>

        {loading ? <div className="sa-loading">Loading…</div> : (
          <>
            {view === 'dashboard' && <DashboardView vendors={vendors} packages={packages} trials={trials} />}
            {view === 'services' && <ServicesView packages={packages} />}
            {view === 'buyers' && <BuyersView vendors={vendors} />}
            {view === 'billing' && <BillingView packages={packages} />}
            {view === 'support' && <SupportView />}
            {view === 'settings' && <SettingsView />}
            {view === 'admins' && <AdminsView user={user} />}
          </>
        )}
      </main>
    </div>
  );
}

function money(v) { return v == null ? null : `$${Number(v).toFixed(2)}`; }

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
    '🌐 Website Builder', '🎬 Studio Special', '🏢 Vendor Suite',
    '📸 Galleries', '🤖 AI Chatbot', '💬 Non-AI Chatbot', '☁️ File & Cloud',
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
          <div style={{ height: 180, display: 'flex' }}>
            <ResponsiveContainer width="50%" height="100%">
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
function ServicesView({ packages }) {
  return (
    <>
      <div className="sa-section-title">Packages & Pricing 🎁</div>
      <div className="sa-hint" style={{ marginTop: 0, marginBottom: 14 }}>
        Every package includes a 30-day free trial. Editing prices wires up next.
      </div>
      <div className="sa-pkg-grid">
        {packages.map(p => <PackageCard key={p.id} pkg={p} />)}
      </div>
    </>
  );
}

function PackageCard({ pkg }) {
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
        <div className="sa-pkg-price">
          <span className="amt">{money(pkg.price_monthly)}</span><span className="per">/mo</span>
          {hasAnnual && (
            <div className="sa-pkg-annual">
              or <b>{money(pkg.price_annual)}</b>/yr
              {pkg.price_annual_regular && <s>{money(pkg.price_annual_regular)}</s>}
            </div>
          )}
        </div>
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
            <div key={i.id} className="sa-pkg-item">
              <span>{i.icon} {i.name}{i.detail ? ` · ${i.detail}` : ''}</span>
              <span className="sa-pkg-iprice">
                {money(i.price_monthly)}{i.price_annual ? ` · ${money(i.price_annual)}/yr` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {pkg.addons?.length > 0 && (
        <div className="sa-pkg-sec">
          <div className="sa-pkg-sec-label">➕ ADD-ONS</div>
          {pkg.addons.map(i => (
            <div key={i.id} className="sa-pkg-item">
              <span>{i.icon} {i.name}{i.detail ? ` · ${i.detail}` : ''}</span>
              <span className="sa-pkg-iprice">
                {money(i.price_monthly)}{i.price_annual ? ` · ${money(i.price_annual)}/yr` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- BUYERS ---------- */
function BuyersView({ vendors }) {
  return (
    <>
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
                <td><button className="sa-view-btn">Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
function SettingsView() {
  return (
    <div className="sa-box" style={{ padding: 0 }}>
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
