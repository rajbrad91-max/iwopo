import { useState, useEffect, useRef } from 'react';
import { api, getAuthToken, fmtDateTime } from '../lib/api';
import { chime } from '../lib/chime';
import './screenpop.css';

/**
 * 📞 Screen pop — who is calling, while the phone is still ringing.
 *
 * Holds an open connection to GET /api/comms/live (Server-Sent Events). When
 * Quo says a call is ringing, the server sends what iwopo knows about the
 * caller — name, Lead / Booked badge, the last call's summary, the last few
 * texts — and this card slides in. When the call ends it says so: an answered
 * call's card leaves on its own, a missed one stays until dismissed.
 *
 * Read with fetch, not EventSource: EventSource cannot send the Authorization
 * header, and putting the token in the URL would write it into server logs.
 *
 * 🔒 Private: loaded only for an account holding Calls & messages (see
 * VendorPanel), and the server only ever pops for the vendor Quo is
 * connected to.
 */

function pretty(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return n || 'Unknown number';
}
const day = (iso) => fmtDateTime(iso, { dateOnly: true });
function badgeText(b) {
  if (!b) return null;
  if (b.kind === 'booked') return b.event_date
    ? `Booked · ${new Date(b.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : 'Booked';
  return `Lead · ${({ new: 'New', contacted: 'Contacted', quoted: 'Quoted', cancelled: 'Cancelled' })[b.status] || 'Open'}`;
}

export default function ScreenPop({ onOpen }) {
  const [pops, setPops] = useState([]);           // newest first; normally just one
  const timers = useRef({});
  const popsRef = useRef([]);
  useEffect(() => { popsRef.current = pops; }, [pops]);

  /* 📋 "Create lead from this call?" — answered at the end of the call. If
     Quo has not written the transcript yet, the server waits for it. */
  async function askLead(p) {
    setPops(list => list.map(x => (x.call_id === p.call_id ? { ...x, leadNote: 'Asking…' } : x)));
    try {
      const r = await api.commsLeadRequest({ call_id: p.call_id });
      const note = r.state === 'created' ? '📋 Lead created — it is in Leads'
        : r.state === 'none' ? '🤷 That did not sound like an inquiry — no lead made'
        : r.state === 'no_ai' ? '🤖 Add the AI key in Super Admin → Settings → AI — the lead is then made by itself'
        : '⏳ The lead will be made when the transcript is ready — you will be notified';
      setPops(list => list.map(x => (x.call_id === p.call_id ? { ...x, leadNote: note } : x)));
    } catch (e) {
      setPops(list => list.map(x => (x.call_id === p.call_id ? { ...x, leadNote: `⚠️ ${e.message}` } : x)));
    }
    timers.current[p.call_id] = setTimeout(() => close(p.call_id), 6000);
  }

  useEffect(() => {
    let stop = false, controller = null, wait = 3000;

    async function connect() {
      while (!stop) {
        try {
          controller = new AbortController();
          const res = await fetch('/api/comms/live', {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(String(res.status));
          wait = 3000;                              // connected — reset the back-off
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let cut;
            while ((cut = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
              const data = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
              if (data) handle(JSON.parse(data));
            }
          }
        } catch { /* dropped or refused — try again after a pause */ }
        if (stop) break;
        await new Promise(r => setTimeout(r, wait));
        wait = Math.min(wait * 2, 30_000);         // a server restart is ridden out without hammering it
      }
    }

    function handle(msg) {
      if (msg.phase === 'ringing') {
        chime();
        setPops(p => [msg, ...p.filter(x => x.call_id !== msg.call_id)].slice(0, 3));
      } else if (msg.phase === 'ended') {
        const x = popsRef.current.find(y => y.call_id === msg.call_id);
        setPops(p => p.map(y => (y.call_id === msg.call_id ? { ...y, ended: true, missed: msg.missed } : y)));
        /* missed: stays until dismissed. Answered by someone who is not a lead
           yet: stays, asking "Create lead?". Answered by an existing lead or
           booking: the card has done its job and leaves. */
        if (x && !msg.missed && x.badge) timers.current[msg.call_id] = setTimeout(() => close(msg.call_id), 8000);
      }
    }

    connect();
    const t = timers.current;
    return () => { stop = true; controller?.abort(); Object.values(t).forEach(clearTimeout); };
  }, []);

  function close(id) { setPops(p => p.filter(x => x.call_id !== id)); }

  if (!pops.length) return null;
  return (
    <div className="sp-stack" role="region" aria-label="Incoming calls">
      {pops.map(p => {
        const badge = badgeText(p.badge);
        return (
          <div key={p.call_id} className={`sp-card ${p.ended ? (p.missed ? 'is-missed' : 'is-ended') : 'is-ringing'}`} role="alert">
            <div className="sp-top">
              <span className="sp-state">
                {p.ended ? (p.missed ? '📞 Missed call' : '📞 Call ended') : '📞 Incoming call'}
              </span>
              <button className="sp-x" onClick={() => close(p.call_id)} aria-label="Dismiss">✕</button>
            </div>

            <div className="sp-who">
              <span className="sp-name">{p.name || pretty(p.number)}</span>
              {p.name && <span className="sp-num">{pretty(p.number)}</span>}
              {badge && <span className={`sp-badge is-${p.badge.kind}`}>{badge}</span>}
              <span className="sp-count">
                {p.calls || p.texts ? `${p.calls} call${p.calls === 1 ? '' : 's'}, ${p.texts} text${p.texts === 1 ? '' : 's'} before` : 'First time calling'}
              </span>
            </div>

            {p.lastCall && (p.lastCall.summary.length > 0 || p.lastCall.opening.length > 0) && (
              <div className="sp-sec">
                <div className="sp-h">Last call · {day(p.lastCall.when)}</div>
                <ul>
                  {(p.lastCall.summary.length ? p.lastCall.summary : p.lastCall.opening).map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}

            {p.lastTexts?.length > 0 && (
              <div className="sp-sec">
                <div className="sp-h">Last texts</div>
                {p.lastTexts.map((t, i) => (
                  <div key={i} className={`sp-text ${t.out ? 'is-out' : ''}`}>
                    <span className="sp-tw">{t.out ? 'You' : 'Them'}</span>{t.body || '(no text)'}
                  </div>
                ))}
              </div>
            )}

            {/* 📋 the call is over and they are not a lead yet — ask */}
            {p.ended && !p.missed && !p.badge && (
              p.leadNote
                ? <div className="sp-note">{p.leadNote}</div>
                : (
                  <div className="sp-ask">
                    <div className="sp-h">Create a lead from this call?</div>
                    <div className="sp-ask-acts">
                      <button className="sp-open" onClick={() => askLead(p)}>📋 Yes, create lead</button>
                      <button className="sp-no" onClick={() => close(p.call_id)}>No thanks</button>
                    </div>
                  </div>
                )
            )}

            <button className="sp-open" onClick={() => { onOpen(p.number); close(p.call_id); }}>Open full history</button>
          </div>
        );
      })}
    </div>
  );
}
