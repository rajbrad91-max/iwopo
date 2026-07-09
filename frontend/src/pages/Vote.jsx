import { useState, useEffect } from 'react';
import './vote.css';

const API = '/api/poll';

export default function Vote() {
  const [cfg, setCfg] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(API).then(r => r.json()).then(d => { setCfg(d); setMyVote(d.myVote); }).catch(() => {});
  }, []);

  async function vote(choice) {
    if (myVote || busy) return;
    setBusy(true);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }) });
      const d = await r.json();
      if (r.ok || d.myVote) setMyVote(d.myVote || choice);
    } catch {}
    finally { setBusy(false); }
  }

  async function loadStats(e) {
    e?.preventDefault();
    setPwErr('');
    try {
      const r = await fetch(`${API}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const d = await r.json();
      if (!r.ok) { setPwErr(d.error || 'Wrong password'); return; }
      setStats(d);
    } catch { setPwErr('Something went wrong'); }
  }

  if (!cfg) return <div className="vote-wrap"><div className="vote-msg">Loading…</div></div>;

  return (
    <div className="vote-wrap">
      <div className="vote-card">
        <div className="vote-kicker">Cast your vote</div>
        <h1 className="vote-title">{cfg.title}</h1>
        <div className="vote-sub">Tap the one you like. One vote per person.</div>

        <div className="vote-options">
          {cfg.options.map(name => (
            <button key={name} className={`vote-opt ${myVote === name ? 'chosen' : ''}`} disabled={!!myVote || busy} onClick={() => vote(name)}>
              <span>{name}</span>
              <span className="vote-tick">✓ your pick</span>
            </button>
          ))}
        </div>
        {myVote && <div className="vote-note">✅ Thanks — your vote is recorded.</div>}

        <button className="vote-results-toggle" onClick={() => setShowResults(v => !v)}>📊 See results</button>
        {showResults && (
          <div className="vote-results">
            {!stats ? (
              <form onSubmit={loadStats}>
                <div className="vote-pw-row">
                  <input className="vote-pw" type="password" placeholder="Enter password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
                  <button className="vote-pw-btn" type="submit">View</button>
                </div>
                {pwErr && <div className="vote-pw-err">⚠️ {pwErr}</div>}
              </form>
            ) : (
              <div className="vote-stats">
                <div className="vote-total">Total votes: {stats.total}</div>
                {[...stats.options].sort((a, b) => stats.counts[b] - stats.counts[a]).map(name => {
                  const c = stats.counts[name] || 0;
                  const pct = stats.total ? Math.round((c / stats.total) * 100) : 0;
                  return (
                    <div key={name} className="vote-stat-row">
                      <div className="vote-stat-top"><span className="vote-stat-name">{name}</span><span className="vote-stat-num">{c} · {pct}%</span></div>
                      <div className="vote-bar-track"><div className="vote-bar-fill" style={{ width: pct + '%' }} /></div>
                    </div>
                  );
                })}
                <button className="vote-refresh" onClick={() => loadStats()}>🔄 Refresh</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="vote-foot">Powered by iwopo</div>
    </div>
  );
}
