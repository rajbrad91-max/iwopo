import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './site.css';

/**
 * The typefaces a vendor can choose. They have to be FETCHED, not just named:
 * setting font-family to "Playfair Display" without loading it silently falls
 * back to Georgia, which is exactly why all five themes looked alike and plain.
 * Loaded once, on this page only, so the panel doesn't pay for them.
 */
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Inter:wght@300;400;500;600&family=Poppins:wght@300;400;500;600&family=Montserrat:wght@300;400;500;600&family=Lora:ital,wght@0,400;0,600;1,400&display=swap';

function useWebFonts() {
  useEffect(() => {
    if (document.getElementById('st-fonts')) return;
    const l = document.createElement('link');
    l.id = 'st-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
    document.head.appendChild(l);
  }, []);
}

/**
 * 🌐 A vendor's public website.
 *
 * Four PAGES, not four anchors on one scroll. A photographer's portfolio is
 * thirty or forty photographs; putting it under the home page means every
 * visitor scrolls past the whole thing to reach anything else, and the home
 * page never ends. Each section is its own address, so Portfolio can be as long
 * as the work deserves without burying Book Us underneath it.
 *
 * Home shows a handful of frames as a taste, and sends people to the full
 * portfolio — which is how a visitor decides whether to look further.
 */
const NAV = [
  ['home', 'Home', ''],
  ['portfolio', 'Portfolio', '/portfolio'],
  ['clients', 'Client Section', '/clients'],
  ['book', 'Book Us', '/book'],
];

const HOME_PREVIEW = 6;

export default function PublicSite({ slug, page = 'home' }) {
  const [site, setSite] = useState(null);
  const [state, setState] = useState('loading');   // loading | ok | missing
  const [open, setOpen] = useState(false);         // mobile nav
  const [lb, setLb] = useState(-1);                // which photo is full-screen
  const [slide, setSlide] = useState(0);           // home slider position
  const [auto, setAuto] = useState(true);          // until someone takes over
  useWebFonts();

  useEffect(() => {
    api.publicSite(slug)
      .then(d => { setSite(d.site); setState('ok'); })
      .catch(() => setState('missing'));
  }, [slug]);

  // arrows and Escape while a photograph is open — a viewer you can only click
  // out of feels broken to anyone used to looking at pictures
  useEffect(() => {
    if (lb < 0) return;
    const n = (site?.portfolio || []).length;
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(-1);
      if (e.key === 'ArrowRight') setLb(i => (i + 1) % n);
      if (e.key === 'ArrowLeft') setLb(i => (i - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';       // don't scroll the page behind
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [lb, site]);

  // The slider advances itself until someone touches it. Six seconds is long
  // enough to read the caption and short enough not to feel stuck.
  useEffect(() => {
    if (!auto || page !== 'home') return;
    const n = Math.min((site?.portfolio || []).length, HOME_PREVIEW);
    if (n < 2) return;
    const t = setInterval(() => setSlide(i => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [auto, page, site]);

  if (state === 'loading') return <div className="st-loading">Loading…</div>;
  if (state === 'missing') {
    return (
      <div className="st-missing">
        <h1>Nothing here yet</h1>
        <p>This address isn&apos;t in use, or the site hasn&apos;t been published.</p>
      </div>
    );
  }

  const title = site.site_title || site.business_name || 'Studio';
  const galleryUrl = site.gallery_token ? `/gallery/${site.gallery_token}` : null;
  const photos = site.portfolio || [];
  const preview = photos.slice(0, HOME_PREVIEW);
  const base = `/site/${slug}`;
  const photoUrl = (f) => `/api/sites/photo/${site.vendor_id}/${f}`;

  // one step of the slider; taking control stops it advancing by itself, which
  // is what makes a slideshow feel considerate rather than pushy
  const step = (d) => {
    setAuto(false);
    setSlide(i => (i + d + preview.length) % preview.length);
  };

  // the theme picks the layout, the vendor picks the colour and the type
  const styleVars = {
    '--st-accent': site.accent,
    '--st-head': `'${site.heading_font}', Georgia, serif`,
    '--st-body': `'${site.body_font}', system-ui, sans-serif`,
  };

  /**
   * A piece of work: the picture, and what it was. Alternating sides gives the
   * page a rhythm to scroll through and stops twenty-five frames reading as a
   * contact sheet — and it means a makeup artist or a florist can say what they
   * actually did, which a bare photo grid never lets them.
   */
  const shots = (list, offset = 0) => (
    <div className="st-works">
      {list.map((ph, i) => (
        <article className={`st-work ${(i + offset) % 2 ? 'is-flip' : ''}`} key={ph.id}>
          <figure className="st-work-fig" onClick={() => setLb(photos.indexOf(ph))}>
            <img className="st-work-img" src={photoUrl(ph.file)} alt={ph.caption || ''} loading="lazy" />
          </figure>
          {(ph.caption || ph.note) && (
            <div className="st-work-text">
              {ph.caption && <h3 className="st-work-title">{ph.caption}</h3>}
              {ph.note && <p className="st-work-note">{ph.note}</p>}
            </div>
          )}
        </article>
      ))}
    </div>
  );

  return (
    <div className={`st st-${site.theme} st-page-${page}`} style={styleVars}>
      <header className="st-nav">
        <a href={base} className="st-brand">
          {site.logo_path
            ? <img src={`/api/me/logo/${site.logo_path}`} alt="" className="st-brand-logo" />
            : <span className="st-brand-name">{title}</span>}
        </a>
        <button type="button" className="st-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
        <nav className={`st-links ${open ? 'is-open' : ''}`}>
          {NAV.map(([id, label, path]) => (
            <a key={id} href={base + path} className={page === id ? 'is-here' : ''}>{label}</a>
          ))}
        </nav>
      </header>

      {/* ── HOME: the hero, a word about them, and a taste of the work ── */}
      {page === 'home' && (
        <>
          <section className={`st-hero ${site.cover_photo ? 'has-cover' : ''}`}>
            {site.cover_photo && (
              <img className="st-hero-cover" src={photoUrl(site.cover_photo)}
                alt="" style={{ objectPosition: site.cover_focus || '50% 50%' }} />
            )}
            <div className="st-hero-inner">
              {site.logo_path && (
                <img className="st-hero-logo" src={`/api/me/logo/${site.logo_path}`} alt={title} />
              )}
              <h1 className="st-hero-title">{title}</h1>
              {site.tagline && <p className="st-hero-tagline">{site.tagline}</p>}
              <a href={`${base}/book`} className="st-cta">Book us</a>
            </div>
          </section>

          {(site.about_heading || site.about_body) && (
            <section className="st-about">
              <div className="st-wrap st-narrow">
                {site.about_heading && <h2 className="st-h2">{site.about_heading}</h2>}
                {site.about_body && <p className="st-prose">{site.about_body}</p>}
              </div>
            </section>
          )}

          {/* A slider, not a stack: the home page shows the work moving without
              growing, so it stays short whether a vendor has five frames or
              twenty-five. It advances on its own and stops the moment someone
              takes control, which is the difference between a slideshow that
              helps and one that fights you. */}
          {photos.length > 0 && (
            <section className="st-section st-alt">
              <div className="st-wrap">
                <p className="st-eyebrow">A glimpse</p>
                <h2 className="st-h2">Recent work</h2>

                <div className="st-slider">
                  <div className="st-slides" style={{ transform: `translateX(-${slide * 100}%)` }}>
                    {photos.slice(0, HOME_PREVIEW).map(ph => (
                      <div className="st-slide" key={ph.id}>
                        <img className="st-slide-img" src={photoUrl(ph.file)} alt={ph.caption || ''} loading="lazy" />
                        {(ph.caption || ph.note) && (
                          <div className="st-slide-cap">
                            {ph.caption && <h3 className="st-slide-title">{ph.caption}</h3>}
                            {ph.note && <p className="st-slide-note">{ph.note}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {preview.length > 1 && (
                    <>
                      <button className="st-sl-nav st-sl-prev" aria-label="Previous"
                        onClick={() => step(-1)}>‹</button>
                      <button className="st-sl-nav st-sl-next" aria-label="Next"
                        onClick={() => step(1)}>›</button>
                      <div className="st-dots">
                        {preview.map((ph, i) => (
                          <button key={ph.id} aria-label={`Photo ${i + 1}`}
                            className={`st-dot ${i === slide ? 'is-on' : ''}`}
                            onClick={() => { setAuto(false); setSlide(i); }} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="st-more">
                  <a className="st-cta" href={`${base}/portfolio`}>See the full portfolio</a>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── PORTFOLIO: its own page, as long as the work deserves ── */}
      {page === 'portfolio' && (
        <section className="st-section st-first">
          <div className="st-wrap">
            <p className="st-eyebrow">Selected work</p>
            <h2 className="st-h2">Portfolio</h2>
            {photos.length === 0
              ? <p className="st-quiet">Work coming soon.</p>
              : shots(photos)}
          </div>
        </section>
      )}

      {/* ── CLIENT SECTION ── */}
      {page === 'clients' && (
        <section className="st-section st-first">
          <div className="st-wrap st-narrow">
            <p className="st-eyebrow">Already booked</p>
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
      )}

      {/* ── BOOK US ── */}
      {page === 'book' && (
        <section className="st-section st-first">
          <div className="st-wrap st-narrow">
            <p className="st-eyebrow">Get in touch</p>
            <h2 className="st-h2">Book Us</h2>
            <p className="st-prose">Tell us about your day and we&apos;ll come back to you.</p>
            <a className="st-cta" href={`/inquiry/${site.vendor_id}`}>Start an enquiry</a>
            <div className="st-contact">
              {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
              {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
            </div>
          </div>
        </section>
      )}

      <footer className="st-foot">
        <div className="st-wrap st-foot-inner">
          <span>© {new Date().getFullYear()} {title}</span>
          <span className="st-social">
            {site.instagram && <a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a>}
            {site.facebook && <a href={site.facebook} target="_blank" rel="noreferrer">Facebook</a>}
          </span>
        </div>
      </footer>

      {/* 📷 full-screen viewer — a portfolio you can't look at properly isn't one */}
      {lb >= 0 && photos[lb] && (
        <div className="st-lb" onClick={() => setLb(-1)}>
          <button className="st-lb-close" onClick={() => setLb(-1)} aria-label="Close">✕</button>
          {photos.length > 1 && (
            <>
              <button className="st-lb-nav st-lb-prev" aria-label="Previous"
                onClick={e => { e.stopPropagation(); setLb((lb - 1 + photos.length) % photos.length); }}>‹</button>
              <button className="st-lb-nav st-lb-next" aria-label="Next"
                onClick={e => { e.stopPropagation(); setLb((lb + 1) % photos.length); }}>›</button>
            </>
          )}
          <img className="st-lb-img" onClick={e => e.stopPropagation()}
            src={photoUrl(photos[lb].file)} alt={photos[lb].caption || ''} />
        </div>
      )}
    </div>
  );
}
