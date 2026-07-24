import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './inquiry.css';
import './portal.css';

/**
 * 🌐 The client's view of their booking.
 *
 * Runs as three steps, the same order PerfectPoses uses:
 *   1. choose a package
 *   2. read and sign the contract
 *   3. arrange payment
 *
 * Each step unlocks the next, so a client can't be asked to pay for something
 * they haven't agreed to. Where the vendor hasn't raised a contract, step 2 is
 * skipped rather than blocking the client.
 */
export default function ClientPortal({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, [token]);
  function load() {
    api.portal(token).then(setData).catch(e => setErr(e.message));
  }

  async function pick(id) {
    setBusy(true); setMsg('');
    try { await api.portalPick(token, id); setMsg('✅ Package selected'); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function officeVisit() {
    setBusy(true);
    try { await api.portalOfficeVisit(token); setMsg('🏢 Request sent — we\'ll be in touch to arrange payment'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  if (err) return <div className="iq-wrap"><div className="iq-card">⚠️ {err}</div></div>;
  if (!data) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;

  const { lead, business_name, packages, money, contract } = data;
  const chosen = packages.find(p => p.id === lead.package_id);
  const signed = !!contract?.signed_at;
  // step 2 only exists once the vendor has raised a contract
  const needsSigning = !!contract && !signed;

  return (
    <div className="iq-wrap">
      <div className="iq-card po-card">
        <div className="iq-brand"><img src="/logo_icon.png" alt="" className="iq-brand-img" /> {business_name}</div>
        <p className="iq-sub">
          Hi {lead.name} 👋 — your {lead.event_type}
          {lead.event_date ? ` on ${String(lead.event_date).slice(0, 10)}` : ''}
        </p>

        {/* where they are in the journey */}
        <ol className="po-steps">
          <li className={chosen ? 'is-done' : 'is-now'}>📦 Choose</li>
          <li className={signed ? 'is-done' : (chosen && needsSigning ? 'is-now' : '')}>📄 Sign</li>
          <li className={chosen && (signed || !contract) ? 'is-now' : ''}>💳 Pay</li>
        </ol>

        {msg && <div className={`po-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

        {/* ── 1. packages ── */}
        <h3 className="po-h">📦 {chosen ? 'Your package' : 'Choose your package'}</h3>
        <div className="po-grid">
          {packages.map(p => {
            const isChosen = lead.package_id === p.id;
            const inc = Array.isArray(p.inclusions) ? p.inclusions : [];
            return (
              <button key={p.id} type="button" disabled={busy}
                className={`po-pkg ${isChosen ? 'is-chosen' : ''}`}
                onClick={() => !busy && pick(p.id)}>
                <div className="po-pkg-name">{isChosen ? '✅ ' : ''}{p.name}</div>
                <div className="po-pkg-price">${Number(p.base_price).toFixed(0)}</div>
                {inc.map((x, i) => <div key={i} className="po-pkg-inc">✓ {x}</div>)}
              </button>
            );
          })}
        </div>

        {/* ── 2. contract ── */}
        {chosen && contract && (
          <>
            <h3 className="po-h">📄 {signed ? 'Your contract' : 'Review your contract'}</h3>
            {signed ? (
              <div className="po-signed">
                ✅ Signed by <b>{contract.signed_name}</b> on {String(contract.signed_at).slice(0, 10)}
                <a className="po-link" href={`/sign/${contract.token}`}>View contract</a>
              </div>
            ) : (
              <>
                <p className="po-note">Please read and sign before we confirm your booking.</p>
                <a className="iq-btn po-btn" href={`/sign/${contract.token}`}>📄 Read &amp; sign the contract</a>
              </>
            )}
          </>
        )}

        {/* ── 3. payment — only once there's nothing left to sign ── */}
        {chosen && !needsSigning && (
          <>
            <h3 className="po-h">💰 Your balance</h3>
            <div className="po-money">
              <span className="po-chip">💵 Total <b>${money.final_total}</b></span>
              <span className="po-chip">🔐 Deposit <b>${money.deposit_amount}</b></span>
              <span className="po-chip is-paid">✅ Paid <b>${money.paid}</b></span>
              <span className="po-chip is-due">⏳ Due <b>${money.balance}</b></span>
            </div>
            <button className="iq-btn po-btn" onClick={officeVisit} disabled={busy}>
              🏢 Arrange payment with us
            </button>
            <p className="po-note po-center">We&apos;ll reach out to arrange e-transfer or in-person payment 💳</p>
          </>
        )}

        {/* nudge them to the step they're actually on */}
        {chosen && needsSigning && (
          <p className="po-note po-center">💡 Payment options appear once your contract is signed.</p>
        )}
      </div>
    </div>
  );
}
