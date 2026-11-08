/**
 * 🔗 The optional links on a vendor's client pages — the inquiry form, a gallery, the all-galleries page
 * (Raj, 2026-11-08). A thin bar at the top: up to two buttons on the left, social icons on the right; and a footer
 * with contact details and the same icons. The data comes cleaned from the server (lib/clientLinks.js): null when
 * the vendor has set nothing, and then nothing here renders at all — the pages stay exactly as they were.
 *
 * ← Back: when the visitor arrived from the vendor's own website (one of the addresses the vendor entered), the bar
 * also offers the way back to the very page they came from.
 */
import './clientLinks.css';

const ICON = {
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" className="cl-dot" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9l5 3-5 3z" className="cl-fill" /></>,
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5" />,
  pinterest: <><circle cx="12" cy="12" r="9" /><path d="M11 21l2-9M10 13.5c-1-3 1-6 4-5.5s3.5 4.5 1 6.5c-1.3 1-2.8.6-3.3-.6" /></>,
  whatsapp: <><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1-1.2 2 .9c-.3 1.4-1.4 2-2.8 1.8C10.9 15 9 13.1 8.5 10.3 8.3 8.9 8.9 7.8 10.3 7.5l.9 2z" className="cl-fill" /></>,
};
const NAME = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', pinterest: 'Pinterest', whatsapp: 'WhatsApp' };

function Icon({ kind }) {
  return <svg className="cl-ico" viewBox="0 0 24 24" aria-hidden="true">{ICON[kind]}</svg>;
}

export function SocialIcons({ socials }) {
  if (!socials?.length) return null;
  return (
    <div className="cl-socials">
      {socials.map(s => (
        <a key={s.kind} className="cl-social" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={NAME[s.kind]} title={NAME[s.kind]}><Icon kind={s.kind} /></a>
      ))}
    </div>
  );
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

/** The page the visitor came from, when it is on one of the vendor's own addresses (and not this one). */
export function backLink(links) {
  if (!links || typeof document === 'undefined' || !document.referrer) return null;
  const from = hostOf(document.referrer);
  if (!from || from === window.location.hostname.replace(/^www\./, '').toLowerCase()) return null;
  const theirs = [links.title_url, links.private_url, ...(links.buttons || []).map(b => b.url)].map(hostOf).filter(Boolean);
  return theirs.includes(from) ? { href: document.referrer, label: from } : null;
}

/** The thin bar at the top. `brand`: show the business name as the first link (pages that do not show it already). */
export function ClientTopBar({ links, brand = null, variant = 'page' }) {
  if (!links) return null;
  const back = backLink(links);
  const left = [
    back && <a key="back" className="cl-link cl-back" href={back.href}>← {back.label}</a>,
    brand && links.title_url && <a key="brand" className="cl-link cl-brand" href={links.title_url}>{brand}</a>,
    ...(links.buttons || []).map(b => <a key={b.url} className="cl-btn" href={b.url}>{b.label}</a>),
  ].filter(Boolean);
  if (!left.length && !links.socials?.length) return null;
  return (
    <nav className={`cl-bar is-${variant}`} aria-label="Studio links">
      <div className="cl-left">{left}</div>
      <SocialIcons socials={links.socials} />
    </nav>
  );
}

/** The footer: contact details and the social icons. */
export function ClientFooter({ links }) {
  const c = links?.contact;
  if (!c && !links?.socials?.length) return null;
  const tel = c?.phone ? c.phone.replace(/[^\d+]/g, '') : '';
  return (
    <footer className="cl-foot">
      {c && (
        <div className="cl-contact">
          {c.phone && <a href={`tel:${tel}`}>{c.phone}</a>}
          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
          {c.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer">{c.address}</a>}
        </div>
      )}
      <SocialIcons socials={links.socials} />
    </footer>
  );
}
