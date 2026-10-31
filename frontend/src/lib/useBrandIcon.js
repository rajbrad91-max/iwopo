import { useEffect } from 'react';

/**
 * 🌐 On the top plan (no "Powered by iwopo") the browser tab shows the studio's logo instead of iwopo's icon
 * (2026-10-31). Restores the original icon when the page goes away.
 */
export function useBrandIcon(logoUrl, on) {
  useEffect(() => {
    if (!on || !logoUrl) return undefined;
    const links = [...document.querySelectorAll('link[rel~="icon"]')];
    const before = links.map(l => l.href);
    links.forEach(l => { l.href = logoUrl; });
    return () => links.forEach((l, i) => { l.href = before[i]; });
  }, [logoUrl, on]);
}
