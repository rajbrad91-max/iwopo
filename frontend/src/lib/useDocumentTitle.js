import { useEffect } from 'react';

/**
 * 🏷️ Set the browser tab's title for one page.
 *
 * This is a single-page app, so index.html's <title>iwopo</title> was the title
 * of every route in it — including the ones a vendor's own client lands on. A
 * client opening their gallery, their portal, or a contract to sign saw the name
 * of the software rather than the name of the business they hired. On a page
 * that is otherwise carefully branded down to the accent colour, the tab was
 * the one place the vendor could not control.
 *
 * Two details matter more than they look:
 *
 * The name arrives from a fetch, so this is called with undefined on the first
 * render and again once the data lands. Passing a falsy value deliberately does
 * nothing, which leaves the previous title in place rather than flashing a
 * placeholder — and means callers do not need a guard of their own.
 *
 * The original title is restored on unmount. Without that, navigating from one
 * vendor's gallery to another page inside the same SPA session would leave the
 * first vendor's name in the tab, which is worse than the generic name it
 * replaced: it would be someone else's.
 */
export function useDocumentTitle(title, { suffix } = {}) {
  useEffect(() => {
    if (!title) return;                       // nothing to say yet — leave it be
    const previous = document.title;
    document.title = suffix ? `${title} · ${suffix}` : title;
    return () => { document.title = previous; };
  }, [title, suffix]);
}
