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
        <div className={`nav-item ${tab==='refer'?'active':''}`} onClick={() => setTab('refer')}>👥 Refer a Friend</div>
        <div className="logout" onClick={handleLogout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tab === 'dashboard' ? 'Dashboard' : tab === 'refer' ? 'Refer a Friend' : 'My Services'}</h1>
            <div className="sub">Welcome back, {user?.name} 👋</div>
          </div>
          <button className="refresh" onClick={load}>🔄 Refresh</button>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {loading ? <div className="loading">Loading…</div> : tab === 'refer' ? (
          <ReferForm user={user} />
        ) : tab === 'dashboard' ? (
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
        style={{ width: '100%', padding: 10, margin: '6px 0 12px', background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
      {err && <div className="err-banner">⚠️ {err}</div>}
      {msg && <div style={{ background: '#4ade8018', color: '#4ade80', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      <button className="refresh" onClick={send} disabled={busy} style={{ width: '100%' }}>
        {busy ? 'Sending…' : '📨 Send Invite'}
      </button>
    </div>
  );
}
