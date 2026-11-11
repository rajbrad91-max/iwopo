/**
 * 🌐 My Website: the portfolio website builder.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import PublicSite from '../PublicSite';
import { api } from '../../lib/api';
import DomainSettings from '../../components/DomainSettings';

export function WebsiteView() {
  const [site, setSite] = useState(null);
  const [themes, setThemes] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [slugDraft, setSlugDraft] = useState('');
  const [vmeta, setVmeta] = useState(null);          // name, logo, handle — for the preview
  const [prevPage, setPrevPage] = useState('home');
  const [prevWide, setPrevWide] = useState(true);    // desktop or phone

  useEffect(() => {
    api.mySite()
      .then(d => {
        setSite(d.site);
        setVmeta(d.vendor || null);
        setThemes(d.themes || []);
        setFonts(d.fonts || []);
        setSlugDraft(d.site?.slug || '');
      })
      .catch(e => setMsg('⚠️ ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  /* Gallery exists only on the photographer styles and Clients only on the
     rest, so switching style can leave you looking at a page the site no longer
     has — a blank stage that reads as "the preview broke". Fall back to Home. */
  useEffect(() => {
    if (!site) return;
    const photo = ['aperture', 'atelier'].includes(site.theme);
    if ((prevPage === 'gallery' && !photo) || (prevPage === 'clients' && photo)) setPrevPage('home');
  }, [site, prevPage]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 1800); };

  // one field at a time — the server only writes what it's sent, so this can
  // never blank the rest of the site
  async function save(patch) {
    setSite(s => ({ ...s, ...patch }));
    try { const d = await api.saveMySite(patch); setSite(d.site); flash('✅ Saved'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  /**
   * ✏️ An edit made in the preview.
   *
   * A section's text lives inside a JSON array rather than its own column, so
   * the path carries the section's id and the whole array is written back with
   * that one field changed. Everything else is a plain column.
   */
  function commitEdit(path, value) {
    if (path.startsWith('portfolio.')) {
      /* Portfolio has its own endpoint. PUT /sites/my cleans its body against a
         list that does not include portfolio, so a caption sent that way was
         accepted, dropped, and reported as saved — the change survived on
         screen until the next load and then vanished. */
      const [, id, field] = path.split('.');
      const next = (site.portfolio || []).map(ph =>
        String(ph.id) === String(id) ? { ...ph, [field]: value } : ph);
      setSite(x => ({ ...x, portfolio: next }));
      api.savePortfolio(next)
        .then(d => { setSite(d.site); flash('✅ Saved'); })
        .catch(e => setMsg('⚠️ ' + e.message));
      return;
    }
    /* clients, testimonials and blocks are all jsonb arrays on the site row,
       so one branch handles the three of them: find the entry by id, change the
       one field, write the whole array back. */
    for (const list of ['clients', 'testimonials']) {
      if (path.startsWith(list + '.')) {
        const [, id, field] = path.split('.');
        const next = (site[list] || []).map(x =>
          String(x.id) === String(id) ? { ...x, [field]: value } : x);
        save({ [list]: next });
        return;
      }
    }
    if (path.startsWith('sections.')) {
      const [, id, field] = path.split('.');
      const next = (site.sections || []).map(sec =>
        String(sec.id) === String(id) ? { ...sec, [field]: value } : sec);
      save({ sections: next });
      return;
    }
    if ((site[path] || '') === value) return;    // nothing changed, don't write
    save({ [path]: value });
  }

  /**
   * 🌍 Publish.
   *
   * Anything half-typed is committed first: clicking the button blurs the text
   * you were in, which fires its save, and that save has to land before the
   * publish or the version that goes live is the one from before your last
   * sentence. A short wait is enough — the writes are one round trip each.
   */
  /**
   * 📸 Photographs are managed on the photographs.
   *
   * They used to be two long lists in the sidebar — thumbnails with arrows and
   * bins, next to a preview showing the same pictures. You changed one and
   * looked at the other. Now the controls sit on the frame itself, so the thing
   * you click is the thing that changes.
   */
  const photoTools = {
    onCover: async (file) => {
      try { const d = await api.uploadSiteCover(file); setSite(d.site); flash('✅ Cover updated'); }
      catch (e) { setMsg('⚠️ ' + e.message); }
    },
    onAdd: async (files) => {
      try {
        let last;
        for (const f of files) last = await api.addPortfolioPhoto(f);
        if (last) setSite(last.site);
        flash('✅ Added');
      } catch (e) { setMsg('⚠️ ' + e.message); }
    },
    onFocus: async (focus) => {
      try { const d = await api.setSiteCoverFocus(focus); setSite(d.site); flash('✅ Focus set'); }
      catch (e) { setMsg('⚠️ ' + e.message); }
    },
    onReplace: async (id, file) => {
      try { const d = await api.replacePortfolioPhoto(id, file); setSite(d.site); flash('✅ Replaced'); }
      catch (e) { setMsg('⚠️ ' + e.message); }
    },
    onRemove: async (id) => {
      try { const d = await api.removePortfolioPhoto(id); setSite(d.site); flash('✅ Removed'); }
      catch (e) { setMsg('⚠️ ' + e.message); }
    },
  };

  /**
   * 🧱 Adding and removing the things a page is made of, from the page itself.
   *
   * These used to be three lists in the sidebar. A vendor added a testimonial
   * in one place and read it in another, which is how you end up with a quote
   * that reads oddly in the layout it actually lands in.
   */
  const pageTools = {
    onAdd: (list, kind) => {
      const id = list.slice(0, 1) + Date.now();
      const blank = {
        clients: { id, name: '', logo: null },
        testimonials: { id, quote: '', author: '', role: '' },
        sections: { id, type: kind || 'text', heading: '', body: '', image: null },
      }[list];
      save({ [list]: [...(site[list] || []), blank] });
    },
    onRemove: (list, id) => {
      save({ [list]: (site[list] || []).filter(x => String(x.id) !== String(id)) });
    },
    onSectionImage: async (id, file) => {
      try {
        const { image } = await api.uploadSitePhoto(file);
        save({ sections: (site.sections || []).map(x => (String(x.id) === String(id) ? { ...x, image } : x)) });
      } catch (e) { setMsg('⚠️ ' + e.message); }
    },
    onClientLogo: async (id, file) => {
      try {
        const { image } = await api.uploadSitePhoto(file);
        save({ clients: (site.clients || []).map(c => (String(c.id) === String(id) ? { ...c, logo: image } : c)) });
      } catch (e) { setMsg('⚠️ ' + e.message); }
    },
  };

  async function publishNow() {
    try {
      await new Promise(r => setTimeout(r, 180));
      const d = await api.publishMySite(true);
      setSite(d.site);
      flash('🌍 Saved and live');
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  async function saveSlug() {
    const next = slugDraft.trim();
    if (!next || next === site?.slug) return;
    try { const d = await api.saveMySiteSlug(next); setSite(d.site); setSlugDraft(d.site.slug); flash('✅ Address saved'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  async function togglePublish() {
    try { const d = await api.publishMySite(!site.published); setSite(d.site); flash(d.site.published ? '🌍 Your site is live' : '🙈 Site hidden'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  // 🖼️ Cover photo. Uploading replaces whatever was there — the server deletes
  // the old file, so trying five covers doesn't leave four behind on disk.

  // Click the preview to say which part of the photo must stay visible. The hero
  // is cropped differently on every screen, so without this the subject's head is
  // the first thing to go on a phone.
  // 🖼️ Portfolio. Added one file at a time so a slow upload can't leave the list
  // half-written; removing takes the file with it, permanently.
  // typing is local; the write happens when the field is left, so every
  // keystroke isn't a request
  /* ── 🧱 The vendor's own page blocks ────────────────────────────────────
     Text edits save on blur like every other field here; anything structural —
     adding, removing, reordering, switching type, attaching a picture — saves
     at once, because a vendor who reorders and then closes the tab should not
     lose it. */       // which section is uploading


  // switching to text deliberately drops the picture: the server does the same,
  // so keeping it here would only disagree with what actually got stored
  /** Persist both lists and the heading together — they are one card. */
  if (loading) return <div className="loading">Loading…</div>;
  if (!site) return <div className="table-wrap ac-empty">Couldn&apos;t load your site. {msg}</div>;

  const liveUrl = site.slug ? `${window.location.origin}/site/${site.slug}` : null;

  return (
    <div className="wb">

      {/* ── the bar: which style, which page, how wide, and a way out ── */}
      <div className="wb-bar">
        <div className="wb-styles">
          {themes.map((t, i) => (
            <button key={t.id} type="button" title={`${t.name} — ${t.blurb}`}
              className={`wb-style ${site.theme === t.id ? 'is-on' : ''}`}
              onClick={() => save({ theme: t.id, accent: t.accent })}>
              <span className="wb-style-n">Style {i + 1}</span>
              <span className="wb-style-name">{t.name}</span>
            </button>
          ))}
        </div>
        <div className="wb-bar-right">
          {/* the third tab is Gallery on the two photographer styles and
              Clients on the rest — the same rule the public nav uses, so the
              builder never offers a page the site would not have */}
          {[['home', 'Home'], ['portfolio', 'Portfolio'],
            (['aperture', 'atelier'].includes(site.theme) ? ['gallery', 'Gallery'] : ['clients', 'Clients']),
            ['book', 'Book Us']].map(([id, label]) => (
            <button key={id} type="button"
              className={`wb-page ${prevPage === id ? 'is-on' : ''}`}
              onClick={() => setPrevPage(id)}>{label}</button>
          ))}
          <button type="button" className="wb-icon" onClick={() => setPrevWide(w => !w)}
            title={prevWide ? 'See it as a phone' : 'See it as a desktop'}>{prevWide ? '🖥️' : '📱'}</button>
          {/* One button, one meaning. It used to swap to "Live" once published,
              which made it read as a status light — so pressing it a second time
              quietly took the site DOWN. Publish always publishes. Taking a site
              off is a deliberate act and lives in Settings. */}
          <button type="button" className={`wb-publish ${site.published ? 'is-live' : ''}`}
            onMouseDown={() => { if (document.activeElement?.isContentEditable) document.activeElement.blur(); }}
            onClick={publishNow}>🌍 Publish</button>
        </div>
      </div>

      <div className="wb-work">
      <div className="wb-main">
      {/* ── the site itself, scaled down to fit, and editable in place ── */}
      <div className={`wb-stage ${prevWide ? '' : 'is-phone'}`}>
        <div className="wb-frame">
          <PublicSite
            page={prevPage}
            slug={site.slug || 'preview'}
            editable
            onEditText={commitEdit}
            photoTools={photoTools}
            pageTools={pageTools}
            inPanel
            previewSite={{
              ...site,
              business_name: vmeta?.business_name ?? null,
              logo_path: vmeta?.logo_path ?? null,
              vendor_slug: vmeta?.slug ?? null,
            }} />
        </div>
      </div>

      <p className="wb-hint">
        {site.published
          ? <>Live at <b>{window.location.origin}/site/{site.slug}</b> — click any text above to change it ✏️</>
          : <>Draft — nobody can see this yet. Click any text above to change it ✏️</>}
      </p>

      </div>

      {/* ── everything that isn't words: photos, colour, type, address, domain.
          Always there, never in the way — a drawer meant every colour change
          cost two clicks and hid the very thing you were changing. ── */}
      <aside className="wb-side">
        <div className="wb-side-head"><h3 className="ws-h3">⚙️ Settings</h3></div>
        <div className="wb-side-body">
      <div className="ac-head">
        <div>
          <div className="ac-title">🌐 My Website</div>
          <div className="ac-sub">
            {site.published
              ? <>Live at <a href={liveUrl} target="_blank" rel="noreferrer" className="ws-live-link">{liveUrl}</a></>
              : 'Not published yet — only you can see it'}
          </div>
        </div>
        <div className="ac-tabs">
          {msg && <span className="ws-msg">{msg}</span>}
          {/* Publish lives in the bar above, once. Two buttons for one act
              means a vendor has to work out whether they differ. What is left
              here is the opposite act, which genuinely is separate. */}
          {site.published && (
            <button type="button" className="refresh" onClick={togglePublish}>🙈 Unpublish</button>
          )}
        </div>
      </div>

      {/* ── colour + type ── */}
      <div className="table-wrap ws-block">
        <h3 className="ws-h3">🖌️ Colour &amp; type</h3>
        <div className="ws-row">
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-accent">Accent colour</label>
            <div className="ws-colour">
              <input id="ws-accent" type="color" value={site.accent}
                onChange={e => setSite(s => ({ ...s, accent: e.target.value }))}
                onBlur={e => save({ accent: e.target.value })} />
              <code>{site.accent}</code>
            </div>
          </div>
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-hfont">Heading font</label>
            <select id="ws-hfont" className="gal-input" value={site.heading_font}
              onChange={e => save({ heading_font: e.target.value })}>
              {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="ws-field">
            <label className="ws-label" htmlFor="ws-bfont">Body font</label>
            <select id="ws-bfont" className="gal-input" value={site.body_font}
              onChange={e => save({ body_font: e.target.value })}>
              {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── cover photo ── */}
{/* ── social proof ── */}
{/* ── portfolio ── */}
{/* ── words ── */}
{/* ── address ── */}
      <div className="table-wrap ws-block">
        <h3 className="ws-h3">🔗 Web address</h3>
        <p className="ws-hint">
          Where your site lives. Letters, numbers and hyphens — it has to be
          different from every other vendor&apos;s, so pick something specific.
        </p>
        <div className="ws-slug">
          <span className="ws-slug-prefix">{window.location.origin}/site/</span>
          <input className="ac-kb-input ws-slug-input" value={slugDraft}
            placeholder="your-studio-name"
            onChange={e => setSlugDraft(e.target.value)}
            onBlur={saveSlug}
            onKeyDown={e => e.key === 'Enter' && saveSlug()} />
        </div>
        {!site.slug && <p className="ws-warn">⚠️ Choose an address before you can publish.</p>}
      </div>

      <DomainSettings />
        </div>
      </aside>
      </div>
    </div>
  );
}
