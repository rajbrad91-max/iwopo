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
        <div className={`nav-item ${tab==='bookings'?'active':''}`} onClick={() => setTab('bookings')}>📅 Bookings</div>
        <div className={`nav-item ${tab==='packages'?'active':''}`} onClick={() => setTab('packages')}>📦 My Packages</div>
        <div className={`nav-item ${tab==='inqform'?'active':''}`} onClick={() => setTab('inqform')}>🎨 Inquiry Form</div>
        <div className={`nav-item ${tab==='services'?'active':''}`} onClick={() => setTab('services')}>🧩 My Services</div>
        <div className={`nav-item ${tab==='refer'?'active':''}`} onClick={() => setTab('refer')}>👥 Refer a Friend</div>
        <div className={`nav-item ${tab==='settings'?'active':''}`} onClick={() => setTab('settings')}>⚙️ Settings</div>
        <div className="logout" onClick={handleLogout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tab === 'dashboard' ? 'Dashboard' : tab === 'refer' ? 'Refer a Friend' : tab === 'leads' ? 'Leads' : tab === 'settings' ? 'Settings' : tab === 'packages' ? 'My Packages' : tab === 'bookings' ? 'Bookings' : tab === 'inqform' ? 'Inquiry Form' : 'My Services'}</h1>
            <div className="sub">Welcome back, {user?.name} 👋</div>
          </div>
          <button className="refresh" onClick={load}>🔄 Refresh</button>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {loading ? <div className="loading">Loading…</div> : tab === 'refer' ? (
          <ReferForm user={user} />
        ) : tab === 'leads' ? (
          <LeadsView />
        ) : tab === 'bookings' ? (
          <BookingsView />
        ) : tab === 'inqform' ? (
          <InqFormSettings user={user} />
        ) : tab === 'packages' ? (
          <PackagesView />
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

  if (sel) return <LeadDetail lead={sel} onBack={() => { setSel(null); load(); }} />;

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
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ ...lead });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkgs, setPkgs] = useState([]);
  const [pkgId, setPkgId] = useState(lead.package_id || '');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

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

  function calcHours(from, to) {
    if (!from || !to) return f.hours || '';
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 1440;
    return (mins / 60).toFixed(1).replace(/\.0$/, '');
  }
  function setTime(k, v) {
    setF(s => {
      const n = { ...s, [k]: v };
      n.hours = calcHours(k === 'timing_from' ? v : s.timing_from, k === 'timing_to' ? v : s.timing_to);
      return n;
    });
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.updateLead(lead.id, {
        ...f, hours: f.hours ? Number(f.hours) : null, guests: f.guests ? Number(f.guests) : null,
      });
      setMsg('✅ Saved'); setEdit(false);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  const yn = (v) => v ? '✅ Yes' : '❌ No';
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 9, width: '100%' };
  const row = (label, value) => (
    <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #223238', fontSize: 14 }}>
      <div style={{ width: 180, color: '#7c9199', fontWeight: 600 }}>{label}</div>
      <div>{value || '—'}</div>
    </div>
  );
  const eRow = (label, k, type) => (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #223238' }}>
      <label style={{ fontSize: 12, color: '#7c9199', fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
      <input style={box} type={type || 'text'} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} />
    </div>
  );

  // ---- EDIT MODE ----
  if (edit) return (
    <div className="table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <button className="refresh" onClick={() => setEdit(false)} style={{ marginBottom: 16 }}>← Cancel</button>
      <h2 style={{ marginTop: 0 }}>✏️ Edit Lead</h2>
      {msg && <div style={{ padding: 10, borderRadius: 8, margin: '0 0 12px', fontSize: 13, background: '#fb718518', color: '#fb7185' }}>{msg}</div>}

      {eRow('👤 Name', 'name')}
      {eRow('📧 Email', 'email')}
      {eRow('📞 Phone', 'phone')}
      {eRow('🎉 Event type', 'event_type')}
      {eRow('📅 Date', 'event_date', 'date')}
      <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #223238' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: '#7c9199', fontWeight: 600, display: 'block', marginBottom: 5 }}>⏰ Start</label>
          <input style={box} type="time" value={f.timing_from || ''} onChange={e => setTime('timing_from', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: '#7c9199', fontWeight: 600, display: 'block', marginBottom: 5 }}>⏰ End</label>
          <input style={box} type="time" value={f.timing_to || ''} onChange={e => setTime('timing_to', e.target.value)} />
        </div>
      </div>
      {row('⏱️ Hours (auto)', f.hours)}
      {eRow('📍 Location', 'location')}
      {eRow('👥 Guests', 'guests', 'number')}

      <div style={{ padding: '10px 0', borderBottom: '1px solid #223238' }}>
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.gr_bride} onChange={e => set('gr_bride', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2dd4bf' }} />
          💄 Bride — Getting Ready
        </label>
        {f.gr_bride && <input style={{ ...box, marginTop: 8 }} placeholder="Venue (optional)" value={f.gr_bride_venue || ''} onChange={e => set('gr_bride_venue', e.target.value)} />}
      </div>
      <div style={{ padding: '10px 0', borderBottom: '1px solid #223238' }}>
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.gr_groom} onChange={e => set('gr_groom', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2dd4bf' }} />
          😎 Groom — Getting Ready
        </label>
        {f.gr_groom && <input style={{ ...box, marginTop: 8 }} placeholder="Venue (optional)" value={f.gr_groom_venue || ''} onChange={e => set('gr_groom_venue', e.target.value)} />}
      </div>

      <div style={{ padding: '8px 0' }}>
        <label style={{ fontSize: 12, color: '#7c9199', fontWeight: 600, display: 'block', marginBottom: 5 }}>📝 Notes</label>
        <textarea style={{ ...box, minHeight: 70 }} value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
      </div>

      <button className="refresh" onClick={save} disabled={busy} style={{ marginTop: 14, width: '100%', background: '#2dd4bf', color: '#06231f' }}>
        {busy ? 'Saving…' : '💾 Save changes'}
      </button>
    </div>
  );

  // ---- VIEW MODE ----
  return (
    <div className="table-wrap" style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="refresh" onClick={onBack}>← Back to leads</button>
        <button className="refresh" onClick={() => { setF({ ...lead }); setEdit(true); }} style={{ background: '#2dd4bf', color: '#06231f' }}>✏️ Edit</button>
      </div>
      <h2 style={{ marginTop: 0 }}>{lead.name} · {lead.event_type}</h2>
      {msg && <div style={{ padding: 10, borderRadius: 8, margin: '0 0 12px', fontSize: 13, background: '#4ade8018', color: '#4ade80' }}>{msg}</div>}

      <div style={{ padding: '10px 0', borderBottom: '1px solid #223238', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 180, color: '#7c9199', fontWeight: 600, fontSize: 14 }}>📦 Package</div>
        <select value={pkgId} onChange={e => assignPkg(e.target.value)}
          style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 8, flex: 1 }}>
          <option value="">— No package —</option>
          {pkgs.map(p => <option key={p.id} value={p.id}>{p.tplName} → {p.name} (${Number(p.base_price).toFixed(0)})</option>)}
        </select>
      </div>

      {row('📧 Email', lead.email)}
      {row('📞 Phone', lead.phone)}
      {row('📅 Date', lead.event_date ? String(lead.event_date).slice(0,10) : null)}
      {row('⏰ Time', lead.timing_from ? `${lead.timing_from} – ${lead.timing_to || '?'}` : null)}
      {row('📍 Location', lead.location)}
      {row('👥 Guests', lead.guests)}
      {row('⏱️ Hours', lead.hours)}
      {row('💄 Bride Getting Ready', `${yn(lead.gr_bride)}${lead.gr_bride_venue ? ' · ' + lead.gr_bride_venue : ''}`)}
      {row('😎 Groom Getting Ready', `${yn(lead.gr_groom)}${lead.gr_groom_venue ? ' · ' + lead.gr_groom_venue : ''}`)}
      {row('📝 Notes', lead.notes)}

      <MoneySection lead={lead} />
      <EmailBox lead={lead} />
    </div>
  );
}

function EmailBox({ lead }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 9, width: '100%' };

  async function send() {
    if (!subject || !body) return setMsg('⚠️ Subject + message required');
    setBusy(true); setMsg('');
    try {
      const d = await api.emailLead(lead.id, subject, body);
      setMsg('✅ Sent to ' + d.sent_to); setSubject(''); setBody(''); setOpen(false);
    } catch (e) { setMsg('⚠️ ' + (e.message || 'Failed')); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <button className="refresh" onClick={() => setOpen(!open)}>
        {open ? '✕ Close' : `📧 Email ${lead.name || 'client'}`}
      </button>
      {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg[0] === '✅' ? '#4ade80' : '#fb7185' }}>{msg}</div>}
      {open && (
        <div style={{ marginTop: 10 }}>
          <input style={box} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          <textarea style={{ ...box, minHeight: 100, marginTop: 8 }} placeholder="Your message…" value={body} onChange={e => setBody(e.target.value)} />
          <button className="refresh" onClick={send} disabled={busy}
            style={{ marginTop: 8, background: '#2dd4bf', color: '#06231f' }}>
            {busy ? 'Sending…' : '📨 Send'}
          </button>
        </div>
      )}
    </div>
  );
}

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'completed', 'cancelled'];
const S_ICON = { new: '🆕', contacted: '📞', quoted: '💬', booked: '✅', completed: '🏁', cancelled: '❌' };

function MoneySection({ lead }) {
  const [data, setData] = useState(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('manual');
  const [money, setMoney] = useState({ deposit_percent: lead.deposit_percent ?? 30, discount_percent: lead.discount_percent ?? 0, price_override: lead.price_override ?? '' });
  const [status, setStatus] = useState(lead.status || 'new');
  const [msg, setMsg] = useState('');
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 8 };

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await api.leadPayments(lead.id); setData(d); } catch {}
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
  return (
    <div style={{ marginTop: 20 }}>
      {/* Status */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {STATUSES.map(s => (
          <button key={s} className="refresh" onClick={() => changeStatus(s)}
            style={{ padding: '5px 11px', fontSize: 12, background: status === s ? '#2dd4bf' : '#0d1417', color: status === s ? '#06231f' : '#e6f0f2' }}>
            {S_ICON[s]} {s}
          </button>
        ))}
      </div>
      {msg && <div style={{ fontSize: 13, color: msg[0] === '✅' ? '#4ade80' : '#fb7185', marginBottom: 10 }}>{msg}</div>}

      <h3 style={{ margin: '0 0 10px' }}>💰 Money</h3>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#7c9199' }}>Price override ($)</label>
          <input style={{ ...box, width: '100%' }} type="number" placeholder="auto from package"
            value={money.price_override} onChange={e => setMoney({ ...money, price_override: e.target.value })} onBlur={saveMoney} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#7c9199' }}>Discount %</label>
          <input style={{ ...box, width: '100%' }} type="number"
            value={money.discount_percent} onChange={e => setMoney({ ...money, discount_percent: e.target.value })} onBlur={saveMoney} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#7c9199' }}>Deposit %</label>
          <input style={{ ...box, width: '100%' }} type="number"
            value={money.deposit_percent} onChange={e => setMoney({ ...money, deposit_percent: e.target.value })} onBlur={saveMoney} />
        </div>
      </div>

      {sum && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
          <span style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 8, padding: '7px 12px' }}>💵 Total: <b>${sum.final_total}</b>{sum.discount_amount > 0 && <s style={{ color: '#7c9199', marginLeft: 6 }}>${sum.base_total}</s>}</span>
          <span style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 8, padding: '7px 12px' }}>🔐 Deposit: <b>${sum.deposit_amount}</b></span>
          <span style={{ background: '#4ade8018', border: '1px solid #4ade8044', borderRadius: 8, padding: '7px 12px', color: '#4ade80' }}>✅ Paid: <b>${sum.paid}</b></span>
          <span style={{ background: sum.balance > 0 ? '#fbbf2418' : '#4ade8018', border: '1px solid #fbbf2444', borderRadius: 8, padding: '7px 12px', color: sum.balance > 0 ? '#fbbf24' : '#4ade80' }}>⏳ Balance: <b>${sum.balance}</b></span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={{ ...box, flex: 1 }} type="number" placeholder="Amount $" value={amt} onChange={e => setAmt(e.target.value)} />
        <select style={box} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="manual">Manual</option><option value="etransfer">E-transfer</option>
          <option value="cash">Cash</option><option value="card">Card</option>
        </select>
        <button className="refresh" onClick={pay} style={{ background: '#2dd4bf', color: '#06231f' }}>+ Record payment</button>
      </div>

      {data?.payments?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.payments.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1417', border: '1px solid #223238', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              <span>💵 ${Number(p.amount).toFixed(2)} · {p.method} · {String(p.paid_at).slice(0, 10)}</span>
              <span style={{ cursor: 'pointer' }} onClick={() => delPay(p.id)}>🗑️</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingsView() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Loading…</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Event</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
        <tbody>
          {bookings.length === 0 ? (
            <tr><td colSpan="6" className="empty">No bookings yet. Set a lead's status to ✅ booked!</td></tr>
          ) : bookings.map(b => (
            <tr key={b.id}>
              <td className="biz">{b.name}</td>
              <td>{b.event_type}</td>
              <td>{b.event_date ? String(b.event_date).slice(0, 10) : '—'}</td>
              <td>${b.money?.final_total ?? 0}</td>
              <td style={{ color: '#4ade80' }}>${b.money?.paid ?? 0}</td>
              <td style={{ color: b.money?.balance > 0 ? '#fbbf24' : '#4ade80' }}>${b.money?.balance ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InqFormSettings({ user }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 9, width: '100%' };

  useEffect(() => {
    api.inquirySettings(user?.vendor_id).then(d => setS(d.settings)).catch(() => {});
  }, []);

  async function save() {
    setMsg('');
    try { await api.saveInquirySettings(s); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  const toggle = (k) => setS(prev => ({ ...prev, [k]: !prev[k] }));

  if (!s) return <div className="loading">Loading…</div>;

  const toggles = [
    ['show_phone', '📞 Phone'], ['show_guests', '👥 Guests'], ['show_times', '⏰ Times'],
    ['show_location', '📍 Location'], ['show_getting_ready', '💄 Getting Ready'], ['show_notes', '📝 Notes'],
  ];

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="table-wrap" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>🎨 Customize your inquiry form {msg && <span style={{ fontSize: 13, color: '#4ade80' }}>{msg}</span>}</h2>
        <p className="sub" style={{ marginBottom: 14 }}>Your link: <b style={{ color: '#2dd4bf' }}>alphabetaone.com/inquiry/{user?.vendor_id}</b> 🔗</p>

        <label style={{ fontSize: 12, color: '#7c9199' }}>Brand name</label>
        <input style={box} value={s.brand_name || ''} onChange={e => setS({ ...s, brand_name: e.target.value })} />

        <label style={{ fontSize: 12, color: '#7c9199', display: 'block', marginTop: 12 }}>Brand color</label>
        <input type="color" value={s.brand_color} onChange={e => setS({ ...s, brand_color: e.target.value })}
          style={{ width: 60, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }} />

        <label style={{ fontSize: 12, color: '#7c9199', display: 'block', marginTop: 12 }}>Intro text</label>
        <input style={box} value={s.intro_text || ''} onChange={e => setS({ ...s, intro_text: e.target.value })} />

        <label style={{ fontSize: 12, color: '#7c9199', display: 'block', marginTop: 14 }}>Fields to show</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {toggles.map(([k, label]) => (
            <button key={k} className="refresh" onClick={() => toggle(k)}
              style={{ padding: '6px 12px', fontSize: 12, background: s[k] ? '#2dd4bf' : '#0d1417', color: s[k] ? '#06231f' : '#7c9199' }}>
              {label} {s[k] ? '✓' : '✕'}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, color: '#7c9199', display: 'block', marginTop: 14 }}>Event types (comma separated)</label>
        <input style={box} value={(s.event_types || []).join(', ')}
          onChange={e => setS({ ...s, event_types: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />

        <button className="refresh" onClick={save} style={{ marginTop: 16, width: '100%', background: '#2dd4bf', color: '#06231f' }}>💾 Save form settings</button>
      </div>
    </div>
  );
}

function PackagesView() {
  const [tpls, setTpls] = useState([]);
  const [selTpl, setSelTpl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 9 };

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
        {selTpl.packages.length === 0 && <div style={{ color: '#7c9199' }}>No packages yet — add one 👆</div>}
        {selTpl.packages.map(p => <PkgCard key={p.id} pkg={p} onSaved={load} onDelete={() => delPkg(p.id)} />)}
      </div>
    </div>
  );

  // ---- TEMPLATE LIST ----
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: '#7c9199', fontSize: 13 }}>📁 Up to 6 event templates · 📦 3 packages each</div>
        {tpls.length < 6 && <button className="refresh" onClick={addTpl} style={{ background: '#2dd4bf', color: '#06231f' }}>+ Add Template</button>}
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {tpls.map(t => (
          <div key={t.id} className="table-wrap" style={{ padding: 18, cursor: 'pointer', position: 'relative' }} onClick={() => setSelTpl(t)}>
            <div style={{ fontSize: 30 }}>📁</div>
            <TplName tpl={t} onSaved={load} />
            <div style={{ color: '#7c9199', fontSize: 12, marginTop: 4 }}>📦 {t.packages.length}/3 packages</div>
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
      style={{ background: 'transparent', border: 'none', color: '#e6f0f2', fontWeight: 700, fontSize: 15, width: '100%', marginTop: 6, outline: 'none' }} />
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
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 9, width: '100%' };

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
          <label style={{ fontSize: 12, color: '#7c9199' }}>💰 Base price ($)</label>
          <input style={box} type="number" value={f.base_price} onChange={e => set('base_price', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: '#7c9199' }}>⏱️ Included hours</label>
          <input style={box} type="number" value={f.included_hours} onChange={e => set('included_hours', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: '#7c9199' }}>➕ Extra $/hour</label>
          <input style={box} type="number" value={f.per_hour_price} onChange={e => set('per_hour_price', e.target.value)} />
        </div>
      </div>

      <label style={{ fontSize: 12, color: '#7c9199', display: 'block', marginTop: 12 }}>📝 Inclusions (your own items)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
        {f.inclusions.map((inc, i) => (
          <span key={i} style={{ background: '#2dd4bf18', border: '1px solid #2dd4bf44', color: '#2dd4bf', padding: '4px 10px', borderRadius: 16, fontSize: 12 }}>
            {inc} <span style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => rmInc(i)}>✕</span>
          </span>
        ))}
        {f.inclusions.length === 0 && <span style={{ color: '#7c9199', fontSize: 12 }}>No items yet — add below 👇</span>}
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

      <EmailSetup />
    </div>
  );
}

function EmailSetup() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const box = { background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2', padding: 10, width: '100%', marginTop: 6 };

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
            style={{ textAlign: 'left', background: s.mode === m ? '#2dd4bf' : '#0d1417', color: s.mode === m ? '#06231f' : '#e6f0f2' }}>
            {label}
          </button>
        ))}
      </div>

      {s.mode === 'smtp' && (
        <div style={{ marginTop: 12 }}>
          <input style={box} placeholder="SMTP host (e.g. smtp.gmail.com)" value={s.smtp_host || ''} onChange={e => setS({ ...s, smtp_host: e.target.value })} />
          <input style={box} type="number" placeholder="Port (587)" value={s.smtp_port || 587} onChange={e => setS({ ...s, smtp_port: Number(e.target.value) })} />
          <input style={box} placeholder="SMTP username" value={s.smtp_user || ''} onChange={e => setS({ ...s, smtp_user: e.target.value })} />
          <input style={box} type="password" placeholder="SMTP password" value={s.smtp_pass || ''} onChange={e => setS({ ...s, smtp_pass: e.target.value })} />
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
        style={{ width: '100%', padding: 10, margin: '6px 0 12px', background: '#0d1417', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
      {err && <div className="err-banner">⚠️ {err}</div>}
      {msg && <div style={{ background: '#4ade8018', color: '#4ade80', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      <button className="refresh" onClick={send} disabled={busy} style={{ width: '100%' }}>
        {busy ? 'Sending…' : '📨 Send Invite'}
      </button>
    </div>
  );
}
