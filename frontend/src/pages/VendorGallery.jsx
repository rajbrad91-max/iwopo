import { useState, useEffect } from 'react';
import PublicGallery from './PublicGallery';
import './gallery.css';

const API = '/api/g';

export default function VendorGallery({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [openToken, setOpenToken] = useState(null);

  useEffect(() => {
    fetch(`${API}/vendor/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Not found'))))
      .then(setData)
      .catch(e => setErr(e.message));
  }, [token]);

  // opening a single album → reuse the PublicGallery (password gate + photos)
  if (openToken) {
    return (
      <div>
        <button className="vg-back" onClick={() => setOpenToken(null)}>← All Albums</button>
        <PublicGallery token={openToken} />
      </div>
    );
  }

  if (err) return <div className="pg-wrap"><div className="pg-msg">⚠️ {err}</div></div>;
  if (!data) return <div className="pg-wrap"><div className="pg-msg">Loading…</div></div>;

  return (
    <div className="pg-wrap">
      <div className="vg-head">
        <h1 className="vg-title">{data.vendor.name}</h1>
        <div className="vg-sub">{data.albums.length} {data.albums.length === 1 ? 'album' : 'albums'}</div>
      </div>

      {data.albums.length === 0 ? (
        <div className="pg-msg">No albums published yet 📭</div>
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
