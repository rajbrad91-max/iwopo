import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './inquiry.css';
import './portal.css';

/**
 * 🌐 The client's view of their booking.
 *
 * Three steps, in the order PerfectPoses uses:
 *   1. choose a package
 *   2. read and sign the contract
 *   3. arrange payment
 *
 * Each step unlocks the next, so a client is never asked to pay for something
 * they haven't agreed to. If the vendor hasn't raised a contract, step 2 is
 * skipped rather than blocking them.
 *
 * Styling follows the vendor's inquiry-form branding — colour, theme and font —
 * so a client sees one business throughout, not a form in one skin and a
 * booking page in another.
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

  const { lead, business_name, packages, money, contract, branding = {} } = data;
  const chosen = packages.find(p => p.id === lead.package_id);
  const signed = !!contract?.signed_at;
  const needsSigning = !!contract && !signed;
  const canPay = !!chosen && !needsSigning;

  const brand = branding.brand_color || '#C9A86A';
  const font = branding.font || 'Inter';

  // which step the client is on now — drives the progress strip
  const step = !chosen ? 1 : (needsSigning ? 2 : 3);

  return (
    <div className="iq-wrap" style={{ fontFamily: `'${font}', sans-serif`, '--brand': brand }}>
      <div className={`iq-card po-card iq-theme-${branding.theme || 'classic'}`}>

        <header className="po-top">
          {branding.logo_path
            ? <img className="po-logo" src={`/api/me/logo/${branding.logo_path}`} alt="" />
            : <div className="po-logo po-logo-fallback">{(business_name || '?')[0]}</div>}
          <div>
            <h1 className="po-biz">{business_name}</h1>
            <p className="po-hi">
              Hi {lead.name} — your {lead.event_type}
              {lead.event_date ? ` on ${new Date(lead.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            </p>
          </div>
        </header>

        <ol className="po-steps">
          {[[1, '📦', 'Choose'], [2, '📄', 'Sign'], [3, '💳', 'Pay']].map(([n, icon, label]) => (
            <li key={n} className={step > n ? 'is-done' : step === n ? 'is-now' : ''}>
              <span className="po-step-n">{step > n ? '✓' : icon}</span>
              <span className="po-step-l">{label}</span>
            </li>
          ))}
        </ol>

        {msg && <div className={`po-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

        {/* ── 1. packages ── */}
        <section className="po-sec">
          <h2 className="po-h">{chosen ? 'Your package' : 'Choose your package'}</h2>
          {!chosen && <p className="po-lead">Tap the one you&apos;d like — you can change your mind before paying.</p>}
          <div className="po-grid">
            {packages.map(p => {
              const isChosen = lead.package_id === p.id;
              const inc = Array.isArray(p.inclusions) ? p.inclusions : [];
              return (
                <button key={p.id} type="button" disabled={busy}
                  className={`po-pkg ${isChosen ? 'is-chosen' : ''}`}
                  onClick={() => !busy && pick(p.id)}>
                  {isChosen && <span className="po-pkg-tick">✓ Selected</span>}
                  <h3 className="po-pkg-name">{p.name}</h3>
                  <p className="po-pkg-price">${Number(p.base_price).toLocaleString()}</p>
                  <ul className="po-pkg-inc">
                    {inc.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 2. contract ── */}
        {chosen && contract && (
          <section className="po-sec">
            <h2 className="po-h">Your contract</h2>
            {signed ? (
              <div className="po-done-box">
                <strong>✅ Signed</strong>
                <span>by {contract.signed_name} on {new Date(contract.signed_at).toLocaleDateString()}</span>
                <a className="po-link" href={`/sign/${contract.token}`}>View a copy</a>
              </div>
            ) : (
              <>
                <p className="po-lead">Please read it through and sign to confirm your booking.</p>
                <a className="po-cta" href={`/sign/${contract.token}`}>📄 Read &amp; sign</a>
              </>
            )}
          </section>
        )}

        {/* ── 3. payment ── */}
        {canPay && (
          <section className="po-sec">
            <h2 className="po-h">Payment</h2>
            <dl className="po-money">
              <div><dt>Total</dt><dd>${Number(money.final_total).toLocaleString()}</dd></div>
              <div><dt>Deposit to confirm</dt><dd>${Number(money.deposit_amount).toLocaleString()}</dd></div>
              {money.paid > 0 && <div className="is-paid"><dt>Paid</dt><dd>${Number(money.paid).toLocaleString()}</dd></div>}
              <div className="is-due"><dt>Still due</dt><dd>${Number(money.balance).toLocaleString()}</dd></div>
            </dl>
            <button type="button" className="po-cta" onClick={officeVisit} disabled={busy}>
              🏢 Arrange payment
            </button>
            <p className="po-fine">We&apos;ll be in touch to arrange e-transfer or an in-person payment.</p>
          </section>
        )}

        {chosen && needsSigning && (
          <p className="po-fine po-locked">🔒 Payment options appear once your contract is signed.</p>
        )}
      </div>
    </div>
  );
}
