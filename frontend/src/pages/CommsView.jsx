import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, authFetch } from '../lib/api';
import './comms.css';

/* How often the open page asks for anything new. Five seconds: the request is
   tiny — it asks only for events newer than the newest one already held, and
   almost always gets nothing back — and five seconds is short enough that a
   call landing while somebody is looking at the screen simply appears. */
const LIVE_MS = 5000;

/* ── small formatters ─────────────────────────────────────────────────── */

function digits(n) { return String(n || '').replace(/\D/g, ''); }
/** The key a person is grouped under — the last ten digits, so +1 and no +1 agree. */
function personKey(n) { return digits(n).slice(-10) || 'unknown'; }

function pretty(n) {
  if (!n) return 'Unknown number';
  const d = digits(n);
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return n;
}
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w[1]?.[0] || '')).toUpperCase() : '#';
}
function mmss(s) {
  if (s == null) return '';
  return Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
}
function ago(iso) {
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  if (mins < 1440) return Math.round(mins / 60) + 'h';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function clock(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function dayLabel(iso) {
  const d = new Date(iso), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
const other = (e) => (e.direction === 'incoming' ? e.from_number : e.to_number);
const missed = (e) => e.kind === 'call' && ['missed', 'no-answer', 'canceled', 'busy', 'failed'].includes(e.status);

/* 🏷️ Lead / Booked — matched on the server against this vendor's leads by the
   number's last ten digits (see leadBadges in routes/comms.js). */
const STATUS_WORD = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', cancelled: 'Cancelled' };
function badgeText(b) {
  if (b.kind === 'booked') {
    const d = b.event_date ? new Date(b.event_date) : null;
    return d ? `Booked · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : 'Booked';
  }
  return `Lead · ${STATUS_WORD[b.status] || 'Open'}`;
}
function Badge({ b, link }) {
  if (!b) return null;
  const cls = `cm-badge is-${b.kind}`;
  if (!link) return <span className={cls}>{badgeText(b)}</span>;
  return (
    <a className={cls} href={b.kind === 'booked' ? `/panel/bookings/${b.lead_id}` : `/panel/leads/${b.lead_id}`}
      title={b.kind === 'booked' ? 'Open this booking' : 'Open this lead'}>{badgeText(b)}</a>
  );
}

/** A call's summary is stored as "• point" lines, then "Next steps:" (see commsEnrich.js). */
function summaryParts(body) {
  const [main, next] = String(body || '').split(/\n\s*Next steps:\s*\n/);
  const pts = (s) => String(s || '').split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  return { points: pts(main), next: pts(next) };
}
function transcriptLines(raw) {
  if (!raw) return [];
  try { const t = JSON.parse(raw); if (Array.isArray(t?.lines)) return t.lines; } catch { /* plain text */ }
  return [{ t: null, us: false, text: String(raw) }];
}

/* ── one call ─────────────────────────────────────────────────────────── */

/** The recording is fetched only when somebody presses play — Quo's link expires, so it is never stored. */
function Recording({ id }) {
  const [state, setState] = useState({ s: 'idle' });
  useEffect(() => () => { if (state.url) URL.revokeObjectURL(state.url); }, [state.url]);
  async function load() {
    setState({ s: 'loading' });
    try {
      const r = await authFetch(`/comms/${id}/recording`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The recording could not be loaded');
      setState({ s: 'ready', url: URL.createObjectURL(await r.blob()) });
    } catch (e) { setState({ s: 'error', msg: e.message }); }
  }
  if (state.s === 'ready') return <audio className="cm-audio" controls autoPlay src={state.url} />;
  if (state.s === 'error') return <div className="cm-callerr">{state.msg}</div>;
  return (
    <button className="cm-play" disabled={state.s === 'loading'} onClick={load}>
      {state.s === 'loading' ? 'Loading recording…' : '▶ Play recording'}
    </button>
  );
}

function CallCard({ e, onLead, busy }) {
  const [open, setOpen] = useState(false);
  const { points, next } = summaryParts(e.body);
  const lines = transcriptLines(e.transcript);
  const isMissed = missed(e);
  return (
    <div className={`cm-call ${isMissed ? 'is-missed' : ''}`}>
      <div className="cm-call-top">
        <span className="cm-call-ic" aria-hidden="true">{isMissed ? '✕' : e.direction === 'incoming' ? '↙' : '↗'}</span>
        <span className="cm-call-what">
          {isMissed ? 'Missed call' : e.direction === 'incoming' ? 'Incoming call' : 'Outgoing call'}
        </span>
        {!isMissed && e.duration_sec != null && <span className="cm-call-len">{mmss(e.duration_sec)}</span>}
        <span className="cm-time">{clock(e.occurred_at)}</span>
      </div>

      {String(e.recording_url || '').startsWith('quo:') && <Recording id={e.id} />}

      {points.length > 0 && (
        <div className="cm-sum">
          <div className="cm-sub">Summary</div>
          <ul>{points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          {next.length > 0 && (<>
            <div className="cm-sub">Next steps</div>
            <ul>{next.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </>)}
        </div>
      )}

      {lines.length > 0 && (
        <div className="cm-trx">
          <button className="cm-link" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide transcript' : `Show transcript (${lines.length} lines)`}
          </button>
          {open && (
            <div className="cm-dialogue">
              {lines.map((l, i) => (
                <div key={i} className={`cm-line ${l.us ? 'is-us' : ''}`}>
                  <span className="cm-spk">{l.us ? 'You' : 'Caller'}{l.t != null ? ` ${mmss(l.t)}` : ''}</span>
                  <span className="cm-said">{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isMissed && !points.length && !lines.length && e.status === 'completed' && (
        <div className="cm-pending">Summary and transcript appear a few minutes after the call ends.</div>
      )}

      {/* Only on calls that actually said something — a missed call has nothing to read. */}
      {(points.length > 0 || lines.length > 0) && (
        <button className="cm-f cm-lead" disabled={busy} onClick={() => onLead(e)}>
          {busy ? 'Reading the call…' : '📋 Create lead from this call'}
        </button>
      )}
    </div>
  );
}

/**
 * 📞 Calls and messages, as they happen.
 *
 * People on the left; the whole conversation with one of them on the right —
 * texts as bubbles, calls as cards with their recording, summary and
 * transcript. On a phone the list and the conversation take turns.
 *
 * ⚠️ The live refresh is the point. A webhook that lands in a hundred
 * milliseconds is worth nothing if the page only loads on mount.
 */
export default function CommsView() {
  const [events, setEvents] = useState([]);
  const [badges, setBadges] = useState({});       // personKey → { kind: 'lead'|'booked', lead_id, … }
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [party, setParty] = useState(null);       // personKey of the open conversation
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState('');
  const [lead, setLead] = useState(null);         // the proposed lead, before it is saved
  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState(null);
  const newest = useRef(null);
  const streamRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const d = await api.comms({ kind, q });
      setEvents(d.events || []);
      setBadges(d.badges || {});
      newest.current = d.events?.[0]?.occurred_at || null;
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [kind, q]);

  useEffect(() => { load(); }, [load]);

  /* The live tick: only what is newer than the newest thing held. Rows that
     changed (a summary arriving after the call) come in on the next full load
     or Sync; the tick is for new arrivals. */
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;                 // a background tab need not poll
      try {
        const d = await api.comms({ kind, q, since: newest.current });
        const rows = d.events || [];
        if (!rows.length) return;
        newest.current = rows[0].occurred_at;
        if (d.badges) setBadges(prev => ({ ...prev, ...d.badges }));
        setEvents(prev => {
          const seen = new Set(prev.map(e => e.external_id));
          const add = rows.filter(r => !seen.has(r.external_id));
          return add.length ? [...add, ...prev] : prev;
        });
      } catch { /* a blip must not stop the next tick */ }
    };
    const t = setInterval(tick, LIVE_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [kind, q]);

  /* People, newest conversation first — built from the events themselves, so a
     call arriving while somebody watches joins its person at once. */
  const people = useMemo(() => {
    const by = new Map();
    for (const e of events) {                      // events arrive newest first
      const k = personKey(other(e));
      if (!by.has(k)) by.set(k, { key: k, number: other(e), name: null, last: e, calls: 0, texts: 0 });
      const p = by.get(k);
      if (e.contact_name && !p.name) { p.name = e.contact_name; p.saved = true; }   // saved: the name came from a Quo contact
      if (e.kind === 'call') p.calls++; else p.texts++;
    }
    // no saved Quo contact → the name on their lead, so a client is never just a number
    for (const p of by.values()) if (!p.name && badges[p.key]?.name) p.name = badges[p.key].name;
    return [...by.values()];
  }, [events, badges]);

  /* Badges kept fresh while the page is open: a lead created or marked booked
     somewhere else shows here within half a minute, without a reload. */
  const peopleKeys = people.map(p => p.key).join(',');
  useEffect(() => {
    if (!peopleKeys) return undefined;
    const refresh = () => { if (!document.hidden) api.commsBadges(peopleKeys.split(',')).then(d => setBadges(d.badges || {})).catch(() => {}); };
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [peopleKeys]);

  const active = people.find(p => p.key === party) || null;

  /* 🔔 Opened from a notification: go straight to that person. The event id
     arrives in sessionStorage (page just loaded) or as a 'cm-open' event
     (page already open); it waits until the events it names are loaded. */
  const [openEvent, setOpenEvent] = useState(() => sessionStorage.getItem('cm-open'));
  useEffect(() => {
    const on = () => setOpenEvent(sessionStorage.getItem('cm-open'));
    window.addEventListener('cm-open', on);
    return () => window.removeEventListener('cm-open', on);
  }, []);
  useEffect(() => {
    if (!openEvent || !events.length) return;
    const ev = events.find(e => String(e.id) === String(openEvent));
    if (!ev) return;                               // not loaded yet — the next live tick brings it
    setParty(personKey(other(ev)));
    sessionStorage.removeItem('cm-open');
    setOpenEvent(null);
  }, [openEvent, events]);
  /* On a wide screen the most recent conversation opens by itself — an empty
     right-hand side reads as "nothing here". A phone shows the list first. */
  useEffect(() => {
    if (!party && people.length && window.matchMedia('(min-width: 761px)').matches) setParty(people[0].key);
  }, [party, people]);
  const thread = useMemo(() => (active
    ? events.filter(e => personKey(other(e)) === active.key).slice().reverse()   // oldest → newest, like a chat
    : []), [events, active]);

  // newest at the bottom, like any chat — scrolled inside the conversation, never the whole page
  useEffect(() => { const s = streamRef.current; if (s) s.scrollTop = s.scrollHeight; }, [party, thread.length]);

  async function extract(ev) {
    setBusyId(ev.external_id); setErr('');
    try {
      const d = await api.commsExtract(ev.id);
      setLead({ ...d.lead, _eventId: ev.id, _from: ev.contact_name || pretty(other(ev)) });
    } catch (e) { setErr(e.message); }
    finally { setBusyId(null); }
  }

  async function createLead() {
    setSaving(true); setErr('');
    try {
      const d = await api.commsCreateLead(lead._eventId, lead);
      setLead(null);
      setMade(d.lead.name);
      setTimeout(() => setMade(null), 5000);
      // the person just became a lead — their badge appears now, not in half a minute
      api.commsBadges(people.map(p => p.key)).then(r => setBadges(r.badges || {})).catch(() => {});
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  /* ✍️ Save the person as a Quo contact — it shows in the Quo app on the phone
     too. Pre-filled from what is already known: their contact name, or the
     name and email on their lead. */
  const [contact, setContact] = useState(null);
  function openContact(p) {
    const b = badges[p.key];
    const [first, ...rest] = String(p.name || b?.name || '').trim().split(/\s+/);
    setContact({ number: p.number, first_name: first || '', last_name: rest.join(' '), email: b?.email || '', editing: !!p.saved });
  }
  async function saveContact() {
    setSaving(true); setErr('');
    try {
      const r = await api.commsSaveContact(contact);
      const k = personKey(contact.number);
      setEvents(prev => prev.map(e => (personKey(other(e)) === k ? { ...e, contact_name: r.name } : e)));
      setContact(null);
      setSynced(`✅ ${r.name} ${r.updated ? 'updated' : 'saved'} in Quo — it shows on your phone too`);
      setTimeout(() => setSynced(''), 6000);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  /* 💬 Texting from the thread. Sent through Quo from the business number, so
     it also shows in the Quo app; the sent text joins the conversation at once.
     Enter sends, Shift+Enter makes a new line — as in every chat app. */
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { setDraft(''); }, [party]);           // a half-written text never jumps to another person
  async function sendText() {
    const text = draft.trim();
    if (!text || !active?.number || sending) return;
    setSending(true); setErr('');
    try {
      const r = await api.commsSendText(active.number, text);
      if (r.event) {
        setEvents(prev => (prev.some(e => e.external_id === r.event.external_id) ? prev : [r.event, ...prev]));
        newest.current = r.event.occurred_at;
      }
      setDraft('');
    } catch (e) { setErr(e.message); }
    finally { setSending(false); }
  }

  /* A sync that found nothing new used to say nothing at all, so a working
     sync and a broken one looked the same. It always answers now. */
  async function syncNow() {
    setSyncing(true); setErr(''); setSynced('');
    try {
      const r = await api.commsSync();
      await load();
      const bits = [];
      if (r.added) bits.push(`${r.added} new`);
      if (r.filled) bits.push(`${r.filled} call${r.filled === 1 ? '' : 's'} filled in`);
      setSynced(r.note || (bits.length ? `✅ ${bits.join(', ')}` : '✅ Up to date — nothing new from Quo'));
      setTimeout(() => setSynced(''), 5000);
    } catch (e) { setErr(e.message); }
    finally { setSyncing(false); }
  }

  /* Day separators inside a conversation. */
  let lastDay = '';

  return (
    <div className={`cm ${active ? 'has-open' : ''}`}>
      <div className="cm-bar">
        <input className="cm-search" placeholder="Search a name, number or words said"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className={`cm-f ${kind === '' ? 'is-on' : ''}`} onClick={() => setKind('')}>All</button>
        <button className={`cm-f ${kind === 'call' ? 'is-on' : ''}`} onClick={() => setKind('call')}>📞 Calls</button>
        <button className={`cm-f ${kind === 'message' ? 'is-on' : ''}`} onClick={() => setKind('message')}>💬 Texts</button>
        <button className="cm-f" disabled={syncing} onClick={syncNow}>{syncing ? 'Syncing…' : '↻ Sync now'}</button>
        <span className="cm-live" title="New calls and texts appear on their own">● live</span>
      </div>

      {err && <div className="cm-err">⚠️ {err}</div>}
      {synced && <div className="cm-new">{synced}</div>}
      {made && <div className="cm-new">✅ Lead created for {made}</div>}

      {loading ? <p className="cm-quiet">Loading…</p>
       : events.length === 0 ? (
        <p className="cm-quiet">
          No calls or texts yet. They appear here as they happen once Quo is connected — press Sync now to fetch the last month.
        </p>
      ) : (
        <div className="cm-wrap">
          <nav className="cm-people" aria-label="People">
            {people.map(p => (
              <button key={p.key} className={`cm-person ${party === p.key ? 'is-on' : ''}`} onClick={() => setParty(p.key)}>
                <span className="cm-av" aria-hidden="true">{initials(p.name)}</span>
                <span className="cm-pmain">
                  <span className="cm-pname">{p.name || pretty(p.number)}</span>
                  <Badge b={badges[p.key]} />
                  <span className="cm-plast">
                    {p.last.kind === 'call'
                      ? (missed(p.last) ? 'Missed call' : `${p.last.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call ${mmss(p.last.duration_sec)}`)
                      : `${p.last.direction === 'outgoing' ? 'You: ' : ''}${p.last.body || 'Text'}`}
                  </span>
                </span>
                <span className="cm-pside">
                  <span className="cm-pwhen">{ago(p.last.occurred_at)}</span>
                  {missed(p.last) && <span className="cm-dot" title="Missed call" />}
                </span>
              </button>
            ))}
          </nav>

          <section className="cm-convo">
            {!active ? (
              <p className="cm-quiet cm-pick">Choose a person to see every call and text with them.</p>
            ) : (<>
              <header className="cm-chead">
                <button className="cm-back" onClick={() => setParty(null)} aria-label="Back to people">‹</button>
                <span className="cm-av is-big" aria-hidden="true">{initials(active.name)}</span>
                <span className="cm-cwho">
                  <span className="cm-cname">{active.name || pretty(active.number)}</span>
                  <Badge b={badges[active.key]} link />
                  {active.name && <span className="cm-cnum">{pretty(active.number)}</span>}
                  <span className="cm-ccount">{active.calls} call{active.calls === 1 ? '' : 's'}, {active.texts} text{active.texts === 1 ? '' : 's'}</span>
                </span>
                {active.number && (
                  <span className="cm-cacts">
                    <button className="cm-f" onClick={() => openContact(active)}>{active.saved ? 'Edit contact' : 'Save contact'}</button>
                    <a className="cm-f" href={`tel:${active.number}`}>Call</a>
                  </span>
                )}
              </header>

              <div className="cm-stream" ref={streamRef}>
                {thread.map(e => {
                  const day = dayLabel(e.occurred_at);
                  const sep = day !== lastDay ? (lastDay = day) : null;
                  return (
                    <div key={e.external_id}>
                      {sep && <div className="cm-day">{sep}</div>}
                      {e.kind === 'call'
                        ? <CallCard e={e} onLead={extract} busy={busyId === e.external_id} />
                        : (
                          <div className={`cm-msg ${e.direction === 'outgoing' ? 'is-out' : 'is-in'}`}>
                            <div className="cm-bubble">{e.body || <em>(no text)</em>}</div>
                            <div className="cm-mtime">{clock(e.occurred_at)}</div>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>

              {active.number && (
                <div className="cm-compose">
                  <textarea className="cm-draft" rows={1} maxLength={1600}
                    placeholder={`Text ${active.name || pretty(active.number)}`}
                    value={draft} onChange={ev => setDraft(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendText(); } }} />
                  <button className="cm-f is-on cm-send" disabled={sending || !draft.trim()} onClick={sendText}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                  {draft.length > 300 && <span className="cm-count">{draft.length}/1600</span>}
                </div>
              )}
            </>)}
          </section>
        </div>
      )}

      {contact && (
        <div className="cm-modal" onClick={() => setContact(null)}>
          <div className="cm-sheet" onClick={ev => ev.stopPropagation()}>
            <div className="cm-sheet-h">
              {contact.editing ? 'Update' : 'Save'} {pretty(contact.number)} as a contact in Quo. It shows in the Quo app on your phone too.
            </div>
            <div className="cm-grid">
              {[['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email (optional)']].map(([k, label]) => (
                <div key={k}>
                  <label className="lbl">{label}</label>
                  <input className="cm-input" type={k === 'email' ? 'email' : 'text'} autoComplete="off"
                    value={contact[k]} onChange={ev => setContact({ ...contact, [k]: ev.target.value })} />
                </div>
              ))}
            </div>
            <div className="cm-sheet-f">
              <button className="cm-f" onClick={() => setContact(null)}>Cancel</button>
              <button className="cm-f is-on" disabled={saving || !contact.first_name.trim()} onClick={saveContact}>
                {saving ? 'Saving…' : contact.editing ? 'Update contact' : 'Save contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lead && (
        <div className="cm-modal" onClick={() => setLead(null)}>
          <div className="cm-sheet" onClick={ev => ev.stopPropagation()}>
            <div className="cm-sheet-h">
              From the call with {lead._from}
              {lead.confidence !== 'high' && (
                <span className="cm-conf"> — {lead.confidence} confidence, check the details</span>
              )}
            </div>
            <div className="cm-grid">
              {[['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'],
                ['event_type', 'Event'], ['event_date', 'Date'], ['location', 'Location']].map(([k, label]) => (
                <div key={k}>
                  <label className="lbl">{label}</label>
                  <input className="cm-input" type={k === 'event_date' ? 'date' : 'text'}
                    value={lead[k] || ''} onChange={ev => setLead({ ...lead, [k]: ev.target.value })} />
                </div>
              ))}
            </div>
            <label className="lbl">Notes</label>
            <textarea className="cm-area" rows={7} value={lead.notes || ''}
              onChange={ev => setLead({ ...lead, notes: ev.target.value })} />
            <div className="cm-sheet-f">
              <button className="cm-f" onClick={() => setLead(null)}>Cancel</button>
              <button className="cm-f is-on" disabled={saving} onClick={createLead}>
                {saving ? 'Creating…' : '📋 Create lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
