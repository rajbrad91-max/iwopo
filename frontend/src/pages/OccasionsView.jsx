import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import './occasions.css';

/**
 * 🎉 Anniversaries and birthdays.
 *
 * The point is not forgetting. Everything here is arranged around that: what
 * is closest sits first, what has been wished moves out of the way, and the
 * draft is already written so sending is one read and one press.
 */
export default function OccasionsView() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);       // { lead_id, kind, subject, body }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.occasions()
      .then(d => setRows(d.occasions || []))
      .catch(e => { setErr(e.message); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openDraft(o) {
    setErr(''); setMsg('');
    try {
      const d = await api.occasionDraft(o.lead_id, o.kind);
      setDraft({ lead_id: o.lead_id, kind: o.kind, name: o.name, email: o.email, subject: d.subject, body: d.body });
    } catch (e) { setErr(e.message); }
  }

  async function send() {
    setBusy(true); setErr('');
    try {
      const r = await api.occasionSend(draft);
      setMsg(`Sent to ${r.to}`);
      setDraft(null);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !rows) return <div className="oc-quiet">Could not load — {err}</div>;
  if (!rows) return <div className="oc-quiet">Loading…</div>;

  if (!rows.length) {
    return (
      <div className="oc-quiet">
        Nothing coming up. Anniversaries appear here once an event has passed,
        counted from the date on the booking. Birthdays appear once you add one
        to a client.
      </div>
    );
  }

  const when = (d) => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;

  return (
    <div className="oc">
      {msg && <p className="oc-ok">✅ {msg}</p>}
      {err && <p className="oc-err">⚠️ {err}</p>}

      {rows.map(o => (
        <div key={`${o.lead_id}-${o.kind}`} className={`oc-card ${o.sent_at ? 'is-sent' : ''} ${o.days_away <= 1 ? 'is-soon' : ''}`}>
          <div className="oc-when">{when(o.days_away)}</div>

          <div className="oc-who">
            <span className="oc-ic">{o.kind === 'birthday' ? '🎂' : '🎉'}</span>
            <div>
              <div className="oc-name">{o.name || 'A client'}</div>
              <div className="oc-what">
                {o.kind === 'birthday'
                  ? 'Birthday'
                  : `${o.years} year${o.years === 1 ? '' : 's'} since their ${(o.event_type || 'wedding').toLowerCase()}`}
                {o.email && ` · ${o.email}`}
              </div>
            </div>
          </div>

          {o.sent_at
            ? <span className="oc-done">Wished</span>
            : <button className="refresh" onClick={() => openDraft(o)}>✉️ Write wishes</button>}
        </div>
      ))}

      {/* The draft opens already written. Raj reads it, changes what he wants
          and presses send — which is the whole point of drafting on the
          server rather than handing him a blank box. */}
      {draft && (
        <div className="oc-modal" onClick={() => setDraft(null)}>
          <div className="oc-sheet" onClick={e => e.stopPropagation()}>
            <div className="oc-sheet-h">
              To {draft.name} · {draft.email}
            </div>
            <label className="lbl">Subject</label>
            <input className="oc-input" value={draft.subject}
              onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            <label className="lbl">Message</label>
            <textarea className="oc-area" rows={14} value={draft.body}
              onChange={e => setDraft({ ...draft, body: e.target.value })} />
            <div className="oc-sheet-f">
              <button className="refresh" onClick={() => setDraft(null)}>Cancel</button>
              <button className="sa-btn-teal" disabled={busy} onClick={send}>
                {busy ? 'Sending…' : '📨 Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
