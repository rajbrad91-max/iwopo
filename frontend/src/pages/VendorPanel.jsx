import { useState, useEffect } from 'react';
import { api, getUser, clearSession } from '../lib/api';

export default function VendorPanel({ onLogout }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const user = getUser();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await api.myServices();
      setServices(d.services);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() { clearSession(); onLogout(); }

  const active = services.filter(s => s.enabled);

  return (
    <div className="dash">
      <aside className="sidebar">
        <div className="brand">📸 My Studio<small>VENDOR</small></div>
        <div className={`nav-item ${tab==='dashboard'?'active':''}`} onClick={() => setTab('dashboard')}>📊 Dashboard</div>
        <div className={`nav-item ${tab==='services'?'active':''}`} onClick={() => setTab('services')}>🧩 My Services</div>
        <div className="logout" onClick={handleLogout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tab === 'dashboard' ? 'Dashboard' : 'My Services'}</h1>
            <div className="sub">Welcome back, {user?.name} 👋</div>
          </div>
          <button className="refresh" onClick={load}>🔄 Refresh</button>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {loading ? <div className="loading">Loading…</div> : tab === 'dashboard' ? (
          <>
            <div className="stats">
              <div className="card"><div className="label">Active Services</div><div className="value">{active.length}</div></div>
              <div className="card"><div className="label">Available</div><div className="value">{services.length}</div></div>
              <div className="card"><div className="label">Plan</div><div className="value" style={{fontSize:'20px'}}>Trial</div></div>
              <div className="card"><div className="label">Status</div><div className="value" style={{fontSize:'20px',color:'var(--teal)'}}>Live</div></div>
            </div>
            <h2>Your active services</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Service</th><th>Status</th></tr></thead>
                <tbody>
                  {active.length === 0 ? (
                    <tr><td colSpan="2" className="empty">No services yet. Your admin will enable them soon.</td></tr>
                  ) : active.map(s => (
                    <tr key={s.id}>
                      <td className="biz">{s.icon} {s.name}</td>
                      <td><span className="badge active">Active</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
