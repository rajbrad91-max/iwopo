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
import NavIcon from '../components/NavIcon';
import { useAdminRoute, adminPath } from '../lib/adminRoute';

const NAV = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', group: 'PLATFORM' },
  { id: 'services', icon: 'packages', label: 'Services & Packages', group: 'PLATFORM' },
  { id: 'manage', icon: 'services', label: 'Manage Services', group: 'PLATFORM' },
  { id: 'buyers', icon: 'leads-all', label: 'Buyers', group: 'PLATFORM' },
  { id: 'referrals', icon: 'refer', label: 'Referrals', group: 'PLATFORM' },
  { id: 'waitlist', icon: 'requests', label: 'Waitlist', group: 'PLATFORM' },
  { id: 'billing', icon: 'contracts', label: 'Billing & Plans', group: 'PLATFORM' },
  { id: 'aichat', icon: 'aichat', label: 'AI Chat', group: 'OPERATE' },
  { id: 'support', icon: 'help', label: 'Support', group: 'OPERATE' },
  { id: 'settings', icon: 'settings', label: 'Settings', group: 'OPERATE' },
];
const VIEWS = NAV.map(n => n.id);   // each one has its own address: /admin/<id> (lib/adminRoute.js)

export default function Dashboard({ onLogout }) {
  const [route, go] = useAdminRoute(VIEWS);
  const view = route.view;
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
  function logout() { apiLogout(); window.history.replaceState({}, '', '/'); onLogout(); }
  /* a plain click stays in the panel; Ctrl/⌘/Shift/middle-click opens the page's address in a new tab */
  const navClick = (id) => (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); go(id); setSidebarOpen(false);
  };

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
              <a key={n.id} href={adminPath(n.id)} className={`sa-nav-item ${view === n.id ? 'active' : ''}`}
                aria-current={view === n.id ? 'page' : undefined} onClick={navClick(n.id)}>
                <span className="ico"><NavIcon name={n.icon} /></span> {n.label}
              </a>
            ))}
          </div>
        ))}
        <div className="sa-nav-item sa-logout" onClick={logout}><span className="ico"><NavIcon name="logout" /></span> Log out</div>
      </aside>

      {sidebarOpen && <div className="sa-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="sa-main">
        <div className="sa-topbar">
          <div className="sa-topbar-left">
            <span className="sa-hamburger" onClick={() => setSidebarOpen(true)}>☰</span>
            <div>
              <h1>{NAV.find(n => n.id === view)?.label}</h1>
              <div className="sa-sub">Welcome back, {user?.name}</div>
            </div>
          </div>
          <AdminBells goView={go} />
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
            {view === 'settings' && <SettingsView saTheme={saTheme} setSaTheme={setSaTheme} user={user}
              section={route.sub} onSection={(s) => go('settings', s)} />}
          </>
        )}
      </main>
    </div>
  );
}
