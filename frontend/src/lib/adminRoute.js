// 🧭 Super Admin addresses (Raj, 2026-11-16: "unique url addresses for pages in Super admin panel").
// The URL is the source of truth for the page shown, the same way the vendor panel works (lib/appRoute.js):
// a click pushes a history entry, Back/Forward re-read the URL, and every page can be bookmarked or shared.
//
//   /admin                     -> { view: 'dashboard', sub: null }
//   /admin/waitlist            -> { view: 'waitlist',  sub: null }
//   /admin/settings/email      -> { view: 'settings',  sub: 'email' }
import { useState, useEffect, useCallback } from 'react';

const BASE = 'admin';
const HOME = 'dashboard';

/** The address of a page: adminPath('settings', 'email') → '/admin/settings/email'. */
export function adminPath(view, sub) {
  if (!view || view === HOME) return '/' + BASE;
  return `/${BASE}/${view}${sub ? '/' + sub : ''}`;
}

/** The page the address bar names — or the dashboard when it names none of `views`. */
function readRoute(views) {
  const [base, view, sub] = window.location.pathname.split('/').filter(Boolean);
  if (base !== BASE || !views.includes(view)) return { view: HOME, sub: null };
  return { view, sub: sub || null };
}

/**
 * useAdminRoute(views) → [route, go]
 *  - route: { view, sub } read from the URL
 *  - go(view, sub): open a page, leaving a Back step
 * An address that names no page (a sign-in from /panel, an old link) is rewritten to the page actually shown.
 */
export function useAdminRoute(views) {
  const [route, setRoute] = useState(() => readRoute(views));

  useEffect(() => {
    const want = adminPath(route.view, route.sub);
    if (window.location.pathname !== want) window.history.replaceState({ admin: true }, '', want);
  }, [route]);

  useEffect(() => {
    const onPop = () => setRoute(readRoute(views));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [views]);

  const go = useCallback((view, sub = null) => {
    window.history.pushState({ admin: true }, '', adminPath(view, sub));
    setRoute({ view, sub });
  }, []);

  return [route, go];
}
