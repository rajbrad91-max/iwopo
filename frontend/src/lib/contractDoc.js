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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, docRef.current]);

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
      tap.classList.toggle('is-preview', preview);
      tap.classList.toggle('is-next', !preview && !doneHere && idx === nextDue);
      tap.textContent = doneHere ? `✓ ${initials}` : 'TAP TO INITIAL';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialed, name, preview, docRef.current]);
}

/** How many gold boxes a built contract body actually has. */
export function countInitBoxes(bodyHtml) {
  return (String(bodyHtml || '').match(/data-init-idx="\d+"/g) || []).length;
}
