/* 🌗 iwopo — paint the right background BEFORE anything loads (no black flash
 * on a refresh; Raj, 2026-10-11).
 *
 * The site's styles start dark, the light theme is switched on by JavaScript
 * once the panel has loaded, and while a page's code downloads the app shows
 * nothing — so a hard refresh showed a blank, dark page first. This runs from
 * <head> before the first paint: it sets the panel's remembered theme
 * (vf_theme) and gives the page its colour (index.css lets the body use
 * --boot-bg while data-boot is on), then steps aside once the page has loaded.
 *
 * It is a file, not an inline <script>: the Content-Security-Policy allows
 * scripts from this site only ('self'), and an inline one is silently blocked.
 */
(function () {
  try {
    var d = document.documentElement, p = location.pathname, bg = '';
    var signedIn = !!(sessionStorage.getItem('iwopo_token') || localStorage.getItem('iwopo_token'));
    var light = localStorage.getItem('vf_theme') === 'light';
    if (p.indexOf('/panel') === 0 || ((p === '/' || p === '/login') && signedIn)) {
      if (light) d.setAttribute('data-theme', 'light');
      bg = light ? '#eef2f3' : '#0a1013';
    } else if (p === '/' || p === '/login' || p.indexOf('/inquiry/') === 0) {
      bg = '#FFF7F0';                       // the sign-up / plans page, the inquiry form
    }
    // the panel in its dark theme: say so, so any blank frame is dark, not white
    if (bg === '#0a1013') { var m = document.querySelector('meta[name="color-scheme"]'); if (m) m.setAttribute('content', 'dark'); }
    if (bg) {
      d.style.setProperty('--boot-bg', bg);
      d.setAttribute('data-boot', '');
      window.addEventListener('load', function () { setTimeout(function () { d.removeAttribute('data-boot'); }, 1500); });
    }
  } catch (e) { /* storage blocked — the page still loads normally */ }
})();
