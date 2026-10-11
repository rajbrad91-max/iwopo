/**
 * 👀 Tester activity report — TEMPORARY (see backend/src/routes/activity.js).
 * An unlinked page for the Super Admin: per day in Vancouver time, each sitting
 * (signed in from – to) and every panel page visited, from – to and how long.
 */
import { useEffect, useState } from 'react';
import { api, getUser } from '../lib/api';
import './testeractivity.css';

const dur = (s) => {
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60 ? `${s % 60}s` : ''}`.trim();
};

export default function TesterActivity() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const me = getUser();

  useEffect(() => {
    if (me?.role !== 'super_admin') return;
    api.testerActivity().then(setData).catch(e => setErr(e.message));
  }, [me?.role]);

  if (me?.role !== 'super_admin') return <div className="ta-wrap"><p className="ta-muted">Page not found.</p></div>;
  if (err) return <div className="ta-wrap"><p className="ta-muted">⚠️ {err}</p></div>;
  if (!data) return <div className="ta-wrap"><p className="ta-muted">Loading…</p></div>;

  return (
    <div className="ta-wrap">
      <h1 className="ta-h1">👀 Tester activity</h1>
      <p className="ta-muted">All times are Vancouver time · a "sitting" is continuous use with no gap over 10 minutes · refresh the page for the latest.</p>
      {data.people.map(p => (
        <section key={p.user.id} className="ta-person">
          <h2 className="ta-h2">{p.user.name} <span className="ta-muted">· {p.user.email}</span></h2>
          {!p.days.length && <p className="ta-muted">No activity yet.</p>}
          {/* ⏱️ all days together */}
          {!!p.days.length && (
            <div className="ta-grand">
              <span>⏱️ Total time, all days</span>
              <strong>{dur(p.days.reduce((t, d) => t + d.total_seconds, 0))}</strong>
              <span className="ta-muted">over {p.days.length} day{p.days.length === 1 ? '' : 's'} · {p.days.reduce((t, d) => t + d.sessions.length, 0)} sittings</span>
            </div>
          )}
          {/* each day folds open and shut — the newest is open */}
          {p.days.map((d, di) => (
            <details key={d.day} className="ta-day" open={di === 0}>
              <summary className="ta-day-h"><span className="ta-arrow" aria-hidden="true">▸</span><strong>{d.label}</strong><span className="ta-total">⏱️ {dur(d.total_seconds)} · {d.sessions.length} sitting{d.sessions.length === 1 ? '' : 's'}</span></summary>
              {d.sessions.map((s, i) => (
                <div key={i} className="ta-session">
                  <div className="ta-session-h">🟢 Signed in <strong>{s.from}</strong> → <strong>{s.to}</strong> <span className="ta-muted">({dur(s.seconds)})</span></div>
                  <table className="ta-table">
                    <thead><tr><th>Page</th><th>From</th><th>To</th><th>Time</th></tr></thead>
                    <tbody>
                      {s.visits.map((v, j) => (
                        <tr key={j} title={v.path}>
                          <td>{v.page}{v.source === 'log' && <span className="ta-tag">from server log</span>}</td>
                          <td>{v.from}</td><td>{v.to}</td><td>{dur(v.seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
