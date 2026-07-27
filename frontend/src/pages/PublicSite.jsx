import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './site.css';

/**
 * 🌐 A vendor's public website.
 *
 * Four sections, in the order a couple actually moves through them: see the
 * work, look at the portfolio, find their own gallery, then get in touch. It is
 * deliberately not a page builder — the theme decides the look, and the vendor's
 * words and photos fill it.
 *
 * Portfolio and the Client Section point at galleries that already exist rather
 * than duplicating them, and Book Us opens the vendor's real inquiry form, so a
 * booking made here lands in their leads like any other.
 */
const NAV = [
  ['home', 'Home'],
  ['portfolio', 'Portfolio'],
  ['clients', 'Client Section'],
  ['book', 'Book Us'],
];

export default function PublicSite({ slug }) {
  const [site, setSite] = useState(null);
  const [state, setState] = useState('loading');   // loading | ok | missing
  const [open, setOpen] = useState(false);         // mobile nav

  useEffect(() => {
    api.publicSite(slug)
      .then(d => { setSite(d.site); setState('ok'); })
      .catch(() => setState('missing'));
  }, [slug]);

  if (state === 'loading') return <div className="st-loading">Loading…</div>;
  if (state === 'missing') {
    return (
      <div className="st-missing">
        <h1>Nothing here yet</h1>
        <p>This address isn&apos;t in use, or the site hasn&apos;t been published.</p>
      </div>
    );
  }

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const title = site.site_title || site.business_name || 'Studio';
  const galleryUrl = site.gallery_token ? `/gallery/${site.gallery_token}` : null;
  const albums = site.albums || [];

  // the theme picks the layout, the vendor picks the colour and the type
  const styleVars = {
    '--st-accent': site.accent,
    '--st-head': `'${site.heading_font}', Georgia, serif`,
    '--st-body': `'${site.body_font}', system-ui, sans-serif`,
  };

  return (
    <div className={`st st-${site.theme}`} style={styleVars}>
      <header className="st-nav">
        <a href="#st-home" className="st-brand" onClick={go('home')}>
          {site.logo_path
            ? <img src={`/api/me/logo/${site.logo_path}`} alt="" className="st-brand-logo" />
            : <span className="st-brand-name">{title}</span>}
        </a>
        <button type="button" className="st-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
        <nav className={`st-links ${open ? 'is-open' : ''}`}>
          {NAV.map(([id, label]) => (
            <a key={id} href={`#st-${id}`} onClick={go(id)}>{label}</a>
          ))}
        </nav>
      </header>

      {/* ── Home ── */}
      <section id="st-home" className="st-hero">
        <div className="st-hero-inner">
          {/* The logo is read live from the vendor's profile, so replacing it in
              Settings changes it here and in the nav at once — there's no copy
              of it stored against the site to fall out of date. */}
          {site.logo_path && (
            <img className="st-hero-logo" src={`/api/me/logo/${site.logo_path}`} alt={title} />
          )}
          <h1 className="st-hero-title">{title}</h1>
          {site.tagline && <p className="st-hero-tagline">{site.tagline}</p>}
          <a href="#st-book" className="st-cta" onClick={go('book')}>Book us</a>
        </div>
      </section>

      {/* ── About, only when they've written one ── */}
      {(site.about_heading || site.about_body) && (
        <section className="st-about">
          <div className="st-wrap">
            {site.about_heading && <h2 className="st-h2">{site.about_heading}</h2>}
            {site.about_body && <p className="st-prose">{site.about_body}</p>}
          </div>
        </section>
      )}

      {/* ── Portfolio ── */}
      <section id="st-portfolio" className="st-section">
        <div className="st-wrap">
          <h2 className="st-h2">Portfolio</h2>
          {albums.length === 0 ? (
            <p className="st-quiet">Work coming soon.</p>
          ) : (
            <div className="st-grid">
              {albums.map(a => (
                <a key={a.public_token} className="st-card" href={`/g/${a.public_token}`}>
                  {/* the gallery serves its own cover, so the site doesn't need
                      to know how photos are stored. An album with no cover set
                      404s, so the image hides itself and the tinted block shows
                      rather than a broken-image icon. */}
                  <img className="st-card-img" src={`/api/g/vendor-cover/${a.public_token}`} alt="" loading="lazy"
                    onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <span className="st-card-title">{a.title}</span>
                  {a.category && <span className="st-card-cat">{a.category}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Client Section ── */}
      <section id="st-clients" className="st-section st-alt">
        <div className="st-wrap st-narrow">
          <h2 className="st-h2">Client Section</h2>
          <p className="st-prose">
            Already worked with us? Your photographs are waiting. Open your gallery to
            view, favourite and download them.
          </p>
          {galleryUrl
            ? <a className="st-cta" href={galleryUrl}>Open your gallery</a>
            : <p className="st-quiet">Your photographer will send you a private link.</p>}
        </div>
      </section>

      {/* ── Book Us ── */}
      <section id="st-book" className="st-section">
        <div className="st-wrap st-narrow">
          <h2 className="st-h2">Book Us</h2>
          <p className="st-prose">Tell us about your day and we&apos;ll come back to you.</p>
          <a className="st-cta" href={`/inquiry/${site.vendor_id}`}>Start an enquiry</a>
          <div className="st-contact">
            {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
            {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
          </div>
        </div>
      </section>

      <footer className="st-foot">
        <div className="st-wrap st-foot-inner">
          <span>© {new Date().getFullYear()} {title}</span>
          <span className="st-social">
            {site.instagram && <a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a>}
            {site.facebook && <a href={site.facebook} target="_blank" rel="noreferrer">Facebook</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
