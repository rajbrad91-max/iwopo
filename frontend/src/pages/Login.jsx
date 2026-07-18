import { useState } from 'react';
import { api, setSession } from '../lib/api';

export default function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      setSession(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        {onBack && <div className="login-back" onClick={onBack}>← Back</div>}
        <div className="login-brand"><img src="/iwopo-logo.png" alt="iwopo" className="login-brand-img" /></div>
        <h1>Sign in</h1>
        <p className="login-sub">Vendors & admins</p>

        <label>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} />

        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="Enter your password" />

        {error && <div className="login-error">⚠️ {error}</div>}

        <button className="login-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
