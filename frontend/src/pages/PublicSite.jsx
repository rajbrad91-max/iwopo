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
function useReveal(key, instant = false) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.st-rise:not(.is-in)'));
    if (!els.length) return;
    /* Two cases settle immediately rather than waiting to be scrolled into
       view. Reduced motion, obviously — but also the panel preview, which sits
       in a scaled, clipped box where the observer never fires for anything
       below the fold, so a vendor would be shown blank sections and reasonably
       assume their site was broken. */
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
/**
 * The third tab depends on the theme.
 *
 * Aperture and Contact Sheet are for photographers, where the useful thing in
 * that slot is a Gallery — the place a couple goes to open the album they were
 * sent. The other three serve any kind of vendor, where the same slot is better
 * spent on who they have worked with.
 */
const PHOTO_THEMES = ['aperture', 'atelier'];

const navFor = (theme) => [
  ['home', 'Home', ''],
  ['portfolio', 'Portfolio', '/portfolio'],
  PHOTO_THEMES.includes(theme)
    ? ['gallery', 'Gallery', '/gallery']
    : ['clients', 'Clients', '/clients'],
  ['book', 'Book Us', '/book'],
];

const HOME_PREVIEW = 3;

export default function PublicSite({ slug, page = 'home', byHost = false, previewSite = null,
                                     editable = false, onEditText = null, inPanel = false,
                                     photoTools = null, pageTools = null }) {
  const [site, setSite] = useState(null);
  const [state, setState] = useState('loading');   // loading | ok | missing
  const [open, setOpen] = useState(false);         // mobile nav
  const reelRef = useRef(null);                    // the sliding second collage
  /* Which part of the cover to keep when it is cropped. A wide band on a laptop
     and a tall one on a phone cut different parts away, so a vendor has to be
     able to say what must survive both — usually a face. */
  const [aiming, setAiming] = useState(false);
  useWebFonts();
  // in preview the site is rendered INSIDE the panel, so retitling the tab
  // would rename the vendor's own admin page while they work
  useDocumentTitle(previewSite ? null : (site?.site_title || site?.business_name));
  useReveal(page + (site ? 'y' : 'n'), !!previewSite);

  useEffect(() => {
    /* 🖊️ Preview: the panel hands the draft straight in. No request, so the
       preview keeps up with typing, and no published check, because a draft is
       not published — that is what it is for. */
    if (previewSite) { setSite(previewSite); setState('ok'); return; }
    if (page === 'notfound') { setState('missing'); return; }
    const load = byHost ? api.siteByHost() : api.publicSite(slug);
    load.then(d => { setSite(d.site); setState('ok'); })
        .catch(() => setState('missing'));
  }, [slug, byHost, page, previewSite]);

  // a new view opens at its beginning, and closes the mobile menu behind it
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [page]);


  /**
   * ✏️ A piece of text a vendor can click and change.
   *
   * contentEditable rather than a form field: the words stay in the layout that
   * will actually carry them, at the size and weight they will really be, so
   * there is no gap between editing and the result. Committed on blur, never on
   * every keystroke — React re-rendering mid-word would move the caret.
   *
   * Outside the builder this collapses to plain markup, so nothing about
   * editing reaches a visitor's page.
   */
  const Ed = ({ path, value, as: Tag = 'span', className = '', placeholder = '', multiline = false }) => {
    if (!editable) return value ? <Tag className={className}>{value}</Tag> : null;
    return (
      <Tag className={`${className} st-ed`.trim()} contentEditable suppressContentEditableWarning
        spellCheck={false} data-ph={placeholder} title="Click to edit"
        onBlur={e => onEditText && onEditText(path, e.currentTarget.textContent.trim())}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.currentTarget.blur(); return; }
          // a single-line field should not grow a second line just because
          // somebody pressed Enter out of habit
          if (e.key === 'Enter' && !multiline) { e.preventDefault(); e.currentTarget.blur(); }
        }}>{value}</Tag>
    );
  };

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
  /* On a vendor's domain the site IS the site — /portfolio, not
   * /site/their-name/portfolio. One helper so every link agrees. */
  const link = (path) => (byHost ? (path || '/') : `/site/${slug}${path}`);
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
    <figure className={`${cls} st-rise ${editable ? 'is-editable' : ''}`} key={ph.id}>
      {editable && photoTools && (
        <label className="st-ph-swap" title="Put a different photograph here">
          <input type="file" accept="image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) photoTools.onReplace(ph.id, f); e.target.value = ''; }} />
          Replace
        </label>
      )}
      {/* A plain frame, not a button. Opening a photograph full screen took a
          visitor away from the page they were reading to show them the same
          picture slightly larger, and it made every frame in the builder a
          click that did nothing useful. */}
      <span className="st-gal-frame">
        <img className="st-gal-img" src={photoUrl(ph.file)} alt={ph.caption || ''} loading="lazy" />
      </span>
      {(ph.caption || ph.note || editable) && (
        <figcaption className="st-gal-cap">
          <Ed className="st-gal-title" path={`portfolio.${ph.id}.caption`}
            value={ph.caption} placeholder="Name this project" />
          <Ed className="st-gal-note" path={`portfolio.${ph.id}.note`}
            value={ph.note} placeholder="A line about it" multiline />
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
    <div className={`st st-${site.theme} st-page-${page} ${inPanel ? 'is-inpanel' : ''}`} style={styleVars}
      /* In the panel this is a view of the site, not the site. A vendor who
         clicks "View portfolio" wants to see what the button looks like, not to
         be thrown out of their own builder — the tabs above the preview are how
         you move between pages here. */
      onClickCapture={inPanel ? (e) => { if (e.target.closest('a')) e.preventDefault(); } : undefined}>
      <header className="st-nav">
        <a href={link('')} className="st-brand">
          {site.logo_path
            ? <img src={`/api/me/logo/${site.logo_path}`} alt="" className="st-brand-logo" />
            : <span className="st-brand-name">{title}</span>}
        </a>
        <button type="button" className="st-burger" onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-label="Menu">
          <span className={`st-burger-i ${open ? 'is-x' : ''}`} />
        </button>
        <nav className={`st-links ${open ? 'is-open' : ''}`}>
          {navFor(site.theme).map(([id, label, path]) => (
            <a key={id} href={link(path)} className={page === id ? 'is-here' : ''}>{label}</a>
          ))}
        </nav>
      </header>

      {/* keyed on the view so React rebuilds it — which is what lets the whole
          page fade up again, the way opening a new page should feel */}
      <main className={`st-main ${previewSite ? 'is-still' : ''}`} key={page}>

        {/* ── HOME: a picture, a sentence, three frames, a way through ── */}
        {page === 'home' && (
          <>
            <section className={`st-hero ${site.cover_photo ? 'has-cover' : ''}`}>
              {site.cover_photo && (
                <img className={`st-hero-cover ${aiming ? 'is-aiming' : ''}`}
                  src={photoUrl(site.cover_photo)} alt=""
                  style={{ objectPosition: site.cover_focus || '50% 50%' }}
                  onClick={aiming ? (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
                    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
                    photoTools.onFocus(`${x}% ${y}%`);
                    setAiming(false);
                  } : undefined} />
              )}
              {editable && photoTools && (
                <div className="st-ph-tools">
                  {site.cover_photo && (
                    <button type="button" className={`st-ph-aim ${aiming ? 'is-on' : ''}`}
                      title="Choose which part of the photograph must always stay in frame"
                      onClick={() => setAiming(a => !a)}>◎ {aiming ? 'Click the photo' : 'Focus'}</button>
                  )}
                  <label className="st-ph-cover" title="Change the photograph behind your name">
                    <input type="file" accept="image/*" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) photoTools.onCover(f); e.target.value = ''; }} />
                    🖼️ Change cover
                  </label>
                </div>
              )}
              <div className="st-hero-inner">
                {site.logo_path && (
                  <img className="st-hero-logo" src={`/api/me/logo/${site.logo_path}`} alt={title} />
                )}
                <Ed as="h1" className="st-hero-title" path="site_title" value={title}
                  placeholder="Your studio name" />
                {(site.tagline || editable) && (
                  <Ed as="p" className="st-hero-tagline" path="tagline" value={site.tagline}
                    placeholder="A line about what you do" />
                )}
                <div className="st-hero-cta">
                  <a href={link('/portfolio')} className="st-cta">View portfolio</a>
                  <a href={link('/book')} className="st-cta is-ghost">Book us</a>
                </div>
              </div>
            </section>

            {(site.about_heading || site.about_body) && (
              <section className="st-section st-about">
                <div className="st-wrap st-narrow st-rise">
                  <Ed as="h2" className="st-h2" path="about_heading" value={site.about_heading}
                    placeholder="About" />
                  <Ed as="p" className="st-prose" path="about_body" value={site.about_body}
                    placeholder="A few words about you" multiline />
                </div>
              </section>
            )}

            {/* 🧱 The vendor's own blocks — after who they are, before the work
                does the rest of the talking. An image block alternates side each
                time so a run of three doesn't read as a list. */}
            {(site.sections || []).map((sec, i) => {
              if (!sec.heading && !sec.body) return null;      // nothing to show
              if (sec.type === 'image' && (sec.image || editable)) {
                return (
                  <section key={sec.id || i} className={`st-section ${i % 2 ? 'st-alt' : ''} ${editable ? 'is-editable' : ''}`}>
                    {editable && pageTools && (
                      <button type="button" className="st-ph-swap st-ph-del st-sec-del"
                        onClick={() => pageTools.onRemove('sections', sec.id)}>Remove block</button>
                    )}
                    <div className={`st-wrap st-split st-rise ${i % 2 ? 'is-flipped' : ''}`}>
                      <div className="st-split-text">
                        <Ed as="h2" className="st-h2" path={`sections.${sec.id || i}.heading`}
                          value={sec.heading} placeholder="Heading" />
                        <Ed as="p" className="st-prose" path={`sections.${sec.id || i}.body`}
                          value={sec.body} placeholder="Text" multiline />
                      </div>
                      <div className="st-split-img">
                        {sec.image && <img src={photoUrl(sec.image)} alt={sec.heading || ''} loading="lazy" />}
                        {editable && pageTools && (
                          <label className={`st-ph-add ${sec.image ? 'st-sec-swap' : ''}`}
                            title="Choose the picture for this block">
                            <input type="file" accept="image/*" hidden
                              onChange={e => { const f = e.target.files?.[0]; if (f) pageTools.onSectionImage(sec.id, f); e.target.value = ''; }} />
                            {sec.image ? 'Replace' : '＋ Add a picture'}
                          </label>
                        )}
                      </div>
                    </div>
                  </section>
                );
              }
              return (
                <section key={sec.id || i} className={`st-section ${i % 2 ? 'st-alt' : ''} ${editable ? 'is-editable' : ''}`}>
                  {editable && pageTools && (
                    <button type="button" className="st-ph-swap st-ph-del st-sec-del"
                      onClick={() => pageTools.onRemove('sections', sec.id)}>Remove block</button>
                  )}
                  <div className="st-wrap st-narrow st-rise">
                    <Ed as="h2" className="st-h2" path={`sections.${sec.id || i}.heading`}
                      value={sec.heading} placeholder="Heading" />
                    <Ed as="p" className="st-prose" path={`sections.${sec.id || i}.body`}
                      value={sec.body} placeholder="Text" multiline />
                  </div>
                </section>
              );
            })}

            {editable && pageTools && (
              <div className="st-wrap st-sec-add">
                <button type="button" className="st-ph-add st-sec-add-b"
                  onClick={() => pageTools.onAdd('sections', 'text')}>＋ Text block</button>
                <button type="button" className="st-ph-add st-sec-add-b"
                  onClick={() => pageTools.onAdd('sections', 'image')}>＋ Text &amp; picture</button>
              </div>
            )}

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
                    <a className="st-cta" href={link('/portfolio')}>See the full portfolio</a>
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
              {photos.length === 0 && !editable && <p className="st-quiet">Work coming soon.</p>}
              {spread.length > 0 && collage(spread)}
              {editable && photoTools && (
                <label className="st-ph-add" title="Add photographs">
                  <input type="file" accept="image/*" hidden multiple
                    onChange={e => { const f = Array.from(e.target.files || []); if (f.length) photoTools.onAdd(f); e.target.value = ''; }} />
                  ＋ Add photographs
                </label>
              )}
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
                <Ed as="h2" className="st-h2" path="clients_heading"
                  value={site.clients_heading || 'Trusted by wonderful people and brands'}
                  placeholder="Kind words" />
              </div>

              {(clients.length > 0 || editable) && (
                <div className="st-logos st-rise">
                  {clients.map(c => (
                    <div key={c.id} className={`st-logo ${editable ? 'is-editable' : ''}`} title={c.name}>
                      {c.logo
                        ? <img src={photoUrl(c.logo)} alt={c.name || ''} loading="lazy" />
                        : (editable
                            ? <Ed className="st-logo-name" path={`clients.${c.id}.name`}
                                value={c.name} placeholder="Client name" />
                            : <span className="st-logo-name">{c.name}</span>)}
                      {editable && pageTools && (
                        <span className="st-logo-tools">
                          <label className="st-ph-swap" title="Use a logo instead of a name">
                            <input type="file" accept="image/*" hidden
                              onChange={e => { const f = e.target.files?.[0]; if (f) pageTools.onClientLogo(c.id, f); e.target.value = ''; }} />
                            Logo
                          </label>
                          <button type="button" className="st-ph-swap st-ph-del"
                            onClick={() => pageTools.onRemove('clients', c.id)}>Remove</button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {editable && pageTools && (
                <label className="st-ph-add" onClick={() => pageTools.onAdd('clients')}>
                  ＋ Add a client
                </label>
              )}

              {(testimonials.length > 0 || editable) && (
                <div className="st-quotes">
                  {testimonials.map(t => (
                    <figure key={t.id} className={`st-quote st-rise ${editable ? 'is-editable' : ''}`}>
                      {editable && pageTools && (
                        <button type="button" className="st-ph-swap st-ph-del"
                          title="Remove this testimonial"
                          onClick={() => pageTools.onRemove('testimonials', t.id)}>Remove</button>
                      )}
                      <blockquote>
                        <Ed path={`testimonials.${t.id}.quote`} value={t.quote}
                          placeholder="What they said" multiline />
                      </blockquote>
                      <figcaption>
                        <Ed path={`testimonials.${t.id}.author`} value={t.author} placeholder="Their name" />
                        <Ed className="st-quote-role" path={`testimonials.${t.id}.role`}
                          value={t.role} placeholder="Wedding, 2025" />
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {editable && pageTools && (
                <label className="st-ph-add" onClick={() => pageTools.onAdd('testimonials')}>
                  ＋ Add a testimonial
                </label>
              )}

              {clients.length === 0 && testimonials.length === 0 && (
                <p className="st-quiet">Client stories coming soon.</p>
              )}
            </div>
          </section>
        )}

        {/* ── GALLERY: where a couple opens the album they were sent ── */}
        {page === 'gallery' && (
          <section className="st-section st-first">
            <div className="st-wrap st-narrow st-rise">
              <p className="st-eyebrow">Your photographs</p>
              <Ed as="h2" className="st-h2" path="gallery_heading"
                value={site.gallery_heading || 'Your gallery'} placeholder="Your gallery" />
              <Ed as="p" className="st-prose" path="gallery_body"
                value={site.gallery_body || 'Already worked with us? Open your album here.'}
                placeholder="A line for your couples" multiline />
              {site.gallery_token
                ? <a className="st-cta" href={`/gallery/${site.gallery_token}`}>Open your gallery</a>
                : <p className="st-quiet">Galleries appear here once your first album is ready.</p>}
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
              <a className="st-cta" href={byHost ? '/inquiry' : `/inquiry/${site.vendor_slug}`}>Start an enquiry</a>
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

    </div>
  );
}
