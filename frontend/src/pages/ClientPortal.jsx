import { useState, useEffect, useRef } from 'react';
import { api, fmtEventDate } from '../lib/api';
import './portal.css';

/**
 * 🌐 The client's view of their booking: choose → sign → pay.
 *
 * ONE step is on screen at a time. It used to stack all three down a single
 * page, so after picking a package the client scrolled back past every other
 * package to reach the contract, and the "steps" at the top described a journey
 * the page wasn't actually taking them on.
 *
 * The contract is signed HERE rather than on a separate page. Sending the
 * client to /sign dropped them into a differently-styled page with no way back,
 * so signing looked finished when payment hadn't even been offered yet.
 *
 * Deliberately a full page rather than a form card — this is the page where
 * someone spends four figures, so it should read like a studio's own site. The
 * vendor's brand colour drives the accent throughout.
 */
const STEPS = [[1, 'Choose'], [2, 'Sign'], [3, 'Pay']];

function money0(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * ✍️ Step two — the contract, read and signed without leaving the page.
 *
 * The body carries [INITIAL] markers where the vendor wants the client to
 * initial. Each becomes a tab that fills in with their initials as it's tapped,
 * and the next one due is ringed so there's never a hunt for what's left.
 */
function ContractStep({ contract, clientName, onSigned }) {
  const [name, setName] = useState('');
  const [initialed, setInitialed] = useState([]);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canvasRef = useRef(null);

  const body = contract?.body || '';
  const parts = body.split('[INITIAL]');
  const needed = parts.length - 1;

  useEffect(() => { setInitialed(Array(Math.max(0, needed)).fill(false)); }, [contract?.id, needed]);

  // 🖊️ signature pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = 170 * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(canvas).color;
    let drawing = false, last = null;
    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    };
    const start = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; setHasInk(true); e.preventDefault();
    };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, [contract?.id]);

  function clearPad() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  const left = initialed.filter(v => !v).length;
  const nextDue = initialed.findIndex(v => !v);
  const initials = (name.trim() || clientName || '')
    .split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase();
  const ready = !!name.trim() && left === 0 && hasInk;

  async function sign() {
    setErr('');
    if (!name.trim()) return setErr('Type your full name');
    if (left > 0) return setErr(`Tap all ${needed} initial box${needed > 1 ? 'es' : ''}`);
    if (!hasInk) return setErr('Draw your signature in the box');
    setBusy(true);
    try {
      await api.signContract(contract.token, name.trim(), canvasRef.current.toDataURL('image/png'), initialed);
      onSigned();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="po-sec">
      <p className="po-eyebrow">Step two</p>
      <h2 className="po-h">{contract.title || 'Your contract'}</h2>
      <p className="po-lead">Read it through, initial where marked, then sign to confirm your date.</p>

      <div className="po-doc">
        {parts.map((chunk, i) => (
          <span key={i}>
            {chunk}
            {i < needed && (
              <button type="button"
                className={`po-tab ${initialed[i] ? 'is-filled' : ''} ${i === nextDue ? 'is-next' : ''}`}
                onClick={() => setInitialed(a => a.map((v, x) => x === i ? !v : v))}>
                {initialed[i] ? (initials || 'OK') : 'Tap to initial'}
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="po-sign-grid">
        <label className="po-label" htmlFor="po-name">Your full legal name</label>
        <input id="po-name" className="po-input" value={name} placeholder="Full name"
          onChange={e => setName(e.target.value)} />

        <div className="po-pad-head">
          <label className="po-label" htmlFor="po-pad">Draw your signature</label>
          <button type="button" className="po-clear" onClick={clearPad}>Clear</button>
        </div>
        <canvas id="po-pad" ref={canvasRef} className="po-pad" />
      </div>

      {err && <div className="po-msg is-err">{err}</div>}

      <div className="po-signbar">
        <span className="po-signbar-status">
          <span className="po-dots">
            {initialed.map((v, i) => <i key={i} className={`po-dot ${v ? 'is-on' : ''}`} />)}
          </span>
          {left > 0
            ? `${left} initial${left > 1 ? 's' : ''} left`
            : hasInk ? 'Ready to sign' : 'Signature needed'}
        </span>
        <button type="button" className="po-cta po-cta-sm" onClick={sign} disabled={busy || !ready}>
          {busy ? 'Signing…' : 'Sign contract'}
        </button>
      </div>
      <p className="po-fine">Your name, signature, IP address and the time are recorded with this agreement.</p>
    </section>
  );
}

export default function ClientPortal({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // a step the client walked back to by hand — cleared whenever the booking
  // itself moves on, so the page returns to wherever they actually are
  const [back, setBack] = useState(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => { load(); }, [token]);
  function load() {
    api.portal(token).then(setData).catch(e => setErr(e.message));
  }

  // Playfair for the headings and prices — it's what makes the page read as a
  // studio rather than an admin screen. Loaded here rather than in index.html
  // so the vendor panel isn't paying for a font it never uses.
  useEffect(() => {
    const href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }, []);

  async function pick(id) {
    setBusy(true); setMsg('');
    try {
      await api.portalPick(token, id);
      setBack(null);            // picking moves them on, so stop looking back
      load();
    }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function payDirect() {
    if (!confirm('Confirm you\u2019ve sent the payment? We\u2019ll check and get back to you.')) return;
    setBusy(true); setMsg('');
    try { await api.portalPayDirect(token); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  function afterSign() {
    setCelebrate(true);
    setBack(null);
    load();
    setTimeout(() => setCelebrate(false), 2200);
  }

  if (err) return <div className="po-page"><p className="po-state">⚠️ {err}</p></div>;
  if (!data) return <div className="po-page"><p className="po-state">Loading…</p></div>;

  const { lead, business_name, packages, money, contract, branding = {} } = data;
  const chosen = packages.find(p => p.id === lead.package_id);
  const signed = !!contract?.signed_at;
  const claimed = !!lead.payment_claimed_at;
  // Payment requires a SIGNED contract — full stop. A lead with no contract yet
  // isn't ready to pay either: it means the vendor hasn't raised one, and the
  // client would otherwise sail past the one step that must not be skippable.
  const reached = !chosen ? 1 : (!signed ? 2 : 3);
  // They can revisit a step they've already cleared, but never skip ahead.
  const step = back && back < reached ? back : reached;

  const eventDate = lead.event_date ? fmtEventDate(lead.event_date, { long: true }) : null;

  return (
    <div className="po-page" style={{ '--brand': branding.brand_color || '#C9A86A' }}>

      <header className="po-hd">
        {branding.logo_path && <img className="po-logo" src={`/api/me/logo/${branding.logo_path}`} alt="" />}
        <p className="po-biz">{business_name}</p>
        <h1 className="po-title">Hello <em>{lead.name}</em></h1>
        <p className="po-meta">
          Your <strong>{lead.event_type}</strong>{eventDate ? <> on <strong>{eventDate}</strong></> : null}
        </p>

        <ol className="po-steps">
          {STEPS.map(([n, label]) => {
            const done = reached > n;
            const now = step === n;
            return (
              <li key={n} className={`${done ? 'is-done' : ''} ${now ? 'is-now' : ''}`}>
                <button type="button" className="po-step-hit" disabled={n > reached}
                  onClick={() => setBack(n === reached ? null : n)}>
                  <span className="po-dot-n">{done ? '✓' : n}</span>
                  <span className="po-step-lbl">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      {(chosen || eventDate || lead.location) && (
        <div className="po-strip">
          {chosen && <div className="po-strip-i"><span className="po-strip-l">Package</span><span className="po-strip-v">{chosen.name}</span></div>}
          {chosen && <div className="po-strip-i"><span className="po-strip-l">Total</span><span className="po-strip-v">${money0(money.final_total)}</span></div>}
          {eventDate && <div className="po-strip-i"><span className="po-strip-l">Date</span><span className="po-strip-v">{eventDate}</span></div>}
          {lead.location && <div className="po-strip-i"><span className="po-strip-l">Location</span><span className="po-strip-v">{lead.location}</span></div>}
        </div>
      )}

      <main className="po-main">
        {msg && <div className={`po-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

        {step === 1 && (
          <section className="po-sec">
            <p className="po-eyebrow">Step one</p>
            <h2 className="po-h">{chosen ? 'Your package' : 'Choose your package'}</h2>
            <p className="po-lead">
              {chosen
                ? 'Pick a different one any time before you pay — your contract is rewritten to match.'
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
                        <span className="po-pkg-amt">{money0(p.base_price)}</span>
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

            {chosen && reached > 1 && (
              <button type="button" className="po-next" onClick={() => setBack(null)}>
                Continue with {chosen.name} →
              </button>
            )}
          </section>
        )}

        {step === 2 && (
          contract?.body ? (
            <ContractStep contract={contract} clientName={lead.name} onSigned={afterSign} />
          ) : (
            /* the vendor hasn't raised one yet — say so rather than letting the
               client walk straight into paying for an unsigned booking */
            <section className="po-sec">
              <p className="po-eyebrow">Step two</p>
              <h2 className="po-h">Your contract</h2>
              <div className="po-panel">
                <div className="po-panel-icon">⏳</div>
                <h3 className="po-panel-t">On its way</h3>
                <p className="po-panel-p no-gap">
                  We&apos;re preparing your contract now. You&apos;ll get an email the moment
                  it&apos;s ready to sign.
                </p>
              </div>
            </section>
          )
        )}

        {step === 3 && (
          <section className="po-sec">
            <p className="po-eyebrow">Step three</p>
            <h2 className="po-h">Secure your date</h2>

            {claimed ? (
              /* they've told us they paid — waiting on the vendor to confirm */
              <div className="po-panel is-done">
                <div className="po-panel-icon">⏳</div>
                <h3 className="po-panel-t">Thank you — we&apos;re checking</h3>
                <p className="po-panel-p no-gap">
                  You told us the payment is on its way. We&apos;ll confirm as soon as it lands
                  and your date is locked in.
                </p>
              </div>
            ) : (
              <>
                <p className="po-lead">A deposit confirms your booking. The balance is due closer to the day.</p>

                <dl className="po-bill">
                  <div><dt>Package total</dt><dd>${money0(money.final_total)}</dd></div>
                  {money.paid > 0 && (
                    <div className="is-paid"><dt>Already paid</dt><dd>${money0(money.paid)}</dd></div>
                  )}
                  <div className="is-due">
                    <dt>{money.paid > 0 ? 'Balance due' : 'Deposit to confirm'}</dt>
                    <dd>${money0(money.paid > 0 ? money.balance : money.deposit_amount)}</dd>
                  </div>
                </dl>

                <button type="button" className="po-cta" onClick={payDirect} disabled={busy}>
                  💳 Pay directly
                </button>
                <p className="po-fine">
                  Send an e-transfer, or pay by cash or card in person. Press this once you have —
                  we&apos;ll confirm it and lock in your date.
                </p>
              </>
            )}
          </section>
        )}
      </main>

      {celebrate && (
        <div className="po-cheer">
          <div className="po-cheer-box">
            <div className="po-check">✓</div>
            <h2 className="po-cheer-t">Contract signed</h2>
            <p className="po-cheer-p">Thank you{contract?.signed_name ? `, ${contract.signed_name}` : ''} — last step is securing your date.</p>
          </div>
        </div>
      )}

      <footer className="po-ft">
        Questions? Just reply to our email — we&apos;re happy to help.
      </footer>
    </div>
  );
}
