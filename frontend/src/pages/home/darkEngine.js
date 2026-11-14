/* ✨ GENERATED from the approved Design B preview by /root/ppx/b/nh/build_dark.py — edit the preview, then rebuild. */
import { FACES } from './darkFaces';

/**
 * Starts the dark home page's scroll-driven motion inside `root` (the .hd element) and returns a function that stops
 * it. Each chapter pins while you scroll through it and plays from its progress (0 → 1), smoothed every frame.
 */
export function startDarkHome(root) {
  const IMG = n => `url(/home/dark/${n}.webp)`;
  root.querySelectorAll('.p').forEach(el => { el.dataset.bg = IMG(el.dataset.p); });   /* set when near: see lazy below */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, E = (p, a, b) => ease(seg(p, a, b)), lerp = (a, b, t) => a + (b - a) * t;
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- gallery: 12 real photos, faces from iwopo's engine ---------- */
  const byFile = Object.fromEntries(FACES.map(f => [f.file.replace('.jpg', ''), f]));
  const ORDER = ['g01', 'g06', 'g02', 'g10', 'g05', 'g03', 'g04', 'g13', 'g16', 'g11', 'g17', 'g18'];   /* 5 and 7: the two Indian photos Raj keeps */
  const grid = $('grid'), cells = [];
  ORDER.forEach((n, i) => { const c = document.createElement('div'); c.className = 'cell'; c.dataset.bg = IMG(n); grid.appendChild(c);
    const f = byFile[n] || { faces: [] }; cells.push({ el: c, n, i, row: Math.floor(i / 4), match: f.faces.some(x => x.m), faces: f.faces, rings: [] }); });
  function placeRings() {   // a face's box, mapped through background-size:cover into the cell
    cells.forEach(c => { c.rings.forEach(r => r.el.remove()); c.rings = [];
      const f = byFile[c.n]; if (!f) return; const cw = c.el.clientWidth, ch = c.el.clientHeight, s = Math.max(cw / f.w, ch / f.h), ox = (cw - f.w * s) / 2, oy = (ch - f.h * s) / 2;
      c.faces.forEach(fc => { const d = Math.max(fc.w * f.w, fc.h * f.h) * s * 1.25, cx = ox + (fc.x + fc.w / 2) * f.w * s, cy = oy + (fc.y + fc.h / 2) * f.h * s;
        if (cx < 0 || cy < 0 || cx > cw || cy > ch || d < 10) return; const r = document.createElement('span'); r.className = 'ring' + (fc.m ? ' m' : '');
        Object.assign(r.style, { width: d + 'px', height: d + 'px', left: (cx - d / 2) + 'px', top: (cy - d / 2) + 'px' }); c.el.appendChild(r); c.rings.push({ el: r, m: fc.m }); }); });
  }
  const MATCHES = cells.filter(c => c.match).map(c => c.n);   /* the gallery's own photos of the guest — never the selfie itself */
  const rrow = $('rrow'); MATCHES.slice(0, 8).forEach(n => { const i = document.createElement('i'); i.dataset.bg = IMG(n); rrow.appendChild(i); });

  /* ---------- pipeline cards ---------- */
  const COLS = ['New', 'Packages sent', 'Signed', 'Booked'];
  const LEADS = [['Maya & Adam', 'Wedding · 5 Dec', 0, 3, .04, .74], ['Lina & Omar', 'Wedding · 19 Dec', 0, 2, .14, .58], ['Sara & Sami', 'Engagement · Jan', 0, 3, .24, .86], ['Nora & Ali', 'Mehndi · Feb', 0, 1, .34, .52], ['Mia & Noah', 'Reception · Mar', 0, 0, .6, .66]];
  const cardsEl = $('cards'), cards = LEADS.map(([n, s, a, b, t0, t1], i) => { const el = document.createElement('div'); el.className = 'card'; el.innerHTML = `<b>${n.replace('&', '&amp;')}</b><span>${s}</span><em>New</em>`; cardsEl.appendChild(el); return { el, em: el.querySelector('em'), a, b, t0, t1, i, appear: i === 4 }; });

  /* ---------- calendar ---------- */
  const mgrid = $('mgrid'), days = [];
  const LEAD = 1;   // 1 Dec 2026 is a Tuesday
  for (let i = 0; i < 35; i++) { const d = i - LEAD + 1, el = document.createElement('div'); el.className = 'day' + (d === 5 ? ' wed' : '') + (d < 1 || d > 31 ? ' off' : ''); el.textContent = d >= 1 && d <= 31 ? d : ''; mgrid.appendChild(el); if (d >= 1 && d <= 31) days.push(el); }
  const EVTS = [[2, 'Mehndi', 'e-o', .30], [3, 'Jaggo', 'e-t', .34], [4, 'Choora', 'e-b', .38], [5, 'Wedding', 'e-r', .42], [11, 'Pre-wedding shoot', 'e-t', .46], [13, 'Reception', 'e-o', .49], [19, 'Wedding', 'e-r', .52], [26, 'Engagement', 'e-b', .55]];
  const evts = EVTS.map(([d, l, c, t]) => { const el = document.createElement('span'); el.className = `evt ${c}`; el.textContent = l; days[d - 1].appendChild(el); return { el, t }; });


  /* ---------- the scenes: each reads its own scroll progress p (0 → 1), smoothed ---------- */
  /* Scrolling up plays the motion back in full, but never the part where something appeared: each piece remembers the
     moment it first became fully visible (_fullT) and, going back, stops there — so nothing disappears. */
  let CUR = null;
  const held = el => CUR && CUR.rev && el._fullT !== undefined && CUR.p < el._fullT;
  const T = (el, s) => { if (!held(el)) el.style.transform = s; };
  const O = (el, v) => { if (held(el)) v = 1; else if (CUR && !CUR.rev && v > .995 && el._fullT === undefined) el._fullT = CUR.p; el.style.opacity = v; };
  const FLOOR = { hero: .55, pipe: .16, gal: .24, cal: .3, con: .12, flow: .1, vendors: .1 };   /* a chapter's own entrance never plays backwards either */
  function steps(sec, p) { const ul = sec.querySelector('.steps'); if (!ul) return; const th = ul.dataset.steps.split(',').map(Number); const lis = ul.querySelectorAll('li'); let k = 0; th.forEach((t, i) => { if (p >= t) k = i; });
    lis.forEach((li, i) => { li.className = i === k ? 'on' : i < k ? 'done' : ''; }); const last = lis[lis.length - 1]; ul.querySelector('.bar').style.height = (clamp(p / .92) * (last.offsetTop + 15 - 8)) + 'px'; }
  const SC = {
    hero(p) { const kd = Math.min(1, (innerWidth - 24) / 1040);
      if (mob()) { const a = E(p, 0, .7);
        T($('device'), `translateY(${lerp(140, -40, a)}px) rotateX(${lerp(42, 6, a)}deg) scale(${lerp(.8, 1, a) * kd})`);
        const c = E(p, .22, .6); O($('heroCopy'), 1 - c); T($('heroCopy'), `translateY(${-70 * c}px) scale(${1 - .05 * c})`);
      } else { const a = E(p, 0, .55);   // the headline stays; the dashboard fills the space under it, smaller
        T($('device'), `translateY(${lerp(90, -30, a)}px) rotateX(${lerp(34, 9, a)}deg) rotateY(${lerp(0, -5, a)}deg) scale(${lerp(.56, .6, a) * kd})`);
        O($('heroCopy'), 1); T($('heroCopy'), `translateY(${-40 * a}px)`); }
      const g = E(p, .05, .6);   // the season grows as you scroll
      root.querySelectorAll('#device [data-n]').forEach(el => { el.textContent = (el.dataset.pre || '') + Math.round(+el.dataset.n * g).toLocaleString('en-US') + (el.dataset.post || ''); });
      $('gclipr').setAttribute('width', (520 * g).toFixed(1)); $('gdot').style.opacity = g > .98 ? 1 : 0;
      $('gring').style.strokeDashoffset = (314 * (1 - .75 * g)).toFixed(1); $('gpct').textContent = Math.round(75 * g) + '%';
      root.querySelectorAll('#device .chip').forEach((el, i) => { const k = E(p, .25 + i * .08, .38 + i * .08); O(el, k); T(el, `translateZ(${lerp(0, +el.dataset.z, k)}px) translateY(${lerp(30, 0, k)}px) scale(${lerp(.82, 1, k) * (mob() ? 1.9 : 1.5)})`); }); },
    gal(p, sec) { steps(sec, p); const w = E(p, 0, .2), out = E(p, .66, .86);
      T($('gwin'), `translateZ(${lerp(-220, 0, w) - 160 * out}px) rotateX(${lerp(24, 7, w)}deg) rotateY(${lerp(-24, -10, w)}deg)`); O($('gwin'), lerp(.2, 1, w) - .35 * out);
      cells.forEach(c => { const k = E(p, .015 + c.i * .009, .13 + c.i * .009); const L = E(p, .47, .6);
        const lift = c.match ? L : 0, dim = c.match ? 0 : L;
        T(c.el, `translateZ(${lerp(-900, 0, k) + 120 * lift}px) rotateX(${lerp(60, 0, k)}deg) scale(${1 + .06 * lift})`); O(c.el, k * (1 - .75 * dim));
        c.el.style.filter = `grayscale(${dim * .8}) brightness(${1 - .45 * dim})`; c.el.style.boxShadow = lift ? `0 0 0 2px rgba(232,105,47,${lift}), 0 30px 60px -10px rgba(232,105,47,${.5 * lift})` : 'none';
        c.rings.forEach(r => { const t = E(p, .25 + (c.row + .4) / 3 * .2, .29 + (c.row + .4) / 3 * .2); const gone = r.m ? 0 : E(p, .5, .58); O(r.el, t * (1 - gone)); T(r.el, `scale(${lerp(1.9, 1, t)})`); }); });
      const b = seg(p, .25, .46); const g = $('grid'); $('beam').style.top = (g.offsetTop + b * g.clientHeight) + 'px'; O($('beam'), b > 0 && b < 1 ? 1 : 0);
      const s = E(p, .14, .23), sOut = E(p, .44, .52); O($('selfie'), s * (1 - sOut)); T($('selfie'), `translateZ(${lerp(-200, 140, s)}px) translateX(${lerp(-80, 0, s) - 60 * sOut}px) rotateY(${lerp(30, 12, s)}deg)`);
      const found = Math.round(E(p, .25, .47) * 12); $('gcount').textContent = p < .25 ? '' : p < .47 ? `Scanning · ${found} of 12 photos` : `${MATCHES.length} photos of Adam`;
      const r = E(p, .66, .8); O($('result'), r); T($('result'), `translateY(${lerp(80, 0, r)}px) translateZ(${lerp(-100, 120, r)}px) rotateX(${lerp(18, 4, r)}deg)`);
      rrow.querySelectorAll('i').forEach((el, i) => { const k = E(p, .7 + i * .015, .78 + i * .015); O(el, k); T(el, `translateY(${lerp(30, 0, k)}px) scale(${lerp(.85, 1, k)})`); }); },
    con(p, sec) { steps(sec, p);
      const typed = (s, a, b) => s.slice(0, Math.round(seg(p, a, b) * s.length));
      $('docMeta').textContent = typed('Prepared 12 November · for Maya & Adam', .02, .1); $('f1').textContent = typed('Maya & Adam', .06, .12); $('f2').textContent = typed('Mehndi · Jaggo · Wedding', .1, .17);
      $('f3').textContent = typed('Signature · $5,300', .15, .21); $('f4').textContent = typed('$1,500 on signing', .19, .25);
      $('dlines').querySelectorAll('i').forEach((el, i) => { el.style.width = (E(p, .2 + i * .02, .26 + i * .02) * [100, 92, 96, 84, 70][i]) + '%'; });
      const press = E(p, .32, .35) * (1 - E(p, .35, .38)); T($('send'), `scale(${1 - .08 * press})`); $('send').style.boxShadow = `0 0 0 ${press * 6}px rgba(232,105,47,.35)`; O($('sent'), E(p, .35, .4));
      const fly = E(p, .38, .56), enter = E(p, 0, .12);
      const fx = mob() ? 60 : 360, fy = mob() ? 250 : -10; T($('doc'), `translateX(${lerp(0, fx, fly)}px) translateY(${lerp(0, fy, fly)}px) translateZ(${lerp(-200, 0, enter) + lerp(0, -160, fly)}px) rotateY(${lerp(18, 8, enter) - 28 * fly}deg) rotateX(${lerp(14, 4, enter)}deg) scale(${lerp(1, .42, fly)})`);
      O($('doc'), enter * (1 - E(p, .52, .58)));
      const ph = E(p, .36, .5); O($('phone'), ph); T($('phone'), `translateY(${lerp(160, 0, ph)}px) rotateY(${lerp(-34, -14, ph)}deg) rotateX(${lerp(14, 6, ph)}deg)`);
      $('sig').style.strokeDashoffset = 520 * (1 - E(p, .6, .8)); const tk = E(p, .78, .8); $('tick').style.background = `rgba(232,105,47,${tk})`; $('tick').style.borderColor = tk > .5 ? 'transparent' : '';
      const st = E(p, .82, .88); O($('stamp'), st); T($('stamp'), `rotate(-14deg) scale(${lerp(2.2, 1, st)})`); O($('record'), E(p, .86, .9)); T($('record'), `translateY(${lerp(20, 0, E(p, .86, .9))}px)`);
      const d = E(p, .9, .96); O($('dep'), d); T($('dep'), `translateY(${lerp(30, 0, d)}px) translateZ(${lerp(0, 120, d)}px)`); },
    pipe(p, sec) { steps(sec, p); const w = E(p, 0, .16); T($('board'), `translateZ(${lerp(-260, 0, w)}px) rotateX(${lerp(40, 14, w)}deg) rotateY(${lerp(-14, -8, w)}deg) rotateZ(-1deg)`); O($('board'), lerp(.15, 1, w));
      const colW = ($('cards').clientWidth + 12) / 4, counts = [0, 0, 0, 0];
      const rowH = mob() ? 92 : 80;
      cards.forEach((c, i) => { const k = c.appear ? 0 : lerp(c.a, c.b, E(p, c.t0, c.t1)); const col = Math.round(k); counts[col]++; const frac = k - Math.floor(k), hop = Math.sin(Math.PI * frac);
        const show = c.appear ? E(p, c.t0, c.t1) : w; O(c.el, show); T(c.el, `translateX(${k * colW}px) translateY(${i * rowH + (c.appear ? lerp(-40, 0, show) : 0)}px) translateZ(${30 + 60 * hop}px) rotate(${hop * 3}deg)`);
        c.em.textContent = COLS[col]; c.em.className = col ? 's' + col : ''; });
      counts.forEach((n, i) => { const el = $('c' + i); if (el.textContent !== String(n)) { el.textContent = n; el.style.transform = 'scale(1.35)'; setTimeout(() => el.style.transform = '', 220); } });
      const ch = E(p, .86, .94); O($('calchip'), ch); T($('calchip'), `translateY(${lerp(40, 0, ch)}px) translateZ(${lerp(0, 140, ch)}px)`); },
    cal(p, sec) { steps(sec, p); const a = E(p, 0, .3);
      T($('month'), `translateZ(${lerp(-200, 0, a)}px) rotateX(${lerp(58, 6, a)}deg) rotateZ(${lerp(-22, 0, a)}deg) scale(${lerp(.86, 1, a)})`); O($('month'), lerp(.2, 1, a));
      evts.forEach(e => { const k = E(p, e.t, e.t + .08); O(e.el, k); T(e.el, `translateZ(${lerp(320, 0, k)}px) translateY(${lerp(-30, 0, k)}px)`); });
      const cr = E(p, .6, .74), d5 = days[4];
      const mg = $('mgrid'); const crew = $('crew'); crew.style.left = (mg.offsetLeft + d5.offsetLeft + d5.offsetWidth - (mob() ? 58 : 70)) + 'px'; crew.style.top = (mg.offsetTop + d5.offsetTop + 2) + 'px'; O(crew, cr); T(crew, `translateX(${lerp(380, 0, cr)}px) translateY(${lerp(-120, 0, cr)}px) translateZ(${lerp(200, 40, cr)}px) scale(${lerp(1.4, .8, cr)})`); },
    flow(p) { const h = E(p, 0, .1); O($('fhead'), lerp(.3, 1, h)); T($('fhead'), `translateY(${lerp(30, 0, h)}px)`);
      const v = E(p, .1, .9) * 4, steps = [...root.querySelectorAll('.fstep')], cw = steps[0].offsetWidth + 22;
      const pan = mob() ? (2 - v) * cw : 0;   // a phone shows the active step in the middle
      T($('ftrack'), `translateX(${pan}px) rotateX(${lerp(26, 10, h)}deg) rotateY(${mob() ? 0 : lerp(9, -9, v / 4)}deg)`);
      $('fline').style.width = (v / 4 * 100) + '%';
      steps.forEach((st, i) => { const lit = clamp(1 - Math.abs(v - i) * 1.3), done = v > i + .5, card = st.querySelector('.fcard'), n = st.querySelector('.fn');
        T(card, `translateZ(${lit * 110}px) translateY(${-lit * 16}px) scale(${1 + lit * .04})`);
        card.style.boxShadow = lit > .05 ? `0 0 0 2px rgba(232,105,47,${lit}), 0 40px 80px -24px rgba(232,105,47,${.45 * lit})` : '0 30px 60px -30px rgba(0,0,0,.9)';
        card.style.opacity = .45 + .55 * Math.max(lit, done ? .75 : 0); n.className = 'fn' + (lit > .5 ? ' on' : done ? ' done' : ''); st.className = 'fstep' + (lit > .5 ? ' on' : done ? ' done' : ''); }); },
    vend(p) {   // one tile after another: it springs forward with a glow in its own colour, then settles
      const n = vts.length;
      vts.forEach((t, i) => { const t0 = .04 + i * (.82 / n), k = E(p, t0, t0 + .09), focus = clamp(1 - Math.abs(p - (t0 + .07)) / .075);
        t._rx += (t._ty - t._rx) * .12; t._ry += (t._tx - t._ry) * .12;
        O(t, k); T(t, `translateY(${lerp(70, 0, k)}px) translateZ(${lerp(-220, 0, k) + 50 * focus}px) rotateX(${lerp(55, 0, k) + t._rx}deg) rotateY(${t._ry}deg) scale(${lerp(.7, 1, k) + .06 * focus})`);
        t.style.borderColor = focus > .03 ? `color-mix(in srgb, var(--c) ${Math.round(75 * focus)}%, #23272B)` : '';
        t.style.boxShadow = focus > .03 ? `0 30px 70px -24px color-mix(in srgb, var(--c) ${Math.round(55 * focus)}%, transparent)` : '';
        T(t.querySelector('.vti'), `translate3d(${t._ry * .8}px, ${-t._rx * .8}px, 0) scale(${(1 + .3 * focus).toFixed(3)})`); }); },
    final(p) { const k = E(p, 0, .8); T($('mark'), `rotateY(${lerp(-60, 0, k)}deg) rotateX(${lerp(14, 0, k)}deg) translateY(${lerp(30, 0, k)}px) scale(${lerp(.9, 1, k)})`); },   // turns to face you, then stays straight (Raj, 2026-11-13)
  };
  const scenes = [...root.querySelectorAll('.scene')].map(el => ({ el, fn: SC[el.dataset.s], p: 0, t: 0, stage: el.querySelector('.stage, .flow-stage, .vgrid') }));
  const mob = () => innerWidth <= 820;
  const PRE = new Set(['gal', 'flow', 'con', 'cal', 'pipe', 'vendors']);
  const HOLD = .8;   /* a chapter's story is done at 80% of its time on screen, then it rests fully shown until it lets go */
  const prog = (s, y) => clamp((y - s.top) / (s.len * (PRE.has(s.el.id) ? HOLD : 1)));   /* chapters: they play in while arriving, and drift gently when scrolled back up */
  function measure() {
    scenes.forEach(s => { const pre = PRE.has(s.el.id) ? innerHeight * .6 : 0;   // a chapter starts playing while it scrolls into view, so it is already showing when it arrives
      s.top = s.el.offsetTop - pre; s.len = Math.max(1, s.el.offsetHeight - innerHeight + pre); });
    const cols = mob() ? 3 : 4; cells.forEach(c => { c.row = Math.floor(c.i / cols); });
    root.querySelectorAll('.stage').forEach(st => { st.style.setProperty('--kd', Math.min(1, st.clientWidth / 940).toFixed(3)); st.style.setProperty('--k', (Math.min(1, st.clientWidth / 520, st.clientHeight / 760) * (mob() ? .92 : 1)).toFixed(3)); /* a phone keeps room for cards that come forward in 3D */ });
    placeRings();
  }

  /* vendor tiles: they rise and tilt into place as they scroll in, and lean towards the pointer (never spin) */
  const vts = [...root.querySelectorAll('.vt')];   // vendor tiles
  vts.forEach(t => { t._rx = t._ry = t._tx = t._ty = 0;
    t.addEventListener('pointermove', e => { const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t._tx = (x - .5) * 10; t._ty = (.5 - y) * 10; t.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); t.style.setProperty('--my', (y * 100).toFixed(1) + '%'); });
    t.addEventListener('pointerleave', () => { t._tx = t._ty = 0; }); });
  /* photos load only when their part of the page comes near */
  const lazy = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return;
    e.target.querySelectorAll('[data-bg]').forEach(el => { el.style.backgroundImage = el.dataset.bg; el.removeAttribute('data-bg'); }); lazy.unobserve(e.target); }), { rootMargin: '150% 0px' });
  root.querySelectorAll('section').forEach(sec => lazy.observe(sec));
  /* the motion rests when nothing is moving, and wakes on scroll, pointer or resize */
  let raf = 0, stopped = false, still = 0, lastY = -1, lastTs = 0;
  /* Each chapter moves at its own steady speed (story per second), easing gently into place; scrolling only sets the destination */
  const RATE = { hero: .5, pipe: .4, gal: .38, cal: .4, con: .38, flow: .4, vendors: .2, final: .5 };
  const pace = (p, t, dt, rate) => { const v = Math.max(-rate, Math.min(rate, (t - p) * 5)), n = p + v * dt; return Math.abs(t - n) < .0004 ? t : n; };
  const wake = () => { if (!raf && !stopped) raf = requestAnimationFrame(loop); };
  function loop(ts) { const dt = Math.min(.05, lastTs ? (ts - lastTs) / 1000 : 1 / 60); lastTs = ts;
    const y = scrollY, vh = innerHeight;
    if (y < 8) scenes.forEach(s => { s.maxT = 0; }); /* back at the very top: everything can play again */
    scenes.forEach(s => { const raw = prog(s, y); s.maxT = Math.max(s.maxT || 0, raw); s.rev = raw < s.maxT - .001;
      s.t = s.rev ? Math.max(raw, Math.min(s.maxT, FLOOR[s.el.id] || 0)) : raw; /* back up: full reverse, down to the chapter's first fully shown frame */
      if (s.stage) { s.d = (s.d || 0) + ((s.rev ? s.maxT - raw : 0) - (s.d || 0)) * .12; if (Math.abs(s.d) > .0005 || s.stage.style.transform) T(s.stage, s.d > .0005 ? `translateY(${(s.d * 46).toFixed(1)}px) rotateX(${(s.d * 6).toFixed(2)}deg) scale(${(1 - s.d * .05).toFixed(4)})` : ''); }
      s.p = reduce ? s.t : pace(s.p, s.t, dt, RATE[s.el.id] || .4); if (Math.abs(s.t - s.p) < .0004) s.p = s.t;
      if (y + vh > s.top - vh && y < s.top + s.el.offsetHeight + vh) { CUR = s; s.fn(s.p, s.el); CUR = null; } });
    $('hint').style.opacity = y > 60 ? 0 : 1;
    const cur = scenes.find(s => ['pipe', 'gal', 'cal', 'con', 'vendors', 'flow'].includes(s.el.id) && y >= s.top - vh * .3 && y < s.top + s.el.offsetHeight - vh * .7);
    $('rail').classList.toggle('on', !!cur); root.querySelectorAll('.rail span').forEach(sp => sp.classList.toggle('on', cur && sp.dataset.c === cur.el.id));
    const busy = y !== lastY || scenes.some(s => Math.abs(s.t - s.p) > .0004 || (s.d || 0) > .0005) || vts.some(t => Math.abs(t._tx - t._rx) + Math.abs(t._ty - t._ry) > .02);
    lastY = y; still = busy ? 0 : still + 1;
    raf = !stopped && still < 30 ? requestAnimationFrame(loop) : 0; if (!raf) lastTs = 0;
  }
  /* take a closer look: each tab opens its feature */
  root.querySelectorAll('.xtab').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('.xtab').forEach(t => { const on = t === b; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    root.querySelectorAll('.xpanel').forEach(pn => pn.classList.toggle('on', pn.dataset.x === b.dataset.x));
    b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }));
  /* the chapter bar takes you straight to a chapter */
  root.querySelectorAll('.rail span').forEach(sp => { const go = () => scrollTo({ top: $(sp.dataset.c).offsetTop + 2, behavior: 'smooth' });
    sp.addEventListener('click', go); sp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
  const onResize = () => { measure(); wake(); };
  addEventListener('scroll', wake, { passive: true }); addEventListener('pointermove', wake, { passive: true }); addEventListener('resize', onResize);
  measure(); const ro = new ResizeObserver(onResize); ro.observe(root); wake();
  window.__setScroll = (id, p) => { const s = scenes.find(x => x.el.id === id); scrollTo(0, s.top + s.len * p); scenes.forEach(x => { x.maxT = x.t = x.p = prog(x, scrollY); x.fn(x.p, x.el); }); wake(); };   // for still pictures
  return () => { stopped = true; cancelAnimationFrame(raf); removeEventListener('scroll', wake); removeEventListener('pointermove', wake); removeEventListener('resize', onResize); ro.disconnect(); lazy.disconnect(); delete window.__setScroll; };
}
