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
        <div className={`nav-item ${tab==='leads'?'active':''}`} onClick={() => setTab('leads')}>📋 Leads</div>
        <div className={`nav-item ${tab==='services'?'active':''}`} onClick={() => setTab('services')}>🧩 My Services</div>
        <div className={`nav-item ${tab==='refer'?'active':''}`} onClick={() => setTab('refer')}>👥 Refer a Friend</div>
        <div className={`nav-item ${tab==='settings'?'active':''}`} onClick={() => setTab('settings')}>⚙️ Settings</div>
        <div className="logout" onClick={handleLogout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tab === 'dashboard' ? 'Dashboard' : tab === 'refer' ? 'Refer a Friend' : tab === 'leads' ? 'Leads' : tab === 'settings' ? 'Settings' : 'My Services'}</h1>
            <div className="sub">Welcome back, {user?.name} 👋</div>
          </div>
          <button className="refresh" onClick={load}>🔄 Refresh</button>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {loading ? <div className="loading">Loading…</div> : tab === 'refer' ? (
          <ReferForm user={user} />
        ) : tab === 'leads' ? (
          <LeadsView />
        ) : tab === 'settings' ? (
          <SettingsView user={user} />
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

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const d = await api.leads(); setLeads(d.leads || []); } catch {}
    finally { setLoading(false); }
  }

  if (sel) return <LeadDetail lead={sel} onBack={() => setSel(null)} />;

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Event</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="4" className="empty">Loading…</td></tr>
          ) : leads.length === 0 ? (
            <tr><td colSpan="4" className="empty">No leads yet. Share your inquiry link! 📨</td></tr>
          ) : leads.map(l => (
            <tr key={l.id} onClick={() => setSel(l)} style={{ cursor: 'pointer' }}>
              <td className="biz">{l.name}</td>
              <td>{l.event_type}</td>
              <td>{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
              <td><span className="badge trial">{l.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetail({ lead, onBack }) {
  const yn = (v) => v ? '✅ Yes' : '❌ No';
  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #223238', fontSize: 14 }}>
      <div style={{ width: 180, color: '#7c9199', fontWeight: 600 }}>{label}</div>
      <div>{value || '—'}</div>
    </div>
  );
  return (
    <div className="table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <button className="refresh" onClick={onBack} style={{ marginBottom: 16 }}>← Back to leads</button>
      <h2 style={{ marginTop: 0 }}>{lead.name} · {lead.event_type}</h2>

      <Row label="📧 Email" value={lead.email} />
      <Row label="📞 Phone" value={lead.phone} />
      <Row label="📅 Date" value={lead.event_date ? String(lead.event_date).slice(0,10) : null} />
      <Row label="⏰ Time" value={lead.timing_from ? `${lead.timing_from} – ${lead.timing_to || '?'}` : null} />
      <Row label="📍 Location" value={lead.location} />
      <Row label="👥 Guests" value={lead.guests} />
      <Row label="⏱️ Hours" value={lead.hours} />
      <Row label="💄 Bride Getting Ready" value={`${yn(lead.gr_bride)}${lead.gr_bride_venue ? ' · ' + lead.gr_bride_venue : ''}`} />
      <Row label="😎 Groom Getting Ready" value={`${yn(lead.gr_groom)}${lead.gr_groom_venue ? ' · ' + lead.gr_groom_venue : ''}`} />
      <Row label="📝 Notes" value={lead.notes} />
    </div>
  );
}

function SettingsView({ user }) {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState('');
  const [em, setEm] = useState({ email: user?.email || '', password: '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.mySettings().then(d => {
      setS(d.settings || { time_format: '12h', theme: 'dark', timezone: guessTz() });
    }).catch(() => setS({ time_format: '12h', theme: 'dark', timezone: guessTz() }));
  }, []);
  function guessTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Vancouver'; } }

  async function savePrefs(next) {
    setS(next); setSaved('');
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
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 10, width: '100%', marginTop: 6 };

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Preferences */}
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🕐 Preferences {saved && <span style={{ fontSize: 13, color: '#4ade80' }}>{saved}</span>}</h2>

        <label style={{ fontSize: 13, color: '#9fb3b0' }}>Time format</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {['12h', '24h'].map(t => (
            <button key={t} onClick={() => savePrefs({ ...s, time_format: t })}
              className="refresh" style={{ flex: 1, background: s.time_format === t ? '#2dd4bf' : '#0d1417', color: s.time_format === t ? '#06231f' : '#e6f0f2' }}>
              {t === '12h' ? '12-hour (2:30 PM)' : '24-hour (14:30)'}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 14 }}>Theme</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {['dark', 'light'].map(t => (
            <button key={t} onClick={() => savePrefs({ ...s, theme: t })}
              className="refresh" style={{ flex: 1, background: s.theme === t ? '#2dd4bf' : '#0d1417', color: s.theme === t ? '#06231f' : '#e6f0f2' }}>
              {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 13, color: '#9fb3b0', display: 'block', marginTop: 14 }}>Timezone</label>
        <input style={box} value={s.timezone || ''} onChange={e => setS({ ...s, timezone: e.target.value })}
          onBlur={() => savePrefs(s)} />
        <div style={{ fontSize: 11, color: '#7c9199', marginTop: 4 }}>🌍 Auto-detected from your location</div>
      </div>

      {/* Account */}
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🔐 Account</h2>
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
