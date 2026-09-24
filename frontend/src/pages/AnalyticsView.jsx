import { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../lib/api';
import './analytics.css';

const KIND_LABEL = {
  site_view: '🌐 Website visit', gallery_open: '📸 Gallery opened',
  photo_download: '⬇️ Photo', zip_download: '📦 Zip', file_download: '📄 File',
};

/** A referrer as a person reads it, not a URL. */
function source(ref) {
  if (!ref) return 'Direct';
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return h.charAt(0).toUpperCase() + h.slice(1);
  } catch { return ref.slice(0, 40); }
}

function when(iso) {
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  if (mins < 1440) return Math.round(mins / 60) + 'h ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * 📊 Who visited, and who took what.
 *
 * Private to the platform owner. Nothing here is a vendor-facing feature — it
 * answers "is anybody looking at my work, and did the couple actually collect
 * their photographs".
 */
export default function AnalyticsView() {
  const [d, setD] = useState(null);
  const [days, setDays] = useState(30);
  const [err, setErr] = useState('');

  useEffect(() => {
    setD(null); setErr('');
    api.analytics(days).then(setD).catch(e => setErr(e.message));
  }, [days]);

  if (err) return <div className="an-quiet">Could not load — {err}</div>;
  if (!d) return <div className="an-quiet">Loading…</div>;

  const t = d.totals;
  const visits = t.site_views + t.gallery_opens;
  const takes = t.photo_downloads + t.zip_downloads + t.file_downloads;
  const nothing = visits === 0 && takes === 0;

  return (
    <div className="an">
      <div className="an-bar">
        {[7, 30, 90].map(n => (
          <button key={n} className={`an-range ${days === n ? 'is-on' : ''}`} onClick={() => setDays(n)}>
            {n} days
          </button>
        ))}
      </div>

      {nothing ? (
        <p className="an-quiet">
          Nothing recorded in this period yet. Visits and downloads appear here
          as they happen.
        </p>
      ) : (
      <>
        <div className="an-stats">
          <div className="an-stat"><b>{t.site_views}</b><span>Website visits</span></div>
          <div className="an-stat"><b>{t.gallery_opens}</b><span>Galleries opened</span></div>
          <div className="an-stat"><b>{t.photo_downloads}</b><span>Photos taken</span></div>
          <div className="an-stat"><b>{t.zip_downloads}</b><span>Zips taken</span></div>
          <div className="an-stat"><b>{t.file_downloads}</b><span>Files taken</span></div>
        </div>

        <div className="an-card">
          <div className="an-hd">Over time</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b45309" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#b45309" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={s => s.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="views" name="Visits" stroke="#0d9488" fill="url(#gv)" strokeWidth={2} />
              <Area type="monotone" dataKey="downloads" name="Downloads" stroke="#b45309" fill="url(#gd)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="an-row">
          <div className="an-card">
            <div className="an-hd">Where they came from</div>
            {d.referrers.length === 0 ? <p className="an-quiet">Nothing yet.</p> : (
              <ul className="an-list">
                {d.referrers.map(r => (
                  <li key={r.referrer}><span>{source(r.referrer)}</span><b>{r.count}</b></li>
                ))}
              </ul>
            )}
          </div>

          <div className="an-card">
            <div className="an-hd">Countries</div>
            <ul className="an-list">
              {d.countries.map(c => <li key={c.country}><span>{c.country}</span><b>{c.count}</b></li>)}
            </ul>
          </div>

          <div className="an-card">
            <div className="an-hd">Device</div>
            <ul className="an-list">
              {d.devices.map(x => <li key={x.kind}><span>{x.kind}</span><b>{x.count}</b></li>)}
            </ul>
          </div>
        </div>

        <div className="an-card">
          <div className="an-hd">Most opened and taken</div>
          <ul className="an-list">
            {d.top.map((x, i) => (
              <li key={i}>
                <span>{KIND_LABEL[x.kind] || x.kind} — {x.label || '—'}</span><b>{x.count}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="an-card">
          <div className="an-hd">Latest</div>
          <ul className="an-feed">
            {d.recent.map((r, i) => (
              <li key={i}>
                <span className="an-k">{KIND_LABEL[r.kind] || r.kind}</span>
                <span className="an-l">{r.label || '—'}</span>
                <span className="an-m">{r.country || '??'} · {r.ua_kind} · {source(r.referrer)}</span>
                <span className="an-t">{when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </>
      )}

      {/* Said plainly, because a number that looks like people is worth
          knowing the shape of. */}
      <p className="an-foot">
        Visitor addresses are shortened before they are stored, so these counts
        are visits rather than identified people. Bots are counted separately
        under Device.
      </p>
    </div>
  );
}
