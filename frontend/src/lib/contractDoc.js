import { useEffect } from 'react';

/**
 * 🔗 The one place that knows how to wire up a contract's initial boxes.
 *
 * There were two independent copies of this logic — SignContract.jsx and
 * ClientPortal's own ContractStep — because the portal's real client journey
 * was built before SignContract existed and nobody noticed the two had drifted
 * apart. When the contract body changed from plain text to HTML, only the copy
 * that got touched was fixed; the other one kept splitting on a literal
 * "[INITIAL]" string that no longer exists in the body, and dumped the raw
 * HTML onto the page as visible text instead of rendering it. That is exactly
 * the class of bug a second copy of anything guarantees, eventually.
 *
 * Both pages now call this. The document itself is injected once via
 * dangerouslySetInnerHTML on the caller's own ref; this hook only attaches the
 * click listener and keeps every box's text, colour and "up next" ring in sync
 * with `initialed` — nothing else will touch that HTML once it's on the page.
 */
export function useContractInitials(docRef, initialed, setInitialed, name, { preview = false } = {}) {
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
  }, [docRef, setInitialed, preview, initialed]);

  // 🔁 keeps every box's text, colour, and which one is "up next" matching
  // state — the html was set once, so this is the only thing that updates it
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const initials = name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase() || 'OK';
    const nextDue = initialed.findIndex(v => !v);
    el.querySelectorAll('.ct-init-tap').forEach(tap => {
      const idx = Number(tap.dataset.initIdx);
      const doneHere = !!initialed[idx];
      tap.classList.toggle('is-done', doneHere);
      tap.classList.toggle('ct-hand', doneHere);
      tap.classList.toggle('is-preview', preview);
      tap.classList.toggle('is-next', !preview && !doneHere && idx === nextDue);
      tap.textContent = doneHere ? initials : 'TAP TO INITIAL';
    });
  }, [docRef, initialed, name, preview]);
}

/** How many gold boxes a built contract body actually has. */
export function countInitBoxes(bodyHtml) {
  return (String(bodyHtml || '').match(/data-init-idx="\d+"/g) || []).length;
}

/**
 * ✍️ Take the client to what is still missing before signing (2026-11-04).
 *
 * The Sign button used to grey out and the only hint was "1 initial left" — with no way to tell which box. Now the
 * button stays pressable and this sends them to the first thing to do: the first empty initial box (scrolled to
 * the middle of the screen and glowing for a moment), the name field, or the signature pad. It returns the
 * sentence to show them, or '' when everything is done.
 */
export function guideToMissing({ docRef, initialed, name, hasInk, nameId, padId }) {
  const go = (el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const left = initialed.filter(v => !v).length;
  if (left > 0) {
    const tap = docRef.current?.querySelector('.ct-init-tap:not(.is-done)');
    if (tap) {
      go(tap);
      tap.classList.remove('is-attention'); void tap.offsetWidth; tap.classList.add('is-attention');   // restart the glow
      setTimeout(() => tap.classList.remove('is-attention'), 2600);
    }
    return left === 1
      ? '✍️ One initial is still missing — we’ve taken you to it. Tap the glowing box to add your initials.'
      : `✍️ ${left} initials are still missing — we’ve taken you to the first one. Tap each glowing box to add your initials.`;
  }
  if (!String(name || '').trim()) {
    const el = document.getElementById(nameId); go(el); el?.focus({ preventScroll: true });
    return '✍️ Please type your full legal name — it goes on the agreement.';
  }
  if (!hasInk) { go(document.getElementById(padId)); return '✍️ Please draw your signature in the box.'; }
  return '';
}
