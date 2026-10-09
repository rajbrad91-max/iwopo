/** A short two-note chime, made in the browser — no sound file to load or host.
 *  Browsers stay silent until the page has been clicked once; that is their rule.
 *  Used by the notification bell and the call screen pop. */
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.16]].forEach(([hz, at]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* no audio — the screen still shows it */ }
}
