import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 💳 "Connect your Stripe account" (Raj, 2026-11-06). The vendor signs in to their OWN Stripe; clients then pay by card
 * from the portal and the money goes straight to them — iwopo never holds it. No link to Stripe's sign-up: a vendor
 * without an account makes one on Stripe's own website first.
 */
export default function StripeConnectCard() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const back = new URLSearchParams(window.location.search).get('stripe');
  const [msg, setMsg] = useState(back === 'connected' ? '✅ Your Stripe account is connected.' : back === 'error' ? '⚠️ Stripe could not connect — please try again.' : '');
  const load = () => api.stripeConnectStatus().then(setS).catch(() => setS({ ready: false }));
  useEffect(() => { load(); if (back) window.history.replaceState(null, '', window.location.pathname); }, [back]);

  async function connect() {
    setBusy(true); setMsg('');
    try { const r = await api.stripeConnectStart(); window.location.href = r.url; }
    catch (e) { setMsg('⚠️ ' + e.message); setBusy(false); }
  }
  async function off() {
    if (!window.confirm('Disconnect your Stripe account? Clients will no longer be able to pay you by card here.')) return;
    setBusy(true);
    try { await api.stripeConnectDisconnect(); await load(); setMsg('Your Stripe account is disconnected.'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  if (!s) return null;
  return (
    <section className="scx">
      <h4 className="scx-h">💳 Card payments</h4>
      {!s.ready
        ? <p className="scx-p">Card payments through your own Stripe account are coming soon.</p>
        : s.connected
          ? <>
              <p className="scx-p">✅ <b>Stripe connected</b> ({s.account}). Your clients can pay by card from their portal — the money goes straight to your Stripe account.</p>
              <button type="button" className="svx-remove" disabled={busy} onClick={off}>Disconnect</button>
            </>
          : <>
              <p className="scx-p">Let clients pay their deposit and balance by card. Payments go straight to your own Stripe account.</p>
              <button type="button" className="svx-change" disabled={busy} onClick={connect}>{busy ? 'Opening Stripe…' : 'Connect your Stripe account'}</button>
              <p className="scx-note">Don&apos;t have a Stripe account yet? Create one on Stripe&apos;s official website first, then come back here and connect it.</p>
            </>}
      {msg && <p className="scx-msg">{msg}</p>}
    </section>
  );
}
