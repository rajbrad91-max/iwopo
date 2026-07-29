import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import './inquiry.css';

/**
 * 📄 The contract, exactly as the client sees it.
 *
 * The vendor's preview renders through THIS component rather than a second one.
 * A preview built separately drifts — a spacing change here, a wording change
 * there — and the vendor ends up approving something that isn't what gets sent.
 * Same component, same stylesheet, same layout; the only differences are that
 * preview loads by lead id instead of a client token, and cannot be signed.
 *
 * The body itself is now real HTML built server-side — tables for what was
 * booked, ruled headings for each clause — not a wall of plain text. It is
 * injected once via dangerouslySetInnerHTML, so the initial boxes inside it
 * are wired up afterwards: a click listener finds which one was tapped, and a
 * second effect keeps each box's own text and colour in sync with state,
 * since nothing else will touch that HTML once it's on the page.
 */
export default function SignContract({ token, previewLeadId, onRelease }) {
  const preview = !!previewLeadId;
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [initialed, setInitialed] = useState([]);
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const load = preview ? api.previewContract(previewLeadId) : api.viewContract(token);
    load.then(d => {
      const ct = d.contract || d;
      setC(ct);
      const n = (String(ct.body || '').match(/data-init-idx="\d+"/g) || []).length;
      setInitialed(Array(n).fill(false));
    }).catch(e => setErr(e.message));
  }, [token, previewLeadId, preview]);

  // 👆 one listener finds which gold box was tapped
  useEffect(() => {
    const el = docRef.current;
    if (!el || preview) return;
    const onClick = (e) => {
      const tap = e.target.closest('.ct-init-tap');
      if (!tap) return;
      const idx = Number(tap.dataset.initIdx);
      setInitialed(arr => arr.map((v, x) => x === idx ? !v : v));
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [preview, c]);

  // 🔁 and this keeps every box's text and colour matching state — the html
  // was set once, so this is the only thing that updates what a box shows
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    el.querySelectorAll('.ct-init-tap').forEach(tap => {
      const idx = Number(tap.dataset.initIdx);
      const doneHere = !!initialed[idx];
      tap.classList.toggle('is-done', doneHere);
      tap.classList.toggle('is-preview', preview);
      tap.textContent = doneHere
        ? `✓ ${name.split(' ').map(w => w[0]).join('').toUpperCase() || 'OK'}`
        : 'TAP TO INITIAL';
    });
  }, [initialed, name, preview, c]);

  // 🖊️ canvas signature pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || done || preview || c?.status === 'signed') return;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = 160 * dpr;
    // 🖊️ Dark ink. It used to be near-white, drawn on a near-black pad — which
    // looked right while signing and then produced a PNG of white strokes on
    // transparency. Anywhere that signature is later shown or printed on white
    // — the signed copy, a PDF, a court — it was invisible.
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#3D3530';
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
  }, [c, done]);

  function clearPad() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function sign() {
    setErr('');
    if (!name.trim()) return setErr('Type your full name');
    if (initialed.some(v => !v)) return setErr('Tap all gold initial boxes ✍️');
    if (!hasInk) return setErr('Draw your signature in the box');
    setBusy(true);
    try {
      const sig = canvasRef.current.toDataURL('image/png');
      await api.signContract(token, name, sig, initialed);
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !c) return <div className="iq-wrap"><div className="iq-card">⚠️ {err}</div></div>;
  if (!c) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;

  if (!preview && (done || c.status === 'signed')) return (
    <div className="iq-wrap">
      <div className="iq-card iq-done">
        <div className="iq-check">✓</div>
        <h2>Contract signed! ✅</h2>
        <p>{c.signed_name ? `Signed by ${c.signed_name}` : `Thank you, ${name}!`}</p>
      </div>
    </div>
  );

  const initialsLeft = initialed.filter(v => !v).length;

  return (
    <div className="iq-wrap">
      <div className="iq-card ct-contract-card">
        {/* 👁️ Only the vendor sees this. Everything below it is byte-for-byte
            what the client gets, which is the whole reason for previewing. */}
        {preview && (
          <div className="ct-prev-bar">
            <span className="ct-prev-tag">👁️ Preview — this is exactly what your client will see</span>
            {c.released_at
              ? <span className="ct-prev-ok">✅ Released {String(c.released_at).slice(0, 10)}</span>
              : <button type="button" className="ct-prev-release" onClick={() => onRelease && onRelease(c.id)}>
                  🚀 Release contract
                </button>}
          </div>
        )}

        {/* the real document — headband, title, every clause and its table,
            built server-side into one HTML string and injected once */}
        <div className="ct-doc" ref={docRef} dangerouslySetInnerHTML={{ __html: c.body }} />

        {initialed.length > 0 && (
          <p className={`ct-left ${initialsLeft ? 'is-todo' : 'is-done'}`}>
            {initialsLeft ? `✍️ ${initialsLeft} initial box${initialsLeft > 1 ? 'es' : ''} left` : '✅ All initialed'}
          </p>
        )}

        {preview ? (
          <p className="ct-prev-foot">
            The client signs below: full name, a drawn signature, and every gold box initialled.
            Their IP and the time are recorded with it. 🔐
          </p>
        ) : (<>
        <label style={{ marginTop: 14 }}>👤 Your full legal name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />

        <label style={{ marginTop: 12 }}>🖊️ Draw your signature</label>
        <canvas ref={canvasRef}
          className="ct-pad" style={{ width: '100%', height: 160, touchAction: 'none', display: 'block' }} />
        <button onClick={clearPad} className="ct-clear">↺ Clear</button>

        {err && <div className="iq-err">⚠️ {err}</div>}
        <button className="iq-btn" onClick={sign} disabled={busy}>
          {busy ? 'Signing…' : '✍️ Sign Contract'}
        </button>
        <p className="ct-fineprint">
          Your name, signature, IP &amp; timestamp are recorded. 🔐
        </p>
        </>)}
      </div>
    </div>
  );
}
