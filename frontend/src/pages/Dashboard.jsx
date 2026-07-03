import { useState, useEffect } from 'react';
import { api, getUser, clearSession } from '../lib/api';

export default function Dashboard({ onLogout }) {
  const [vendors, setVendors] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(null); // vendor being managed
  const [vendorServices, setVendorServices] = useState({}); // {serviceId: enabled}
  const user = getUser();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [v, s] = await Promise.all([api.vendors(), api.services()]);
      setVendors(v.vendors);
      setServices(s.services);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openManage(vendor) {
    setManaging(vendor);
    // fetch this vendor's current services via super-admin scope
    try {
      const res = await fetch(`/api/vendors/me/services?vendorId=${vendor.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('vowflo_token')}` }
      });
      const data = await res.json();
      const map = {};
      (data.services || []).forEach(s => { map[s.id] = s.enabled; });
      setVendorServices(map);
    } catch { setVendorServices({}); }
  }

  async function toggle(serviceId) {
    const next = !vendorServices[serviceId];
    setVendorServices(m => ({ ...m, [serviceId]: next }));
    try {
      await api.toggleService(managing.id, serviceId, next);
    } catch (err) {
      setError(err.message);
      setVendorServices(m => ({ ...m, [serviceId]: !next })); // revert
    }
  }

  function handleLogout() { clearSession(); onLogout(); }

  const trials = vendors.filter(v => v.status === 'trial').length;
  const active = vendors.filter(v => v.status === 'active').length;

  return (
    <div className="dash">
      <aside className="sidebar">
        <div className="brand">⬡ VOWFLO<small>SUPER</small></div>
        <div className="nav-item active">📊 Dashboard</div>
        <div className="nav-item">🏢 Vendors</div>
        <div className="nav-item">🧩 Services</div>
        <div className="logout" onClick={handleLogout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Dashboard</h1>
            <div className="sub">Welcome back, {user?.name} 👋</div>
          </div>
          <button className="refresh" onClick={load}>🔄 Refresh</button>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {loading ? <div className="loading">Loading…</div> : (
          <>
            <div className="stats">
              <div className="card"><div className="label">Total Vendors</div><div className="value">{vendors.length}</div></div>
              <div className="card"><div className="label">Active</div><div className="value">{active}</div></div>
              <div className="card"><div className="label">Trials</div><div className="value">{trials}</div></div>
              <div className="card"><div className="label">Services</div><div className="value">{services.length}</div></div>
            </div>

            <h2>Vendors</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Business</th><th>Plan</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {vendors.length === 0 ? (
                    <tr><td colSpan="4" className="empty">No vendors yet.</td></tr>
                  ) : vendors.map(v => (
                    <tr key={v.id}>
                      <td className="biz">{v.business_name}</td>
                      <td>{v.plan}</td>
                      <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                      <td><button className="manage-btn" onClick={() => openManage(v)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {managing && (
        <>
          <div className="drawer-overlay" onClick={() => setManaging(null)} />
          <div className="drawer">
            <div className="drawer-close" onClick={() => setManaging(null)}>✕</div>
            <h2>{managing.business_name}</h2>
            <div className="drawer-sub">Enable or disable services</div>
            <div className="toggle-list">
              {services.map(s => (
                <div key={s.id} className="toggle-row">
                  <span>{s.icon} {s.name}</span>
                  <div className={`switch ${vendorServices[s.id] ? 'on' : ''}`} onClick={() => toggle(s.id)} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
