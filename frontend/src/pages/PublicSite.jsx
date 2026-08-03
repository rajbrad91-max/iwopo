import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import './site.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

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
 * Anything carrying .st-rise starts slightly low and transparent and settles as
 * it enters the screen. Done with an observer rather than a scroll listener so
 * the page isn't doing arithmetic on every frame, and skipped entirely for
 * anyone who has asked their system for less motion.
 */
function useReveal(key) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.st-rise:not(.is-in)'));
    if (!els.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [key]);
}

/**
 * 🌐 A vendor's public website.
 *
 * Four VIEWS, each at its own address. Clicking Portfolio opens the portfolio —
 * it does not scroll you half way down a page you were already reading. Each
 * view starts at the top and settles in, so moving around feels like turning to
 * a new page rather than sliding along one very long one.
 *
 * Home stays short on purpose: a picture, a sentence, three frames, and a way
 * through to the rest. The portfolio can then be as long as the work deserves
 * without burying anything underneath it.
 */
const NAV = [
  ['home', 'Home', ''],
  ['portfolio', 'Portfolio', '/portfolio'],
  ['clients', 'Clients', '/clients'],
  ['book', 'Book Us', '/book'],
];

const HOME_PREVIEW = 3;

export default function PublicSite({ slug, page = 'home' }) {
  const [site, setSite] = useState(null);
  const [state, setState] = useState('loading');   // loading | ok | missing
  const [open, setOpen] = useState(false);         // mobile nav
  const [lb, setLb] = useState(-1);                // which photo is full-screen
  const reelRef = useRef(null);                    // the sliding second collage
  useWebFonts();
  useDocumentTitle(site?.site_title || site?.business_name);
  useReveal(page + (site ? 'y' : 'n'));

  useEffect(() => {
    api.publicSite(slug)
      .then(d => { setSite(d.site); setState('ok'); })
      .catch(() => setState('missing'));
  }, [slug]);

  // a new view opens at its beginning, and closes the mobile menu behind it
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [page]);

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
  // default to empty: a site saved before these columns existed has neither
  const clients = Array.isArray(site.clients) ? site.clients : [];
  const testimonials = Array.isArray(site.testimonials) ? site.testimonials : [];
  const photos = site.portfolio || [];
  const preview = photos.slice(0, HOME_PREVIEW);
  // five frames read as a composed block; anything past that slides sideways
  const spread = photos.slice(0, 5);
  const rest = photos.slice(5);
  const base = `/site/${slug}`;
  const photoUrl = (f) => `/api/sites/photo/${site.vendor_id}/${f}`;

  // the theme picks the layout, the vendor picks the colour and the type
  const styleVars = {
    '--st-accent': site.accent,
    '--st-head': `'${site.heading_font}', Georgia, serif`,
    '--st-body': `'${site.body_font}', system-ui, sans-serif`,
  };

  /**
   * Move the reel by roughly one visible frame. Measured off the first child
   * rather than a hard-coded width, because every theme sizes its frames
   * differently and a fixed number would overshoot in one and stall in another.
   */
  const slideReel = (dir) => {
    const track = reelRef.current;
    if (!track) return;
    const first = track.firstElementChild;
    const step = first ? first.getBoundingClientRect().width + 24 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  /**
   * One photograph, wherever it appears. The frame is a button so the
   * full-screen viewer opens from the keyboard too, and the words a vendor
   * wrote about the picture travel with it.
   */
  const shot = (ph, cls) => (
    <figure className={`${cls} st-rise`} key={ph.id}>
      <button type="button" className="st-gal-frame"
        aria-label={ph.caption ? `View ${ph.caption}` : 'View photograph'}
        onClick={() => setLb(photos.indexOf(ph))}>
        <img className="st-gal-img" src={photoUrl(ph.file)} alt={ph.caption || ''} loading="lazy" />
      </button>
      {(ph.caption || ph.note) && (
        <figcaption className="st-gal-cap">
          {ph.caption && <span className="st-gal-title">{ph.caption}</span>}
          {ph.note && <span className="st-gal-note">{ph.note}</span>}
        </figcaption>
      )}
    </figure>
  );

  /**
   * 🧩 Collage one — the read. Five frames at five different sizes, and where a
   * vendor has written about a picture the words sit BESIDE it inside the
   * collage rather than underneath, so the block reads as a spread. The slot
   * classes st-c1…st-c5 are what each theme re-shapes.
   */
  const collage = (list) => (
    <div className="st-col1">
      {list.map((ph, i) => shot(ph, `st-c1-i st-c${i + 1}`))}
    </div>
  );

  /**
   * 🎞 Collage two — the browse. The rest of the work slides sideways instead of
   * stacking down the page, which is what keeps a portfolio of forty frames the
   * same height as one of ten. Native scroll-snap, so a phone swipes it without
   * any of this code running.
   */
  const reel = (list) => (
    <div className="st-reel">
      <div className="st-reel-track" ref={reelRef}>
        {list.map(ph => shot(ph, 'st-reel-i'))}
      </div>
      {list.length > 1 && (
        <>
          <button type="button" className="st-reel-nav st-reel-prev"
            aria-label="Previous" onClick={() => slideReel(-1)}>‹</button>
          <button type="button" className="st-reel-nav st-reel-next"
            aria-label="Next" onClick={() => slideReel(1)}>›</button>
        </>
      )}
    </div>
  );

  /** three frames on the home page — a taste, not the portfolio */
  const trio = (list) => (
    <div className="st-trio">{list.map(ph => shot(ph, 'st-trio-i'))}</div>
  );

  return (
    <div className={`st st-${site.theme} st-page-${page}`} style={styleVars}>
      <header className="st-nav">
        <a href={base} className="st-brand">
          {site.logo_path
            ? <img src={`/api/me/logo/${site.logo_path}`} alt="" className="st-brand-logo" />
            : <span className="st-brand-name">{title}</span>}
        </a>
        <button type="button" className="st-burger" onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-label="Menu">
          <span className={`st-burger-i ${open ? 'is-x' : ''}`} />
        </button>
        <nav className={`st-links ${open ? 'is-open' : ''}`}>
          {NAV.map(([id, label, path]) => (
            <a key={id} href={base + path} className={page === id ? 'is-here' : ''}>{label}</a>
          ))}
        </nav>
      </header>

      {/* keyed on the view so React rebuilds it — which is what lets the whole
          page fade up again, the way opening a new page should feel */}
      <main className="st-main" key={page}>

        {/* ── HOME: a picture, a sentence, three frames, a way through ── */}
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
                <div className="st-hero-cta">
                  <a href={`${base}/portfolio`} className="st-cta">View portfolio</a>
                  <a href={`${base}/book`} className="st-cta is-ghost">Book us</a>
                </div>
              </div>
            </section>

            {(site.about_heading || site.about_body) && (
              <section className="st-section st-about">
                <div className="st-wrap st-narrow st-rise">
                  {site.about_heading && <h2 className="st-h2">{site.about_heading}</h2>}
                  {site.about_body && <p className="st-prose">{site.about_body}</p>}
                </div>
              </section>
            )}

            {/* 🧱 The vendor's own blocks — after who they are, before the work
                does the rest of the talking. An image block alternates side each
                time so a run of three doesn't read as a list. */}
            {(site.sections || []).map((sec, i) => {
              if (!sec.heading && !sec.body) return null;      // nothing to show
              if (sec.type === 'image' && sec.image) {
                return (
                  <section key={sec.id || i} className={`st-section ${i % 2 ? 'st-alt' : ''}`}>
                    <div className={`st-wrap st-split st-rise ${i % 2 ? 'is-flipped' : ''}`}>
                      <div className="st-split-text">
                        {sec.heading && <h2 className="st-h2">{sec.heading}</h2>}
                        {sec.body && <p className="st-prose">{sec.body}</p>}
                      </div>
                      <div className="st-split-img">
                        <img src={photoUrl(sec.image)} alt={sec.heading || ''} loading="lazy" />
                      </div>
                    </div>
                  </section>
                );
              }
              return (
                <section key={sec.id || i} className={`st-section ${i % 2 ? 'st-alt' : ''}`}>
                  <div className="st-wrap st-narrow st-rise">
                    {sec.heading && <h2 className="st-h2">{sec.heading}</h2>}
                    {sec.body && <p className="st-prose">{sec.body}</p>}
                  </div>
                </section>
              );
            })}

            {/* three frames, then out to the rest — the home page stays the
                same length whether a vendor has five photographs or fifty */}
            {preview.length > 0 && (
              <section className="st-section st-alt">
                <div className="st-wrap">
                  <div className="st-head st-rise">
                    <p className="st-eyebrow">A glimpse</p>
                    <h2 className="st-h2">Recent work</h2>
                  </div>
                  {trio(preview)}
                  <div className="st-more st-rise">
                    <a className="st-cta" href={`${base}/portfolio`}>See the full portfolio</a>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ── PORTFOLIO: a composed spread, then the rest on a rail ── */}
        {page === 'portfolio' && (
          <section className="st-section st-first">
            <div className="st-wrap">
              <div className="st-head st-rise">
                <p className="st-eyebrow">Selected work</p>
                <h2 className="st-h2">Portfolio</h2>
              </div>
              {photos.length === 0 && <p className="st-quiet">Work coming soon.</p>}
              {spread.length > 0 && collage(spread)}
              {rest.length > 0 && (
                <div className="st-reel-block">
                  <div className="st-reel-head st-rise">
                    <h3 className="st-h3">More from the archive</h3>
                    <p className="st-quiet">Slide across</p>
                  </div>
                  {reel(rest)}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── CLIENTS: who they have worked with, and what those people said ── */}
        {page === 'clients' && (
          <section className="st-section st-first">
            <div className="st-wrap">
              <div className="st-head st-rise">
                <p className="st-eyebrow">Kind words</p>
                <h2 className="st-h2">
                  {site.clients_heading || 'Trusted by wonderful people and brands'}
                </h2>
              </div>

              {clients.length > 0 && (
                <div className="st-logos st-rise">
                  {clients.map(c => (
                    <div key={c.id} className="st-logo" title={c.name}>
                      {c.logo
                        ? <img src={photoUrl(c.logo)} alt={c.name || ''} loading="lazy" />
                        : <span className="st-logo-name">{c.name}</span>}
                    </div>
                  ))}
                </div>
              )}

              {testimonials.length > 0 && (
                <div className="st-quotes">
                  {testimonials.map(t => (
                    <figure key={t.id} className="st-quote st-rise">
                      <blockquote>{t.quote}</blockquote>
                      {(t.author || t.role) && (
                        <figcaption>
                          {t.author}
                          {t.role && <span className="st-quote-role">{t.role}</span>}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              {clients.length === 0 && testimonials.length === 0 && (
                <p className="st-quiet">Client stories coming soon.</p>
              )}
            </div>
          </section>
        )}

        {/* ── BOOK US ── */}
        {page === 'book' && (
          <section className="st-section st-first">
            <div className="st-wrap st-narrow st-rise">
              <p className="st-eyebrow">Get in touch</p>
              <h2 className="st-h2">Let&apos;s create something memorable.</h2>
              <p className="st-prose">
                Tell us about your day and we&apos;ll come back to you within one to
                two business days.
              </p>
              <a className="st-cta" href={`/inquiry/${site.vendor_slug}`}>Start an enquiry</a>
              <div className="st-contact">
                {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
                {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="st-foot">
        <div className="st-wrap st-foot-inner">
          <span className="st-foot-name">{title}</span>
          <span className="st-foot-links">
            {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
            {site.instagram && <a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a>}
            {site.facebook && <a href={site.facebook} target="_blank" rel="noreferrer">Facebook</a>}
          </span>
          <span className="st-foot-copy">© {new Date().getFullYear()}</span>
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
          <figure className="st-lb-fig" onClick={e => e.stopPropagation()}>
            <img className="st-lb-img" src={photoUrl(photos[lb].file)} alt={photos[lb].caption || ''} />
            {photos[lb].caption && <figcaption className="st-lb-cap">{photos[lb].caption}</figcaption>}
          </figure>
        </div>
      )}
    </div>
  );
}
