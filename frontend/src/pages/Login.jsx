import { useState } from 'react';
import { api, setSession } from '../lib/api';
import PasswordInput from '../components/PasswordInput';

export default function Login({ onLogin, onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      setSession(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message === 'Invalid credentials'
        ? 'That email or password is not right.'
        : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    setError(''); setNotice('');
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    try {
      const r = await api.forgotPassword(email);
      setNotice(r.message || 'If that email exists, a reset link is on its way. 📬');
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

        {mode === 'login' ? (
          <>
            <h1>Sign in</h1>
            <p className="login-sub">Vendors &amp; admins</p>

            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />

            <label>Password</label>
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="Enter your password" />

            {error && <div className="login-error">⚠️ {error}</div>}

            <button className="login-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="login-forgot-row">
              <span className="login-forgot-link" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}>
                Forgot password?
              </span>
            </div>
          </>
        ) : (
          <>
            <h1>Reset password</h1>
            <p className="login-sub">We'll email you a reset link</p>

            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleForgot()} placeholder="you@studio.com" />

            {error && <div className="login-error">⚠️ {error}</div>}
            {notice && <div className="login-notice">✅ {notice}</div>}

            <button className="login-btn" onClick={handleForgot} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <div className="login-forgot-row">
              <span className="login-forgot-link" onClick={() => { setMode('login'); setError(''); setNotice(''); }}>
                ← Back to sign in
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
