/**
 * 🧪 Which hosts show the new home page (Raj, 2026-11-12). Applied to iwopo.com on 2026-11-14 at Raj's word; the old page
 * (Selling.jsx) remains only for any other host.
 */
export const NEW_HOME_HOSTS = ['iwopo.com', 'www.iwopo.com', 'alphabetaone.com', 'www.alphabetaone.com', 'localhost', '127.0.0.1'];
export const newHomePreview = () => typeof window !== 'undefined' && NEW_HOME_HOSTS.includes(window.location.hostname);
/** Which work-in-progress home page a preview host shows: the dark one (Design B), or the light one (Design A) when the
 *  address ends in ?design=light — so both can still be compared (Raj, 2026-11-13). */
export const homeDesign = () => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('design') === 'light' ? 'light' : 'dark');
