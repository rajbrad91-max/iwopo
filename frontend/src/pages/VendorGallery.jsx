import { useState, useEffect } from 'react';
import PublicGallery from './PublicGallery';
import './gallery.css';

const API = '/api/g';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Playfair+Display:wght@500;700&family=Jost:wght@400;600&family=Montserrat:wght@400;600&family=Poppins:wght@400;600&family=Lora:wght@400;600&family=Raleway:wght@400;600&display=swap';

function ensureFonts() {
  if (document.getElementById('pg-fonts')) return;
  const l = document.createElement('link');
  l.id = 'pg-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
  document.head.appendChild(l);
}

export default function VendorGallery({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [openToken, setOpenToken] = useState(null);

  useEffect(() => { ensureFonts(); }, []);
  useEffect(() => {
    fetch(`${API}/vendor/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Not found'))))
      .then(setData)
      .catch(e => setErr(e.message));
  }, [token]);

  const theme = data?.theme || {};
  const styleVars = {
    '--pg-bg': theme.bg_color || '#0f1115',
    '--pg-head': theme.heading_color || '#f3f4f6',
    '--pg-accent': theme.accent_color || '#2dd4bf',
    '--pg-sub': theme.sub_color || '#9ca3af',
    '--pg-hfont': `'${theme.heading_font || 'Playfair Display'}', serif`,
    '--pg-bfont': `'${theme.body_font || 'Jost'}', sans-serif`,
  };

  if (openToken) {
    return (
      <div style={styleVars}>
        <button className="vg-back" onClick={() => setOpenToken(null)}>← All Albums</button>
        <PublicGallery token={openToken} embedded />
      </div>
    );
  }

  if (err) return <div className="pg-wrap" style={styleVars}><div className="pg-state">⚠️ {err}</div></div>;
  if (!data) return <div className="pg-wrap" style={styleVars}><div className="pg-state">Loading…</div></div>;

  return (
    <div className="pg-wrap" style={styleVars}>
      <div className="vg-head">
        <div className="vg-kicker">{theme.title_text || 'Client Galleries'}</div>
        <h1 className="vg-title">{data.vendor.name}</h1>
        <div className="vg-sub">{theme.subtitle_text || 'Secure, Password-Protected Memories'}</div>
        {theme.tagline_text && <div className="vg-tagline">{theme.tagline_text}</div>}
      </div>

      {data.albums.length === 0 ? (
        <div className="pg-state">No albums published yet 📭</div>
      ) : (
        <div className="vg-grid">
          {data.albums.map(a => (
            <div key={a.token} className="vg-card" onClick={() => setOpenToken(a.token)}>
              <div className="vg-card-cover">
                {a.cover
                  ? <img src={`${API}/vendor-cover/${a.token}`} alt={a.title} loading="lazy" />
                  : <div className="vg-card-noimg">🖼️</div>}
                <div className="vg-card-lock">🔒</div>
              </div>
              <div className="vg-card-body">
                <div className="vg-card-title">{a.title}</div>
                <div className="vg-card-meta">{a.category || '—'} · 📷 {a.photo_count}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pg-foot">Powered by iwopo</div>
    </div>
  );
}
