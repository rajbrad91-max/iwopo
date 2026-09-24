import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import './comms.css';

/* How often the open page asks for anything new. Five seconds: the request is
   tiny — it asks only for events newer than the newest one already held, and
   almost always gets nothing back — and five seconds is short enough that a
   call landing while somebody is looking at the screen simply appears. */
const LIVE_MS = 5000;

function when(iso) {
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  if (mins < 1440) return Math.round(mins / 60) + 'h ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function pretty(n) {
  if (!n) return 'Unknown';
  const d = String(n).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return n;
}

function mmss(s) {
  if (!s && s !== 0) return '';
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/**
 * 📞 Calls and messages, as they happen.
 *
 * ⚠️ The live refresh is the point. A webhook that lands in a hundred
 * milliseconds is worth nothing if the page only loads on mount — somebody
 * still has to press reload to see it, which is indistinguishable from the
 * data never arriving.
 */
export default function CommsView() {
  const [events, setEvents] = useState([]);
  const [threads, setThreads] = useState([]);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [party, setParty] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fresh, setFresh] = useState(0);          // how many arrived while watching
  const newest = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const d = await api.comms({ kind, q });
      setEvents(d.events || []);
      setThreads(d.threads || []);
      newest.current = d.events?.[0]?.occurred_at || null;
      setFresh(0);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [kind, q]);

  useEffect(() => { load(); }, [load]);

  /* The live tick. Asks only for what is newer than the newest thing held, so
     the usual answer is an empty list and the cost is close to nothing. */
  useEffect(() => {
    const tick = async () => {
      /* A background tab need not poll — and browsers throttle its timers to
         about once a minute anyway, so polling there would be a lie. */
      if (document.hidden) return;
      try {
        const d = await api.comms({ kind, q, since: newest.current });
        const rows = d.events || [];
        if (!rows.length) return;
        newest.current = rows[0].occurred_at;
        setEvents(prev => {
          const seen = new Set(prev.map(e => e.external_id));
          const add = rows.filter(r => !seen.has(r.external_id));
          if (!add.length) return prev;
          setFresh(f => f + add.length);
          return [...add, ...prev];
        });
      } catch { /* a blip must not stop the next tick */ }
    };

    const t = setInterval(tick, LIVE_MS);
    /* Coming back to the tab catches up at once rather than waiting out the
       remainder of a tick. Somebody returning to this page after a call has
       just ended should see it already there, not five seconds later. */
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [kind, q]);

  async function syncNow() {
    setSyncing(true);
    try { await api.commsSync(); await load(); }
    catch (e) { setErr(e.message); }
    finally { setSyncing(false); }
  }

  const shown = party ? events.filter(e => (e.direction === 'incoming' ? e.from_number : e.to_number) === party) : events;

  return (
    <div className="cm">
      <div className="cm-bar">
        <input className="cm-search" placeholder="Search number, name or text"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className={`cm-f ${kind === '' ? 'is-on' : ''}`} onClick={() => setKind('')}>All</button>
        <button className={`cm-f ${kind === 'call' ? 'is-on' : ''}`} onClick={() => setKind('call')}>📞 Calls</button>
        <button className={`cm-f ${kind === 'message' ? 'is-on' : ''}`} onClick={() => setKind('message')}>💬 Messages</button>
        <button className="cm-f" disabled={syncing} onClick={syncNow}>{syncing ? 'Syncing…' : '↻ Sync now'}</button>
        <span className="cm-live" title="Updating on its own">● live</span>
      </div>

      {fresh > 0 && (
        <div className="cm-new">{fresh} new {fresh === 1 ? 'item' : 'items'} arrived</div>
      )}

      {err && <div className="cm-err">⚠️ {err}</div>}

      {loading ? <p className="cm-quiet">Loading…</p>
       : events.length === 0 ? (
        <p className="cm-quiet">
          Nothing here yet. Calls and messages appear as they happen, once Quo
          is connected in the super admin settings.
        </p>
      ) : (
        <div className="cm-wrap">
          <div className="cm-threads">
            <div className="cm-hd">People</div>
            <button className={`cm-thread ${!party ? 'is-on' : ''}`} onClick={() => setParty(null)}>
              <span className="cm-tname">Everyone</span>
              <span className="cm-tmeta">{events.length}</span>
            </button>
            {threads.map(t => (
              <button key={t.party} className={`cm-thread ${party === t.party ? 'is-on' : ''}`}
                onClick={() => setParty(t.party)}>
                <span className="cm-tname">{t.name || pretty(t.party)}</span>
                <span className="cm-tmeta">{t.count} · {when(t.last)}</span>
              </button>
            ))}
          </div>

          <div className="cm-feed">
            {shown.map(e => (
              <div key={e.external_id} className={`cm-item is-${e.direction}`}>
                <div className="cm-top">
                  <span className="cm-kind">{e.kind === 'call' ? '📞' : '💬'}</span>
                  <span className="cm-who">
                    {e.contact_name || pretty(e.direction === 'incoming' ? e.from_number : e.to_number)}
                  </span>
                  <span className="cm-dir">{e.direction === 'incoming' ? 'in' : 'out'}</span>
                  {e.status && <span className={`cm-status is-${e.status}`}>{e.status}</span>}
                  {e.duration_sec != null && <span className="cm-dur">{mmss(e.duration_sec)}</span>}
                  <span className="cm-when">{when(e.occurred_at)}</span>
                </div>
                {e.body && <p className="cm-body">{e.body}</p>}
                {e.transcript && (
                  <details className="cm-tr">
                    <summary>Transcript</summary>
                    <p>{e.transcript}</p>
                  </details>
                )}
                {e.recording_url && (
                  <audio className="cm-audio" controls preload="none" src={e.recording_url} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
