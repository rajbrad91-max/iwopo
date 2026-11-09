import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 📊 A gallery's download log — the Studio feature behind the 📊 button on a gallery tile (Raj, 2026-11-09).
 * Which photos, films and Zips were downloaded, from which IP address and when, grouped into visits (the same IP
 * within 30 minutes) — newest first. Recorded by backend lib/galleryDownloads.js from the day the feature is on.
 */
const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const span = (v) => (v.from === v.to ? when(v.from) : sameDay(v.from, v.to) ? `${when(v.from)} – ${time(v.to)}` : `${when(v.from)} – ${when(v.to)}`);
const plural = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

export default function GalleryDownloadLog({ album, onClose }) {
  const [log, setLog] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.galleryDownloads(album.id).then(setLog).catch(e => setErr(e.message)); }, [album.id]);
  const t = log?.totals;
  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="gdl" role="dialog" aria-modal="true" aria-label={`Downloads — ${album.title}`} onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">📊 Downloads · {album.title}</h3>
          <button className="al-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {err ? <div className="err-banner">⚠️ {err}</div>
          : !log ? <p className="gdl-empty">Loading…</p>
          : !t.downloads ? <p className="gdl-empty">No downloads yet. Every photo, film or Zip a client downloads from this gallery appears here, with the IP address and the time.</p>
          : (
            <>
              <div className="gdl-sum">
                <span className="gdl-chip"><b>{t.downloads.toLocaleString('en-US')}</b> downloads</span>
                <span className="gdl-chip">{plural(t.photos, 'photo')}</span>
                <span className="gdl-chip">{plural(t.zips, 'Zip')}</span>
                <span className="gdl-chip">{plural(t.ips, 'IP address')}</span>
                <span className="gdl-chip">Last {when(t.last)}</span>
              </div>
              <ol className="gdl-visits">
                {log.visits.map(v => (
                  <li key={`${v.ip}-${v.from}`} className="gdl-visit">
                    <div className="gdl-head">
                      <code className="gdl-ip">{v.ip}</code>
                      <span className="gdl-meta">{[v.device, v.browser].filter(Boolean).join(' · ')}</span>
                      {v.place && <span className="gdl-meta">📍 {v.place}</span>}
                      <span className="gdl-when">{span(v)} · {plural(v.items.length, 'file')}</span>
                    </div>
                    <div className="gdl-items">
                      {v.items.map((it, i) => (
                        <span key={i} className={`gdl-item is-${it.kind}`} title={when(it.at)}>{it.kind === 'zip' ? '📦 ' : ''}{it.label}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
      </div>
    </div>
  );
}
