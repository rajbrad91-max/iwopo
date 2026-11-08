import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 🔍 Zoom for the picture in the full-screen viewer (Raj, 2026-11-08): pinch and double-tap on a phone, the wheel
 * and double-click on a computer, and drag to look around while zoomed.
 *
 * It only enlarges the picture already on screen — nothing new is downloaded, the original never — up to MAX_ZOOM
 * (3×, where the 2200px picture still looks clean on a phone). The picture is moved through three CSS variables
 * written straight onto it (--zx, --zy, --zs; gallery.css .pg-lb-pic.is-zoom), so a gesture never re-renders the
 * page and stays smooth on older phones. The zoom styling is on the picture only while it is zoomed, so the
 * viewer unzoomed is exactly what it was. While zoomed, or right after a pinch, busy() is true and the viewer's swipe stands
 * aside; zoomed out, the viewer works exactly as before. A new picture (resetKey) starts unzoomed.
 */
export const MAX_ZOOM = 3;
const TAP_ZOOM = 2.5;     // a double-tap / double-click goes this far
const TAP_MS = 300;       // two taps within this long are a double-tap
const SLOP = 10;          // px a finger may wander and still be a tap

export function useZoomPan(resetKey, enabled = true) {
  const stageRef = useRef(null);
  const picRef = useRef(null);
  const z = useRef({ s: 1, x: 0, y: 0 });
  const g = useRef({ pts: new Map(), pinch: null, pan: null, tap: null, lastTap: null, pinched: false, kind: '' });
  const settle = useRef(null);   // the timer that takes the zoom styling off once it is back to normal
  const [zoomed, setZoomed] = useState(false);

  const apply = useCallback((animate) => {
    const el = picRef.current;
    if (!el) return;
    el.classList.toggle('is-gesture', !animate);
    clearTimeout(settle.current);
    if (z.current.s > 1) el.classList.add('is-zoom');
    else if (animate) settle.current = setTimeout(() => { if (z.current.s === 1) el.classList.remove('is-zoom'); }, 260);   // after the glide back
    else el.classList.remove('is-zoom');
    el.style.setProperty('--zx', `${z.current.x}px`);
    el.style.setProperty('--zy', `${z.current.y}px`);
    el.style.setProperty('--zs', String(z.current.s));
    setZoomed(z.current.s > 1.01);
  }, []);

  /* Keep the picture where it can be seen: smaller than the screen → it stays fully inside; larger → its edges
     never come away from the screen's. The stage is not transformed, so it gives the picture's unzoomed place. */
  const clamp = useCallback((s, x, y) => {
    if (s <= 1 || !stageRef.current) return { s: 1, x: 0, y: 0 };
    const r = stageRef.current.getBoundingClientRect();
    const lim = (c, size, view, v) => { const a = size / 2 - c, b = view - c - size / 2; return Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b)); };
    return { s, x: lim(r.left + r.width / 2, r.width * s, window.innerWidth, x), y: lim(r.top + r.height / 2, r.height * s, window.innerHeight, y) };
  }, []);

  /** Zoom to s1 keeping the point under (mx, my) where it is. */
  const zoomAt = useCallback((s1, mx, my, animate) => {
    if (!stageRef.current) return;
    const { s: s0, x: x0, y: y0 } = z.current;
    const s = Math.min(MAX_ZOOM, Math.max(1, s1));
    const r = stageRef.current.getBoundingClientRect();
    const qx = (mx - (r.left + r.width / 2) - x0) / s0, qy = (my - (r.top + r.height / 2) - y0) / s0;
    z.current = clamp(s, x0 + (s0 - s) * qx, y0 + (s0 - s) * qy);
    apply(animate);
  }, [apply, clamp]);

  const toggleAt = useCallback((mx, my) => zoomAt(z.current.s > 1.01 ? 1 : TAP_ZOOM, mx, my, true), [zoomAt]);

  // a new picture starts unzoomed
  useEffect(() => { z.current = { s: 1, x: 0, y: 0 }; g.current.pinched = false; apply(false); }, [resetKey, apply]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !enabled) return undefined;
    const st = g.current;
    const mid = () => { const [a, b] = [...st.pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (st.pts.size === 0) st.pinched = false;                       // a new gesture
      st.kind = e.pointerType;
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      if (st.pts.size === 2) { const m = mid(); st.pinch = { d: m.d, s: z.current.s, x: m.x, y: m.y }; st.pinched = true; st.tap = null; }
      else if (st.pts.size === 1) { st.pan = { x: e.clientX, y: e.clientY, zx: z.current.x, zy: z.current.y }; st.tap = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp }; }
    };
    const move = (e) => {
      if (!st.pts.has(e.pointerId)) return;
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.tap && Math.hypot(e.clientX - st.tap.x, e.clientY - st.tap.y) > SLOP) st.tap = null;
      if (st.pts.size >= 2 && st.pinch) {
        const m = mid();
        zoomAt(st.pinch.s * (m.d / st.pinch.d), m.x, m.y, false);   // grow or shrink around the fingers…
        z.current = clamp(z.current.s, z.current.x + m.x - st.pinch.x, z.current.y + m.y - st.pinch.y);   // …and follow them
        st.pinch.x = m.x; st.pinch.y = m.y; st.pinch.s = z.current.s; st.pinch.d = m.d;
        apply(false);
      } else if (st.pts.size === 1 && st.pan && z.current.s > 1.01) {
        z.current = clamp(z.current.s, st.pan.zx + e.clientX - st.pan.x, st.pan.zy + e.clientY - st.pan.y);
        apply(false);
      }
    };
    const up = (e) => {
      if (!st.pts.delete(e.pointerId)) return;
      if (st.pts.size < 2) st.pinch = null;
      if (st.pts.size === 1) { const [p] = st.pts.values(); st.pan = { x: p.x, y: p.y, zx: z.current.x, zy: z.current.y }; }
      if (st.pts.size > 0) return;
      st.pan = null;
      if (z.current.s < 1.05 && z.current.s !== 1) { z.current = { s: 1, x: 0, y: 0 }; apply(true); }   // nearly out → settle out
      if (st.tap && e.type === 'pointerup' && e.timeStamp - st.tap.t < TAP_MS) {
        const last = st.lastTap;
        if (last && e.timeStamp - last.t < TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < SLOP * 3) { toggleAt(e.clientX, e.clientY); st.lastTap = null; }
        else st.lastTap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      }
      st.tap = null;
    };
    const wheel = (e) => { e.preventDefault(); zoomAt(z.current.s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, false); };
    const dbl = (e) => { if (st.kind === 'mouse') toggleAt(e.clientX, e.clientY); };   // a touch double-tap is handled above (browsers send both)
    const resize = () => { z.current = clamp(z.current.s, z.current.x, z.current.y); apply(false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });   // passive:false so the page itself does not zoom
    el.addEventListener('dblclick', dbl);
    window.addEventListener('resize', resize);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl);
      window.removeEventListener('resize', resize);
      st.pts.clear(); st.pinch = null; st.pan = null; clearTimeout(settle.current);
    };
  }, [enabled, resetKey, apply, clamp, zoomAt, toggleAt]);

  /** True while zoomed or straight after a pinch: the viewer's swipe should stand aside. */
  const busy = useCallback(() => z.current.s > 1.01 || g.current.pinched || g.current.pts.size > 1, []);

  return { stageRef, picRef, zoomed, busy };
}
