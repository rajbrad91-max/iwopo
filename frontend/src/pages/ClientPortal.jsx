import { useState, useEffect, useRef } from 'react';
import { firstName } from '../lib/firstName';
import { api, fmtEventDate, fmtMoney, moneyParts } from '../lib/api';
import { useContractInitials, countInitBoxes, guideToMissing } from '../lib/contractDoc';
import { useDialog } from '../lib/dialog.jsx';
import './portal.css';
import './contractdoc.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useBrandIcon } from '../lib/useBrandIcon';
import { quotePackage, unitText, taxOf } from '../lib/packageQuote';

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

/**
 * 💱 A sum in the VENDOR's currency, which arrives with the portal payload.
 *
 * This used to print a bare number behind a hard-coded dollar sign, so a client
 * of a London or Karachi vendor was quoted in the wrong currency on the page
 * where they agree to pay it.
 */
function cashIn(currency) {
  return (n) => fmtMoney(n, { currency: currency || 'USD' });
}

/**
 * ✍️ Step two — the contract, read and signed without leaving the page.
 *
 * The body is real HTML now — tables, ruled headings — built server-side and
 * injected once. Wiring up the gold initial boxes is shared with the
 * standalone sign page via useContractInitials, rather than a second copy of
 * that logic kept here: a second copy is exactly what let this page fall
 * behind when the body format changed and nobody told this component.
 */
/**
 * ⏳ A live countdown around a limited-time offer.
 *
 * Ticks client-side from timer_started_at + timer_hours, matching what the
 * vendor set. At zero it stops counting and says so rather than showing
 * 00:00:00 forever, which would read as broken rather than expired.
 */
function Countdown({ startedAt, hours }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expires = new Date(startedAt).getTime() + (hours || 72) * 3600000;
  const diff = expires - now;
  if (diff <= 0) return (
    <div className="po-timer">
      <p className="po-timer-expired">⏰ This offer has expired. Please get in touch for a new quote.</p>
    </div>
  );
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  return (
    <div className="po-timer">
      <p className="po-timer-eyebrow">Offer expires in</p>
      <div className="po-timer-card">
        <div className="po-timer-unit"><span className="po-timer-num">{h}</span><span className="po-timer-lbl">Hours</span></div>
        <span className="po-timer-colon">:</span>
        <div className="po-timer-unit"><span className="po-timer-num">{m}</span><span className="po-timer-lbl">Minutes</span></div>
        <span className="po-timer-colon">:</span>
        <div className="po-timer-unit"><span className="po-timer-num">{sec}</span><span className="po-timer-lbl">Seconds</span></div>
      </div>
    </div>
  );
}

function ContractStep({ contract, clientName, onSigned }) {
  // pre-filled from the lead on file, editable — a blank field made someone
  // type a name that was already known, and until they did the tap boxes had
  // nothing meaningful to show
  const [name, setName] = useState(clientName || '');
  const [initialed, setInitialed] = useState([]);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canvasRef = useRef(null);
  const docRef = useRef(null);

  const body = contract?.body || '';
  const needed = countInitBoxes(body);

  useEffect(() => { setInitialed(Array(needed).fill(false)); }, [contract?.id, needed]);
  useContractInitials(docRef, initialed, setInitialed, name, {});

  // 🖊️ signature pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
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
  const ready = !!name.trim() && left === 0 && hasInk;
  // ✍️ what to do next, shown for a few seconds where the client is looking (lib/contractDoc.js guideToMissing)
  const [guide, setGuide] = useState('');
  useEffect(() => { if (!guide) return undefined; const t = setTimeout(() => setGuide(''), 7000); return () => clearTimeout(t); }, [guide]);

  async function sign() {
    setErr('');
    const missing = guideToMissing({ docRef, initialed, name, hasInk, nameId: 'po-name', padId: 'po-pad' });
    if (missing) return setGuide(missing);
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
      <h2 className="po-h">Sign</h2>
      <p className="po-lead">Read the agreement, initial where marked, then sign.</p>

      <article className="ct-sheet">
        <div className="ct-doc" ref={docRef} dangerouslySetInnerHTML={{ __html: body }} />

        {initialed.length > 0 && (
          <p className={`ct-left ${left ? 'is-todo' : 'is-done'}`}>
            {left ? `${left} initial${left > 1 ? 's' : ''} left` : 'All initialed'}
          </p>
        )}

        <section className="ct-accept">
          <h2 className="ct-accept-title">Acceptance & Signature</h2>
          <p className="ct-accept-lead">Sign below to confirm this agreement.</p>

          <label className="ct-field-label" htmlFor="po-name">Full legal name</label>
          <input id="po-name" className="ct-field" value={name} placeholder="Full name"
            onChange={e => setName(e.target.value)} />

          <div className="ct-pad-row">
            <label className="ct-field-label" htmlFor="po-pad">Signature</label>
            <button type="button" className="ct-clear" onClick={clearPad}>Clear</button>
          </div>
          <canvas id="po-pad" ref={canvasRef} className="ct-pad" />
        </section>

        {err && <div className="ct-err">{err}</div>}
        {guide && <div className="ct-guide" role="alert">{guide}</div>}
        <button type="button" className={`ct-sign-btn ${ready ? '' : 'is-waiting'}`} onClick={sign} disabled={busy}>
          {busy ? 'Signing…' : 'Sign contract'}
        </button>
        <p className="ct-fine">Your name, signature, IP address and the time are recorded with this agreement.</p>
      </article>
    </section>
  );
}

/**
 * 🎨 A brand colour a client can actually read.
 *
 * --brand is whatever the vendor picked, and it is used for text as well as for
 * fills. A pale choice — the test vendor's own #ccebff, for instance — leaves a
 * tier label almost invisible on white. Fills are fine pale; text is not.
 *
 * So text uses a darkened version whenever the colour is too light to read,
 * while fills keep the vendor's actual choice. Relative luminance per WCAG,
 * because "looks light" is not something to eyeball per vendor.
 */
function readableBrand(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex || '#C9A86A';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  if (L <= 0.42) return '#' + h;                 // already dark enough to read
  // pull it toward black until it clears the bar, keeping the hue
  const k = Math.min(0.62, (L - 0.42) * 1.25);
  const dark = [r, g, b].map(c => Math.round(c * (1 - k) * 255)
    .toString(16).padStart(2, '0')).join('');
  return '#' + dark;
}

/**
 * Checked in order, first match wins — so the specific thing a line names has
 * to come before the general subject it sits inside. "Next Day Edit delivered
 * on USB" is about delivery, not editing; "1 Photographer with 1 Videographer"
 * is about people, not video. Getting that order wrong is what made these read
 * as random rather than descriptive.
 */
const INC_ICONS = [
  [/\busb|drive|stick|memory card/i, '💾'],
  [/\balbum|print|frame|book/i, '📔'],
  [/\bdrone|aerial/i, '🚁'],
  [/\bgift|bonus|complimentar/i, '🎁'],
  [/\bphotographer|videographer|shooter|team of|crew|second shooter|staff/i, '👥'],
  [/\bgaller(y|ies)|download|online view/i, '🖼️'],
  [/\bdeliver|weeks?\b|turnaround/i, '📦'],
  [/\b4k|ultra ?hd|1080|full hd|video|film|cinemat/i, '🎬'],
  [/\bphoto|image|edit|retouch/i, '📸'],
  [/\bhour|coverage|full day/i, '⏱️'],
];
/** The icon a line's own wording earns, or null to keep the neutral mark. */
function incIcon(text) {
  const t = String(text || '');
  for (const [re, icon] of INC_ICONS) if (re.test(t)) return icon;
  return null;
}

export default function ClientPortal({ token }) {
  const dialog = useDialog();
  const [data, setData] = useState(null);
  useDocumentTitle(data?.business_name);
  useBrandIcon(data?.branding?.logo_path ? `/api/me/logo/${data.branding.logo_path}` : null, !!data?.white_label);
  // bound once the payload arrives, so every figure on the page uses one currency
  const cash = cashIn(data?.currency);
  const [err, setErr] = useState('');
  // 💳 back from Stripe's card page: thanked at once — the payment shows when Stripe confirms it
  const [msg, setMsg] = useState(() => (new URLSearchParams(window.location.search).get('paid') === 'card' ? '✅ Thank you! Your card payment went through — it will show here in a moment.' : ''));
  const [busy, setBusy] = useState(false);
  // a step the client walked back to by hand — cleared whenever the booking
  // itself moves on, so the page returns to wherever they actually are
  const [back, setBack] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  // ticks on optional extras not saved yet, per package — { [packageId]: { [extraId]: qty } } — and the package
  // the client is shaping (the running total follows it). Both clear when a choice is saved.
  const [edits, setEdits] = useState({});
  const [draftId, setDraftId] = useState(null);

  /**
   * 🔄 Only the very first load of a browser session asks for a reset.
   *
   * sessionStorage survives a page refresh (F5 mid-signature is safe) but
   * clears when the browser is actually closed, and a shared link opened by
   * someone else has none to begin with — both of the exact cases that
   * should restart the flow. Every OTHER call to load() in this file — after
   * picking, after signing, after confirming a payment — passes nothing, so
   * an action taken mid-flow can never trigger the reset it just caused.
   */
  useEffect(() => {
    const key = 'iwopo_portal_seen_' + token;
    const fresh = !sessionStorage.getItem(key);
    sessionStorage.setItem(key, '1');
    load(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  }, [token]);
  function load(fresh) {
    api.portal(token, fresh).then(setData).catch(e => setErr(e.message));
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
    const next = packages.find(p => p.id === id);
    if (!next) return;
    const pk = picksFor(next);
    const extrasChanged = !samePicks(pk, savedPicks(next));
    if (chosen && id === chosen.id && !extrasChanged) { setDraftId(null); setBack(null); return; }   // nothing to change
    // R4 (2026-10-30): changing package — or now its extras — after signing cancels that signature; say so first
    if (signed && chosen && !await dialog.confirm(
      id !== chosen.id
        ? `You signed the contract for ${chosen.name}. Choosing ${next.name} cancels that signature — you\u2019ll read and sign a new contract for it.`
        : 'You signed the contract with your current extras. Changing them cancels that signature — you\u2019ll read and sign a new contract with the new ones.',
      { title: id !== chosen.id ? 'Change your package?' : 'Change your extras?', okLabel: 'Yes, change it', danger: true })) return;
    setBusy(true); setMsg('');
    try {
      await api.portalPick(token, id, Object.entries(pk).map(([xid, qty]) => ({ id: xid, qty })));
      setEdits({}); setDraftId(null);
      setBack(null);            // picking moves them on, so stop looking back
      load();
    }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  /* 💳 by card, on the vendor's own Stripe (lib/stripeConnect.js) — Stripe's page, then back here */
  async function payCard() {
    setBusy(true); setMsg('');
    try { const r = await api.portalPayCard(token); window.location.href = r.url; }
    catch (e) { setMsg('⚠️ ' + e.message); setBusy(false); }
  }

  async function payDirect() {
    if (!await dialog.confirm('We\u2019ll check and get back to you.', { title: 'Confirm you\u2019ve sent the payment?', okLabel: 'Yes, I\u2019ve paid', danger: false })) return;
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

  // 🔒 Secure Login — the email check some vendors turn on. Success loads the
  // real portal the normal way; the cookie means this only happens once.
  const [gateEmail, setGateEmail] = useState('');
  const [gateErr, setGateErr] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  async function verify(e) {
    e.preventDefault();
    setGateErr(''); setGateBusy(true);
    try { await api.portalVerify(token, gateEmail); load(); }
    catch (err) { setGateErr(err.message); }
    finally { setGateBusy(false); }
  }

  if (err) return <div className="po-page"><p className="po-state">⚠️ {err}</p></div>;
  if (!data) return <div className="po-page"><p className="po-state">Loading…</p></div>;

  if (data.gated) return (
    <div className="po-page" style={{ '--brand': data.branding?.brand_color || '#C9A86A',
      '--brandText': readableBrand(data.branding?.brand_color || '#C9A86A') }}>
      <div className="po-gate">
        {data.branding?.logo_path && <img className="po-gate-logo" src={`/api/me/logo/${data.branding.logo_path}`} alt="" />}
        <div className="po-gate-lock">🔒</div>
        <h1 className="po-gate-h">Enter your registered email</h1>
        <p className="po-gate-sub">
          To access the packages prepared for <strong>{data.lead?.name}</strong>, please verify your email address.
        </p>
        <form className="po-gate-card" onSubmit={verify}>
          <label className="po-gate-label" htmlFor="gate-email">Your email address</label>
          <input id="gate-email" className={`po-gate-input ${gateErr ? 'is-err' : ''}`} type="email"
            placeholder="you@email.com" value={gateEmail} onChange={e => setGateEmail(e.target.value)} autoFocus />
          {gateErr && <p className="po-gate-err">⚠️ {gateErr}</p>}
          <button type="submit" className="po-gate-btn" disabled={gateBusy}>
            {gateBusy ? 'Checking…' : 'View my packages'}
          </button>
        </form>
      </div>
    </div>
  );

  const { lead, business_name, packages, money, contract, branding = {} } = data;
  const chosen = packages.find(p => p.id === lead.package_id);
  const signed = !!contract?.signed_at;
  const claimed = !!lead.payment_claimed_at;
  // Payment requires a SIGNED contract — full stop. A lead with no contract yet
  // isn't ready to pay either: it means the vendor hasn't raised one, and the
  // client would otherwise sail past the one step that must not be skippable.
  // F5 (2026-10-30): the deposit in (whole cents) secures the date — PAY ticks; the balance still shows on step 3
  const cents = (n) => Math.round(Number(n || 0) * 100);
  const depositIn = signed && cents(money?.deposit_amount) > 0 && cents(money?.paid) >= cents(money?.deposit_amount);
  const reached = !chosen ? 1 : (!signed ? 2 : (depositIn ? 4 : 3));
  // They can revisit a step they've already cleared, but never skip ahead.
  const step = back && back < reached ? back : Math.min(reached, 3);

  const eventDate = lead.event_date ? fmtEventDate(lead.event_date, { long: true }) : null;

  /* extras and prices (lib/packageQuote.js — the same function the server charges by; it re-prices on save) */
  const optionalOf = (p) => (p.extras || []).filter(x => x.mode === 'optional');
  function savedPicks(p) { return Object.fromEntries(optionalOf(p).filter(x => x.chosen).map(x => [x.id, x.qty || 1])); }
  function picksFor(p) { return edits[p.id] ?? savedPicks(p); }
  function samePicks(a, b) { const k = (o) => JSON.stringify(Object.entries(o).sort()); return k(a) === k(b); }
  function quoteFor(p, pk = picksFor(p)) {
    return quotePackage({
      ...p, price: p.base_price,
      extras: (p.extras || []).map(x => (x.mode === 'optional' ? { ...x, chosen: pk[x.id] != null, qty: pk[x.id] ?? x.qty } : x)),
    }, lead);
  }
  function toggleExtra(p, x) {
    setEdits(e => {
      const cur = { ...(e[p.id] ?? savedPicks(p)) };
      if (cur[x.id] != null) delete cur[x.id]; else cur[x.id] = 1;
      return { ...e, [p.id]: cur };
    });
    setDraftId(p.id);
  }
  function setQty(p, x, n) {
    const qty = Math.min(Math.max(n, 1), x.max_qty || 99);
    setEdits(e => ({ ...e, [p.id]: { ...(e[p.id] ?? savedPicks(p)), [x.id]: qty } }));
    setDraftId(p.id);
  }
  /* what a total comes to after the discount, and the deposit on it — the same rules as the server's money summary */
  function owedOn(total) {
    const final = Math.max(total - total * (Number(money?.discount_percent) || 0) / 100, 0);
    const dep = money?.deposit_mode === 'amount' ? Number(money.deposit_amount) || 0 : final * (Number(money?.deposit_percent) || 0) / 100;
    return { final, dep };
  }
  /* "Every package includes": lines all the packages share, said once so each card shows only its differences */
  const norm = (t) => String(t).trim().toLowerCase();
  const incOf = (p) => (Array.isArray(p.inclusions) ? p.inclusions : []).map(String).filter(t => t.trim());
  const shared = packages.length >= 2 ? incOf(packages[0]).filter(t => packages.every(p => incOf(p).some(u => norm(u) === norm(t)))) : [];
  const common = shared.length >= 2 ? shared : [];
  const commonSet = new Set(common.map(norm));
  // the package being shaped, while it differs from what is saved
  const draftPkg = packages.find(p => p.id === draftId);
  const draft = draftPkg && (lead.package_id !== draftPkg.id || !samePicks(picksFor(draftPkg), savedPicks(draftPkg))) ? draftPkg : null;
  const draftQ = draft ? quoteFor(draft) : null;
  const draftOwed = draftQ ? owedOn(draftQ.total) : null;
  const draftN = draft ? Object.keys(picksFor(draft)).length : 0;
  // the chosen package line by line, for the pay step — not when the vendor set the price by hand
  const chosenQ = chosen && !data.custom_price ? quoteFor(chosen, savedPicks(chosen)) : null;
  const showBreak = chosenQ && (chosenQ.extras.length > 0 || chosenQ.extra_hours > 0 || chosenQ.price_mode === 'per_guest');
  // ⏱ the hours asked for, and when — "12 hrs (5:00 PM – 5:00 AM)"
  const clock = (t) => { const x = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!x) return ''; const h = Number(x[1]); return `${h % 12 || 12}:${x[2]} ${h < 12 ? 'AM' : 'PM'}`; };
  const coverage = lead.hours ? `${lead.hours} hrs${lead.timing_from && lead.timing_to ? ` (${clock(lead.timing_from)} – ${clock(lead.timing_to)})` : ''}` : '';
  const perGuestAny = packages.some(p => p.price_mode === 'per_guest' || (p.extras || []).some(x => x.unit === 'per_guest'));

  return (
    <div className="po-page" style={{ '--brand': branding.brand_color || '#C9A86A',
      '--brandText': readableBrand(branding.brand_color || '#C9A86A') }}>

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

      {(chosen || eventDate || lead.location || coverage) && (
        <div className="po-strip">
          {chosen && <div className="po-strip-i"><span className="po-strip-l">Package</span><span className="po-strip-v">{chosen.name}</span></div>}
          {chosen && <div className="po-strip-i"><span className="po-strip-l">Total</span><span className="po-strip-v">{cash(money.final_total)}</span></div>}
          {eventDate && <div className="po-strip-i"><span className="po-strip-l">Date</span><span className="po-strip-v">{eventDate}</span></div>}
          {coverage && <div className="po-strip-i"><span className="po-strip-l">Coverage</span><span className="po-strip-v">{coverage}</span></div>}
          {perGuestAny && lead.guests ? <div className="po-strip-i"><span className="po-strip-l">Guests</span><span className="po-strip-v">{lead.guests}</span></div> : null}
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
                ? (signed ? `You signed for ${chosen.name}. Choosing another package or changing your extras cancels that signature and you’ll sign again.` : 'Pick a different one, or change your extras, any time before you pay — your contract is rewritten to match.')
                : 'Tap the one you’d like. Nothing is confirmed until you sign.'}
            </p>

            {lead.timer_enabled && (lead.timer_started_at || lead.created_at) && (
              <Countdown startedAt={lead.timer_started_at || lead.created_at} hours={lead.timer_hours} />
            )}

            {/* what every package has, said once — so each card shows only what makes it different */}
            {common.length > 0 && (
              <div className="po-common">
                <p className="po-inc-label">Every package includes</p>
                <ul className="po-inc po-inc-cols">
                  {common.map((x, k) => (
                    <li key={k}><span className="po-inc-ic" aria-hidden="true">{incIcon(x) || '✦'}</span><span className="po-inc-t">{x}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="po-grid">
              {packages.length === 0 && (
                <p className="po-empty">Your packages are being prepared — you’ll get an email the moment they’re ready.</p>
              )}
              {packages.map((p, i) => {
                const isChosen = lead.package_id === p.id;
                const pk = picksFor(p);
                const changed = isChosen && !samePicks(pk, savedPicks(p));
                const opts = optionalOf(p);
                const ticked = Object.keys(pk).length;
                const own = incOf(p).filter(s => !commonSet.has(norm(s)));
                const inPrice = (p.extras || []).filter(x => x.mode === 'included' || x.mode === 'added');
                const q0 = quoteFor(p, {});             // the package for this client, before anything optional
                /* the vendor's own ribbon wins ("none" hides it); without one, the middle of three is the popular one
                   and the dearest the best value — only with three or more, since "most popular of two" says nothing */
                const ribbon = p.badge === 'none' ? null
                  : p.badge ? p.badge
                  : packages.length >= 3 && i === 1 ? 'Most popular'
                  : packages.length >= 3 && i === packages.length - 1 ? 'Best value'
                  : null;
                /* A div rather than a button, because the Choose control below is itself a button and a button cannot
                   nest inside one — role, tabindex AND a key handler put the keyboard back. A package with optional
                   extras is opened for shaping on a tap; one without is chosen at once. */
                const tap = () => { if (busy) return; if (opts.length && !isChosen) setDraftId(p.id); else if (!opts.length) pick(p.id); };
                const cta = isChosen ? (changed ? 'Save my extras' : `✓ ${p.name} chosen`)
                  : `Choose ${p.name}${ticked ? ` + ${ticked} extra${ticked > 1 ? 's' : ''}` : ''}`;
                const m = moneyParts(q0.total, { currency: data?.currency });
                return (
                  <div key={p.id} role="button" tabIndex={0}
                    aria-pressed={isChosen}
                    className={`po-pkg ${isChosen ? 'is-chosen' : ''} ${draftId === p.id && !isChosen ? 'is-draft' : ''} ${busy ? 'is-busy' : ''}`}
                    onClick={tap}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
                    }}>
                    {isChosen && <span className="po-pkg-badge">Selected</span>}
                    {ribbon && !isChosen && (
                      <span className={`po-ribbon ${ribbon === 'Best value' ? 'is-value' : ''}`}>{ribbon}</span>
                    )}
                    <div className="po-pkg-hd">
                      <h3 className="po-pkg-name">{p.name}</h3>
                      {p.description && <p className="po-pkg-desc">{p.description}</p>}
                      {/* symbol small in the brand colour, the number large and dark, the code small and grey — split by
                          Intl so a currency that puts its symbol after the number still reads right */}
                      <p className="po-pkg-price">
                        {m.symbolFirst && m.symbol && <span className="po-pkg-cur">{m.symbol}</span>}
                        <span className="po-pkg-amt">{m.amount}</span>
                        {!m.symbolFirst && m.symbol && <span className="po-pkg-cur">{m.symbol}</span>}
                        {m.code && !/[A-Za-z]/.test(m.symbol || '') && <span className="po-pkg-code">{m.code}</span>}
                      </p>
                      {/* 🧾 what the price says about tax */}
                      {taxOf(p.tax_mode, p.tax_rate, q0.total, cash).text && <p className="po-pkg-tax">{taxOf(p.tax_mode, p.tax_rate, q0.total, cash).text}</p>}
                      {q0.price_mode === 'per_guest' && (
                        <p className="po-pkg-sub">{q0.guests} guests × {cash(q0.price)}{p.min_guests && Number(lead.guests || 0) < p.min_guests ? ` · minimum ${p.min_guests}` : ''}</p>
                      )}
                      {q0.included_hours > 0 && (
                        <p className="po-pkg-sub">⏱ {q0.included_hours} hours of coverage{q0.extra_hours > 0 ? ` + ${q0.extra_hours} more for your ${q0.hours_asked}-hour day (${cash(q0.extra_hours_amount)})` : ''}</p>
                      )}
                    </div>
                    <div className="po-pkg-body">
                      {(own.length > 0 || inPrice.length > 0) && (
                        <>
                          <p className="po-inc-label">{common.length ? 'In this package' : 'What’s included'}</p>
                          <ul className="po-inc">
                            {own.map((x, k) => (
                              <li key={k}><span className="po-inc-ic" aria-hidden="true">{incIcon(x) || '✦'}</span><span className="po-inc-t">{x}</span></li>
                            ))}
                            {inPrice.map(x => (
                              <li key={x.id}><span className="po-inc-ic" aria-hidden="true">{incIcon(x.name) || '✦'}</span>
                                <span className="po-inc-t">{x.name}{x.mode === 'added' && x.qty > 1 ? ` × ${x.qty}` : ''}</span></li>
                            ))}
                          </ul>
                        </>
                      )}
                      {own.length === 0 && inPrice.length === 0 && common.length > 0 && (
                        <p className="po-inc-none">Everything every package includes, above.</p>
                      )}

                      {/* Make it yours — the extras this client can add, priced as they tick */}
                      {opts.length > 0 && (
                        <div className="po-xs" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                          <p className="po-inc-label">Make it yours</p>
                          {opts.map(x => {
                            const on = pk[x.id] != null;
                            const qtyable = x.unit === 'per_item' || x.unit === 'per_hour';
                            const n = on ? pk[x.id] : 1;
                            return (
                              <div key={x.id} className={`po-x ${on ? 'is-on' : ''}`}>
                                <label className="po-x-row">
                                  <input type="checkbox" checked={on} disabled={busy} onChange={() => toggleExtra(p, x)} />
                                  <span className="po-x-t"><b>{x.name}</b>{x.description && <small>{x.description}</small>}</span>
                                  <span className="po-x-p">+{unitText(x.unit, cash(x.price))}</span>
                                </label>
                                {on && qtyable && (
                                  <div className="po-x-qty">
                                    <button type="button" aria-label="Fewer" disabled={busy || n <= 1} onClick={() => setQty(p, x, n - 1)}>−</button>
                                    <span>{n}{x.unit === 'per_hour' ? ' hr' : ''}</span>
                                    <button type="button" aria-label="More" disabled={busy || n >= (x.max_qty || 99)} onClick={() => setQty(p, x, n + 1)}>+</button>
                                    <em>{cash(x.price * n)}</em>
                                  </div>
                                )}
                                {on && x.unit === 'per_guest' && <div className="po-x-qty"><span>{x.qty} guests</span><em>{cash(x.price * x.qty)}</em></div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* the card takes a tap anywhere; this is the obvious place, and it names what it will do */}
                    <button type="button" className="po-pkg-cta" disabled={busy}
                      onClick={e => { e.stopPropagation(); if (!isChosen || changed) pick(p.id); }}>
                      {cta}
                    </button>
                  </div>
                );
              })}
            </div>

            {chosen && reached > 1 && !draft && (
              <button type="button" className="po-next" onClick={() => setBack(null)}>
                Continue with {chosen.name} →
              </button>
            )}
          </section>
        )}

        {/* 🎉 this vendor confirms bookings themselves (Free plan): the pick is a request, no contract here */}
        {step === 2 && data.books === false && (
          <section className="po-sec">
            <p className="po-eyebrow">Step two</p>
            <h2 className="po-h">Your choice is sent 🎉</h2>
            <p className="po-lead">{business_name} will be in touch shortly to confirm your booking.</p>
          </section>
        )}
        {step === 2 && data.books !== false && (
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
                <h3 className="po-panel-t">Thank you{firstName(lead?.name) ? `, ${firstName(lead.name)}` : ''} — we&apos;re checking</h3>
                <p className="po-panel-p no-gap">
                  You told us the payment is on its way. We&apos;ll confirm as soon as it lands
                  and your date is locked in.
                </p>
              </div>
            ) : (
              <>
                <p className="po-lead">A deposit confirms your booking. The balance is due closer to the day.</p>

                <dl className="po-bill">
                  {showBreak && (
                    <>
                      <div className="is-line"><dt>{chosen.name}{chosenQ.price_mode === 'per_guest' ? ` · ${chosenQ.guests} guests` : ''}</dt><dd>{cash(chosenQ.base)}</dd></div>
                      {chosenQ.extra_hours > 0 && <div className="is-line"><dt>{chosenQ.extra_hours} extra hour{chosenQ.extra_hours > 1 ? 's' : ''}</dt><dd>{cash(chosenQ.extra_hours_amount)}</dd></div>}
                      {chosenQ.extras.map(l => <div key={l.id} className="is-line"><dt>{l.name}{l.unit === 'per_guest' ? ` × ${l.qty} guests` : l.unit === 'per_hour' ? ` × ${l.qty} hr` : l.qty > 1 ? ` × ${l.qty}` : ''}</dt><dd>{cash(l.amount)}</dd></div>)}
                      {money.discount_amount > 0 && <div className="is-line"><dt>Discount ({money.discount_percent}%)</dt><dd>−{cash(money.discount_amount)}</dd></div>}
                    </>
                  )}
                  <div><dt>{showBreak ? 'Total' : 'Package total'}</dt><dd>{cash(money.final_total)}</dd></div>
                  {chosen && taxOf(chosen.tax_mode, chosen.tax_rate, money.final_total, cash).text && (
                    <div className="is-line"><dt>{taxOf(chosen.tax_mode, chosen.tax_rate, money.final_total, cash).text}</dt><dd /></div>
                  )}
                  {money.paid > 0 && (
                    <div className="is-paid"><dt>Already paid</dt><dd>{cash(money.paid)}</dd></div>
                  )}
                  <div className="is-due">
                    <dt>{money.paid > 0 ? 'Balance due' : 'Deposit to confirm'}</dt>
                    <dd>{cash(money.paid > 0 ? money.balance : money.deposit_amount)}</dd>
                  </div>
                </dl>

                {data.card_pay && (
                  <button type="button" className="po-cta" onClick={payCard} disabled={busy}>
                    💳 Pay {cash(money.paid > 0 ? money.balance : money.deposit_amount)} by card
                  </button>
                )}
                <button type="button" className={`po-cta${data.card_pay ? ' is-alt' : ''}`} onClick={payDirect} disabled={busy}>
                  {data.card_pay ? '🏦 I paid another way' : '💳 Pay directly'}
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

      {step === 1 && draft && (
        <div className="po-bar" role="region" aria-label="Your choice">
          <div className="po-bar-in">
            <div className="po-bar-what"><b>{draft.name}</b>{draftN ? ` + ${draftN} extra${draftN > 1 ? 's' : ''}` : ''}</div>
            {!data.custom_price && (
              <div className="po-bar-sum">
                <span>Total <b>{cash(draftOwed.final)}</b></span>
                {draftOwed.dep > 0 && <span>Deposit <b>{cash(draftOwed.dep)}</b></span>}
                {taxOf(draft.tax_mode, draft.tax_rate, draftOwed.final, cash).text && <span>{taxOf(draft.tax_mode, draft.tax_rate, draftOwed.final, cash).text}</span>}
              </div>
            )}
            <button type="button" className="po-bar-btn" disabled={busy} onClick={() => pick(draft.id)}>
              {lead.package_id === draft.id ? 'Save my extras' : `Choose ${draft.name}`}
            </button>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="po-cheer">
          <div className="po-cheer-box">
            <div className="po-check">✓</div>
            <h2 className="po-cheer-t">Contract signed</h2>
            <p className="po-cheer-p">Thank you{firstName(contract?.signed_name || lead?.name) ? `, ${firstName(contract?.signed_name || lead?.name)}` : ''} — last step is securing your date.</p>
          </div>
        </div>
      )}

      <footer className="po-ft">
        Questions? Just reply to our email — we&apos;re happy to help.
      </footer>
    </div>
  );
}
