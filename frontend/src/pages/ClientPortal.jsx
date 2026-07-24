import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './portal.css';

/**
 * 🌐 The client's view of their booking: choose → sign → pay.
 *
 * Each step unlocks the next, so a client is never asked to pay for something
 * they haven't agreed to. Where the vendor hasn't raised a contract, the sign
 * step is skipped rather than blocking them.
 *
 * Deliberately a full page rather than a form card — this is the page where
 * someone spends four figures, so it should read like a studio's own site. The
 * vendor's brand colour drives the accent throughout.
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

  // Playfair for the headings and prices — it's what makes the page read as a
  // studio rather than an admin screen. Loaded here rather than in index.html
  // so the vendor panel isn't paying for a font it never uses.
  useEffect(() => {
    const href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700&display=swap';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }, []);

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

  if (err) return <div className="po-page"><p className="po-state">⚠️ {err}</p></div>;
  if (!data) return <div className="po-page"><p className="po-state">Loading…</p></div>;

  const { lead, business_name, packages, money, contract, branding = {} } = data;
  const chosen = packages.find(p => p.id === lead.package_id);
  const signed = !!contract?.signed_at;
  const needsSigning = !!contract && !signed;
  const canPay = !!chosen && !needsSigning;
  const step = !chosen ? 1 : (needsSigning ? 2 : 3);

  const eventDate = lead.event_date
    ? new Date(lead.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="po-page" style={{ '--brand': branding.brand_color || '#b8922a' }}>

      <header className="po-hd">
        {branding.logo_path && <img className="po-logo" src={`/api/me/logo/${branding.logo_path}`} alt="" />}
        <p className="po-biz">{business_name}</p>
        <h1 className="po-title">Hello <em>{lead.name}</em></h1>
        <p className="po-meta">
          Your <strong>{lead.event_type}</strong>{eventDate ? <> on <strong>{eventDate}</strong></> : null}
        </p>

        <ol className="po-steps">
          {[[1, 'Choose'], [2, 'Sign'], [3, 'Pay']].map(([n, label]) => (
            <li key={n} className={step > n ? 'is-done' : step === n ? 'is-now' : ''}>
              <span className="po-dot">{step > n ? '✓' : n}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </header>

      <main className="po-main">
        {msg && <div className={`po-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

        {/* ── 1. packages ── */}
        <section className="po-sec">
          <p className="po-eyebrow">Step one</p>
          <h2 className="po-h">{chosen ? 'Your package' : 'Choose your package'}</h2>
          <p className="po-lead">
            {chosen
              ? 'You can still change this before you pay.'
              : 'Tap the one you\u2019d like. Nothing is confirmed until you sign.'}
          </p>

          <div className="po-grid">
            {packages.map(p => {
              const isChosen = lead.package_id === p.id;
              const inc = Array.isArray(p.inclusions) ? p.inclusions : [];
              return (
                <button key={p.id} type="button" disabled={busy}
                  className={`po-pkg ${isChosen ? 'is-chosen' : ''}`}
                  onClick={() => !busy && pick(p.id)}>
                  {isChosen && <span className="po-pkg-badge">Selected</span>}
                  <div className="po-pkg-hd">
                    <h3 className="po-pkg-name">{p.name}</h3>
                    <p className="po-pkg-price">
                      <span className="po-pkg-cur">$</span>
                      <span className="po-pkg-amt">{Number(p.base_price).toLocaleString()}</span>
                    </p>
                  </div>
                  {inc.length > 0 && (
                    <div className="po-pkg-body">
                      <p className="po-inc-label">What&apos;s included</p>
                      <ul className="po-inc">{inc.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  <p className="po-pkg-foot">{isChosen ? '✓ Chosen' : 'Choose this →'}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 2. contract ── */}
        {chosen && contract && (
          <section className="po-sec">
            <p className="po-eyebrow">Step two</p>
            <h2 className="po-h">Your contract</h2>
            {signed ? (
              <div className="po-panel is-done">
                <div className="po-panel-icon">✅</div>
                <h3 className="po-panel-t">Signed &amp; confirmed</h3>
                <p className="po-panel-p no-gap">
                  by {contract.signed_name} on {new Date(contract.signed_at).toLocaleDateString()} ·{' '}
                  <a className="po-link" href={`/sign/${contract.token}`}>View a copy</a>
                </p>
              </div>
            ) : (
              <div className="po-panel">
                <div className="po-panel-icon">📄</div>
                <h3 className="po-panel-t">{contract.title || 'Coverage agreement'}</h3>
                <p className="po-panel-p">Please read it through and sign to confirm your date.</p>
                <a className="po-cta" href={`/sign/${contract.token}`}>Read &amp; sign</a>
              </div>
            )}
          </section>
        )}

        {/* ── 3. payment ── */}
        {canPay && (
          <section className="po-sec">
            <p className="po-eyebrow">Step three</p>
            <h2 className="po-h">Secure your date</h2>
            <p className="po-lead">A deposit confirms your booking. The balance is due closer to the day.</p>

            <dl className="po-bill">
              <div><dt>Package total</dt><dd>${Number(money.final_total).toLocaleString()}</dd></div>
              {money.paid > 0 && (
                <div className="is-paid"><dt>Already paid</dt><dd>${Number(money.paid).toLocaleString()}</dd></div>
              )}
              <div className="is-due">
                <dt>{money.paid > 0 ? 'Balance due' : 'Deposit to confirm'}</dt>
                <dd>${Number(money.paid > 0 ? money.balance : money.deposit_amount).toLocaleString()}</dd>
              </div>
            </dl>

            <button type="button" className="po-cta" onClick={officeVisit} disabled={busy}>
              Arrange payment
            </button>
            <p className="po-fine">We&apos;ll be in touch to arrange e-transfer or an in-person payment.</p>
          </section>
        )}

        {chosen && needsSigning && (
          <p className="po-fine">🔒 Payment opens once your contract is signed.</p>
        )}
      </main>

      <footer className="po-ft">
        Questions? Just reply to our email — we&apos;re happy to help.
      </footer>
    </div>
  );
}
