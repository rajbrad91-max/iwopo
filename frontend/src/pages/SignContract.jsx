import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useContractInitials, countInitBoxes } from '../lib/contractDoc';
import './contractdoc.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * The contract, as the client signs it.
 *
 * The vendor preview renders through this same component. A second renderer
 * would drift, and a preview that differs from the page that gets signed is
 * worse than none.
 *
 * The body is HTML built on the server. Initial boxes inside it are wired
 * after it lands: a click finds which one was tapped, and a second effect
 * keeps each box in sync with state.
 */
export default function SignContract({ token, previewLeadId, onRelease, onLoaded }) {
  const preview = !!previewLeadId;
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [initialed, setInitialed] = useState([]);
  const [packages, setPackages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [ver, setVer] = useState(null);
  const [switching, setSwitching] = useState(false);
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const pageRef = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  useDocumentTitle(c?.business_name);

  useEffect(() => {
    let dead = false;
    setSwitching(true);
    const load = preview ? api.previewContract(previewLeadId, ver) : api.viewContract(token);
    load.then(d => {
      if (dead) return;
      const ct = d.contract || d;
      setC(ct);
      setErr('');
      setInitialed(Array(countInitBoxes(ct.body)).fill(false));
      if (preview) {
        setPackages(Array.isArray(d.packages) ? d.packages : []);
        setActiveId(d.active_package_id ?? null);
      }
      if (onLoaded) onLoaded(ct);
    }).catch(e => { if (!dead) setErr(e.message); })
      .finally(() => { if (!dead) setSwitching(false); });
    return () => { dead = true; };
  }, [token, previewLeadId, preview, ver]);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    if (c?.brand_color) el.style.setProperty('--brand', c.brand_color);
    else el.style.removeProperty('--brand');
  }, [c?.brand_color]);

  useContractInitials(docRef, initialed, setInitialed, name, { preview });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || done || preview || c?.status === 'signed') return;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2937';
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
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start); canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start); canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, [c, done, preview]);

  function clearPad() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function sign() {
    setErr('');
    if (!name.trim()) return setErr('Type your full name');
    if (initialed.some(v => !v)) return setErr('Initial each marked section');
    if (!hasInk) return setErr('Draw your signature in the box');
    setBusy(true);
    try {
      const sig = canvasRef.current.toDataURL('image/png');
      await api.signContract(token, name, sig, initialed);
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !c) return <div className="ct-page"><article className="ct-sheet">{err}</article></div>;
  if (!c) return <div className="ct-page"><article className="ct-sheet">Loading…</article></div>;

  if (!preview && (done || c.status === 'signed')) return (
    <div className="ct-page">
      <article className="ct-sheet ct-done">
        <div className="ct-done-mark">✓</div>
        <h2>Contract signed</h2>
        <p>{c.signed_name ? `Signed by ${c.signed_name}` : `Thank you, ${name}.`}</p>
      </article>
    </div>
  );

  const initialsLeft = initialed.filter(v => !v).length;
  const shown = ver ?? activeId;

  return (
    <div className="ct-page" ref={pageRef}>
      {preview && (
        <div className="ct-prev-bar">
          <span className="ct-prev-tag">Preview — this is what your client will see</span>
          {c.released_at
            ? <span className="ct-prev-ok">Released {String(c.released_at).slice(0, 10)}</span>
            : <button type="button" className="ct-prev-release" onClick={() => onRelease && onRelease(c.id)}>
                Release contract
              </button>}
        </div>
      )}

      {preview && packages.length > 0 && (
        <div className="ct-versions" role="tablist" aria-label="Package versions">
          <span className="ct-versions-label">Versions</span>
          {packages.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === shown}
              className={p.id === shown ? 'ct-ver is-on' : 'ct-ver'}
              disabled={switching}
              onClick={() => { if (p.id !== shown) setVer(p.id); }}
            >
              {p.name}
              {p.price_label ? <span className="ct-ver-price">{p.price_label}</span> : null}
            </button>
          ))}
        </div>
      )}

      <article className={switching && preview ? 'ct-sheet is-busy' : 'ct-sheet'}>
        <div className="ct-doc" ref={docRef} dangerouslySetInnerHTML={{ __html: c.body }} />

        {initialed.length > 0 && (
          <p className={`ct-left ${initialsLeft ? 'is-todo' : 'is-done'}`}>
            {initialsLeft
              ? `${initialsLeft} initial box${initialsLeft > 1 ? 'es' : ''} left`
              : 'All initialed'}
          </p>
        )}

        <section className="ct-accept">
          <h2 className="ct-accept-title">Acceptance & Signature</h2>
          <p className="ct-accept-lead">Sign below to confirm this agreement.</p>

          <label className="ct-field-label" htmlFor="ct-sign-name">Full legal name</label>
          <input id="ct-sign-name" className="ct-field" value={name}
            placeholder="Full name" disabled={preview}
            onChange={e => setName(e.target.value)} />

          <div className="ct-pad-row">
            <label className="ct-field-label" htmlFor="ct-sign-pad">Signature</label>
            {!preview && <button type="button" className="ct-clear" onClick={clearPad}>Clear</button>}
          </div>
          <canvas id="ct-sign-pad" ref={canvasRef} className="ct-pad" />

          {preview ? (
            <p className="ct-fine">Preview only. The client signs the version for the package they choose.</p>
          ) : (
            <>
              {err && <div className="ct-err">{err}</div>}
              <button type="button" className="ct-sign-btn" onClick={sign}
                disabled={busy || !name.trim() || initialsLeft > 0 || !hasInk}>
                {busy ? 'Signing…' : 'Sign contract'}
              </button>
              <p className="ct-fine">Your name, signature, IP address and the time are recorded with this agreement.</p>
            </>
          )}
        </section>
      </article>
    </div>
  );
}
