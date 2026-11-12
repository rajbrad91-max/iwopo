import { useState, useEffect } from 'react';
import { api, getUser, logout as apiLogout } from '../lib/api';
import './super.css';
import './agentvoice.css';
// ✂️ each screen lives in its own file (pages/admin/ — code audit #2, 2026-11-11)
import { AdminBells } from './admin/AdminBells';
import { DashboardView } from './admin/DashboardView';
import { ServicesView } from './admin/Services';
import { ManageServicesView } from './admin/ManageServices';
import { ReferralsView } from './admin/Referrals';
import { WaitlistView } from './admin/Waitlist';
import { BuyersView } from './admin/Buyers';
import { BillingView } from './admin/Billing';
import { SupportView } from './admin/Support';
import { AiChatView } from './admin/AiChat';
import { SettingsView } from './admin/Settings';


const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', group: 'PLATFORM' },
  { id: 'services', icon: '🧩', label: 'Services & Packages', group: 'PLATFORM' },
  { id: 'manage', icon: '🛠️', label: 'Manage Services', group: 'PLATFORM' },
  { id: 'buyers', icon: '🛒', label: 'Buyers', group: 'PLATFORM' },
  { id: 'referrals', icon: '👥', label: 'Referrals', group: 'PLATFORM' },
  { id: 'waitlist', icon: '📝', label: 'Waitlist', group: 'PLATFORM' },
  { id: 'billing', icon: '💳', label: 'Billing & Plans', group: 'PLATFORM' },
  { id: 'aichat', icon: '🤖', label: 'AI Chat', group: 'OPERATE' },
  { id: 'support', icon: '🎫', label: 'Support', group: 'OPERATE' },
  { id: 'settings', icon: '🔧', label: 'Settings', group: 'OPERATE' },
];
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
            {view === 'waitlist' && <WaitlistView />}
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
