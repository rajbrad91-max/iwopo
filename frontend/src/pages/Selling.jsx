import { useState, useEffect } from 'react';
import { api, setSession } from '../lib/api';

export default function Selling({ onSignup, onGoLogin }) {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.services().then(d => setServices(d.services)).catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSignup() {
    setError('');
    if (!form.businessName || !form.email || !form.password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api.signup(form.businessName, form.email, form.password);
      setSession(token, user);
      onSignup(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sell">
      <nav className="sell-nav">
        <div className="sell-logo">⬡ Vowflo</div>
        <button className="sell-login-link" onClick={onGoLogin}>Log in</button>
      </nav>

      <section className="sell-hero">
        <h1>Run your wedding business<br/>in one place.</h1>
        <p>Galleries, bookings, contracts, payments — pick what you need.</p>
      </section>

      <section className="sell-services">
        <h2>Services</h2>
        <div className="sell-grid">
          {services.map(s => (
            <div key={s.id} className="sell-card">
              <div className="sell-icon">{s.icon}</div>
              <div className="sell-name">{s.name}</div>
              <div className="sell-price">${s.price}/mo</div>
            </div>
          ))}
        </div>
      </section>

      <section className="sell-signup" id="signup">
        <div className="signup-box">
          <h2>Start your free trial</h2>
          <label>Business name</label>
          <input value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Sunny Studios" />
          <label>Email</label>
          <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@business.com" />
          <label>Password</label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSignup()} />
          {error && <div className="sell-error">⚠️ {error}</div>}
          <button className="sell-btn" onClick={handleSignup} disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </section>
    </div>
  );
}
