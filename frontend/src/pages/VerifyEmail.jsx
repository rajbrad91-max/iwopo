import { setSession } from '../lib/api';
import VerifyCode from '../components/VerifyCode';
import { api } from '../lib/api';

/**
 * ✉️ /verify?email=…&code=… — the page the "Confirm my email" button in the sign-up email opens (Raj, 2026-10-23).
 * The code is filled in and checked straight away; on success the new vendor is signed in and lands in the panel.
 * Without a link it still works: type the email's 6-digit code.
 */
export default function VerifyEmail() {
  const q = new URLSearchParams(window.location.search);
  const email = (q.get('email') || '').trim();
  const code = (q.get('code') || '').replace(/\D/g, '').slice(0, 6);
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand"><img src="/iwopo-logo.png" alt="iwopo" className="login-brand-img" /></div>
        {email ? (
          <VerifyCode email={email} initialCode={code}
            onVerified={async ({ token, user, pay_next }) => {
              setSession(token, user);
              // 💳 confirmed from the email's button: a plan chosen at sign-up goes straight to payment
              if (pay_next) { try { const r = await api.billingCheckout(); if (r?.url) { window.location.replace(r.url); return; } } catch { /* the panel offers it */ } }
              window.location.replace('/panel');
            }}
            onBack={() => window.location.assign('/')} />
        ) : (
          <>
            <h1>Confirm your email ✉️</h1>
            <p className="login-sub">Open the link in the email we sent you, or sign in and enter the 6-digit code.</p>
            <button className="login-btn" onClick={() => window.location.assign('/')}>Go to sign in</button>
          </>
        )}
      </div>
    </div>
  );
}
