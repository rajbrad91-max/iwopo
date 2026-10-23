/**
 * 🤖 AI Agent — the vendor's private assistant (feature 'agent').
 * Loaded on demand; nobody without the feature downloads it.
 *
 * Type or TALK: 🎙️ the device turns speech into text and 🔊 reads the answer
 * back — both built into the browser, free, nothing leaves the device but the
 * words. Spoken questions get short spoken-style answers.
 * It reads the panel; it can propose an email or sending packages, shown as a
 * card — nothing goes out until the vendor presses Yes. It never sends a
 * contract. 🔔 Pop-ups bring the bell to this device; a tap opens this tab.
 */
import { useState, useEffect, useRef } from 'react';
import PpmBoard from './PpmBoard.jsx';
import { api, authFetch } from '../lib/api';
import './agent.css';

const SUGGEST = ["What's new today?", 'Any new leads this week?', 'Which events do I have this month?', 'Show me my packages'];
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const SPEAK_KEY = 'iwopo_agent_speak';

/** **bold** is the only markup the agent uses — shown as bold, never as asterisks. */
function Rich({ text }) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
/** What is read aloud: no markup, no list bullets. */
const spoken = (t) => String(t).replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/\n+/g, '. ');

/** The push key as the browser wants it. */
function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

/* 🧠 What the AI Agent (and Tornado) knows: facts the owner writes, things it
   was asked to remember, and the business briefing rebuilt every 15 minutes. */
/* 📚 The Knowledge page: tabs — Tornado's own mind first, then every page of
   the panel as plain sentences (Raj's lessons, 2026-10-12: "the knowledge
   base should have tabs … every page a separate tab … all tabs visible up
   top"). The sentences are kept current by the server (lib/agentKb.js). */
function Knowledge() {
  const [tab, setTab] = useState('mind');
  const [sections, setSections] = useState([]);
  useEffect(() => { api.agentKbSections().then(d => setSections(d.sections || [])).catch(() => {}); }, []);
  const current = sections.find(x => x.key === tab);
  return (
    <div className="ag-kb">
      <div className="ag-kb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mind'} className={`ag-kb-tab ${tab === 'mind' ? 'is-on' : ''}`} onClick={() => setTab('mind')}>🧠 Lessons & memory</button>
        <button type="button" role="tab" aria-selected={tab === 'rules'} className={`ag-kb-tab ${tab === 'rules' ? 'is-on' : ''}`} onClick={() => setTab('rules')}>📜 Rules</button>
        <button type="button" role="tab" aria-selected={tab === 'voice'} className={`ag-kb-tab ${tab === 'voice' ? 'is-on' : ''}`} onClick={() => setTab('voice')}>🎙️ Voice bank</button>
        <button type="button" role="tab" aria-selected={tab === 'gdoc'} className={`ag-kb-tab ${tab === 'gdoc' ? 'is-on' : ''}`} onClick={() => setTab('gdoc')}>📄 Google Doc</button>
        {sections.map(x => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`ag-kb-tab ${tab === x.key ? 'is-on' : ''}`} onClick={() => setTab(x.key)}>
            {x.label} <span className="ag-kb-n">{x.count}</span>
          </button>
        ))}
      </div>
      {tab === 'mind' ? <Mind /> : tab === 'rules' ? <Rules /> : tab === 'voice' ? <VoiceBank /> : tab === 'gdoc' ? <GoogleDoc /> : <KbList key={tab} section={tab} label={current?.label || ''} />}
    </div>
  );
}

/** One page of the panel, as the sentences Tornado reads — searchable. */
function KbList({ section, label }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => { api.agentKb(section, q).then(d => setRows(d.rows || [])).catch(() => setRows([])); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [section, q]);
  return (
    <section className="ag-k-card">
      <h3 className="ag-k-h">{label}</h3>
      <p className="ag-k-sub">What Tornado knows from this page — one sentence per record, kept up to date by itself.</p>
      <input className="ag-kb-search" type="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
      {rows === null ? <div className="ag-k-empty">Loading…</div>
        : rows.length ? <div className="ag-kb-cards">{rows.map(r => <KbCard key={r.id} text={r.text} />)}</div>
        : <div className="ag-k-empty">{q ? 'Nothing matches.' : 'Nothing here yet.'}</div>}
    </section>
  );
}

/* 📄 The knowledge base (never money) + the unseen updates, mirrored into one Google Doc — checked every minute — the Gemini app on the phone can
   read it (flat-rate, no tokens). Owner-only; the service-account key is pasted once and never shown again. */
function GoogleDoc() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.agentGdoc().then(x => { setD(x); setErr(''); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function save() {
    setBusy(true); setMsg('');
    try { setD(await api.agentGdocSetup({ ...(link ? { link } : {}), ...(key ? { key } : {}) })); setKey(''); setLink(''); setMsg('✅ Saved'); } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }
  async function sync() {
    setBusy(true); setMsg('');
    try { const r = await api.agentGdocSync(); setMsg(`✅ Synced — ${r.lines} lines`); await load(); } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }
  if (!d) return <section className="ag-k-card"><div className="ag-k-empty">{err ? `⚠️ ${err}` : 'Loading…'}</div></section>;
  return (
    <div className="ag-rules">
      <section className="ag-k-card">
        <h3 className="ag-k-h">📄 Your business, as one Google Doc</h3>
        <p className="ag-k-sub">Your business in one Google Doc — never any money — starting with "What are the updates" (only what you haven't seen yet). It is checked every minute and rewritten when something changes. Ask the Gemini app: "what are the updates in my doc?" — no Tornado tokens. Gemini can only read it; Tornado still does the actions.</p>
        {d.doc_url && <p className="ag-k-sub">📄 <a href={d.doc_url} target="_blank" rel="noreferrer">Open the doc</a>{d.last ? ` · last synced ${new Date(d.last.at).toLocaleString()} · ${d.last.lines} lines` : ' · not synced yet'}</p>}
        {d.error && <div className="av-msg">⚠️ {d.error}</div>}
        {d.service_account && <p className="ag-k-sub">🔐 Share the doc with <b>{d.service_account}</b> as <b>Editor</b> — it can open only what you share with it.</p>}
        <div className="ag-rule-actions">
          <button type="button" className="ag-rule-btn" disabled={busy || !d.doc_id || !d.service_account} onClick={sync}>{busy ? 'Working…' : '🔄 Sync now'}</button>
        </div>
        {msg && <div className="av-msg">{msg}</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">⚙️ Set up</h3>
        <label className="ag-gd-field">Google Doc link
          <input className="ag-gd-input" value={link} onChange={e => setLink(e.target.value)} placeholder={d.doc_id ? 'saved — paste a new link to change it' : 'https://docs.google.com/document/d/…'} />
        </label>
        <label className="ag-gd-field">Service-account key (the JSON file from Google Cloud)
          <textarea className="ag-gd-input ag-gd-key" value={key} onChange={e => setKey(e.target.value)} placeholder={d.service_account ? 'saved — paste a new key to change it' : '{ "type": "service_account", … }'} />
        </label>
        <div className="ag-rule-actions">
          <button type="button" className="ag-rule-btn" disabled={busy || (!link && !key)} onClick={save}>💾 Save</button>
        </div>
      </section>
    </div>
  );
}

/* 🎙️ The voice bank: Tornado's recorded lines (its own voice), how often each one is played on a
   wake-up, and the tokens that saved — every wake-up served from here skips a Gemini turn. */
function VoiceBank() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => api.agentVoiceBank().then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function play(key) {
    try {
      const r = await authFetch(`/agent/voice-clips/${key}`);         // the login travels in a header, never the URL
      const pcm = new Uint8Array(await r.arrayBuffer());
      const head = new DataView(new ArrayBuffer(44));
      const put = (o, s) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
      put(0, 'RIFF'); head.setUint32(4, 36 + pcm.length, true); put(8, 'WAVE'); put(12, 'fmt '); head.setUint32(16, 16, true);
      head.setUint16(20, 1, true); head.setUint16(22, 1, true); head.setUint32(24, 24000, true); head.setUint32(28, 48000, true);
      head.setUint16(32, 2, true); head.setUint16(34, 16, true); put(36, 'data'); head.setUint32(40, pcm.length, true);
      new Audio(URL.createObjectURL(new Blob([head.buffer, pcm], { type: 'audio/wav' }))).play();
    } catch (e) { setErr(e.message); }
  }
  async function again(key) {
    setBusy(key);
    try { await api.agentRecordClip(key); await load(); } catch (e) { setErr(e.message); }
    setBusy('');
  }
  if (!d) return <section className="ag-k-card"><div className="ag-k-empty">{err ? `⚠️ ${err}` : 'Loading…'}</div></section>;
  return (
    <div className="ag-rules">
      <section className="ag-k-card">
        <h3 className="ag-k-h">🎙️ Tornado's voice bank</h3>
        <p className="ag-k-sub">{d.clips.length} lines in Tornado's own voice, played by the phone when you open Tornado — no AI, no tokens. {d.wakeups.toLocaleString()} wake-ups served{d.since ? ` since ${d.since}` : ''} · about <b>{d.tokens_saved.toLocaleString()}</b> tokens saved. New lines reach the phone by themselves.</p>
        {err && <div className="av-msg">⚠️ {err}</div>}
      </section>
      <section className="ag-k-card">
        <ul className="ag-vb-list">
          {d.clips.map(c => (
            <li key={c.key} className="ag-vb-row">
              <button type="button" className="ag-rule-btn is-quiet" onClick={() => play(c.key)} aria-label={`Play ${c.text}`}>▶</button>
              <span className="ag-vb-text">{c.text}</span>
              <span className="ag-rule-size">{c.plays ? `${c.plays}× · ` : ''}{c.seconds} s</span>
              <button type="button" className="ag-rule-btn is-quiet" disabled={!!busy} onClick={() => again(c.key)}>{busy === c.key ? '…' : '⟳'}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* 📜 Exactly what Tornado reads when a conversation starts — and re-reads on every reply.
   The rules train themselves once a week from four weeks of conversation logs
   (lib/agentTraining.js) — Raj doesn't review them; 🔒 rules are never removed, and
   "Undo last training" puts a run's changes back (Raj, 2026-10-12). */
function Rules() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.agentRules().then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function act(kind) {
    setBusy(kind); setMsg('');
    try {
      const r = kind === 'train' ? await api.agentTrainRules() : await api.agentUndoTraining();
      setMsg(kind === 'train' ? `🧠 ${r.summary}` : `↩️ ${r.message}`);
      await load();
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy('');
  }
  if (!d) return <section className="ag-k-card"><div className="ag-k-empty">{err ? `⚠️ ${err}` : 'Loading…'}</div></section>;
  const last = d.runs.find(r => r.status !== 'running');
  return (
    <div className="ag-rules">
      <section className="ag-k-card">
        <h3 className="ag-k-h">📜 What Tornado reads on every reply</h3>
        <p className="ag-k-sub">About <b>{d.total_tokens.toLocaleString()}</b> tokens before the conversation itself: rules {d.rules_tokens.toLocaleString()} · tools {d.tools_tokens.toLocaleString()}. The rules train themselves every Sunday from the last four weeks of conversations — 🔒 rules are never removed.</p>
        <div className="ag-rule-actions">
          <button type="button" className="ag-rule-btn" disabled={!!busy} onClick={() => act('train')}>{busy === 'train' ? '🧠 Training… (about a minute)' : '🧠 Train now'}</button>
          <button type="button" className="ag-rule-btn is-quiet" disabled={!!busy} onClick={() => act('undo')}>{busy === 'undo' ? 'Undoing…' : '↩️ Undo last training'}</button>
        </div>
        {msg && <div className="av-msg">{msg}</div>}
        {last && (
          <p className="ag-rule-last">
            Last training: {new Date(last.at).toLocaleString()} — {last.summary}
            {last.chars_before && last.chars_after ? ` · ${last.chars_before.toLocaleString()} → ${last.chars_after.toLocaleString()} characters` : ''}
            {last.undone_at ? ' · undone' : ''}
          </p>
        )}
      </section>
      {d.rules.map((x, i) => (
        <section key={x.key} className="ag-k-card ag-rule">
          <div className="ag-rule-hd"><h4 className="ag-rule-title">{i + 1}. {x.title}{x.protected ? ' 🔒' : ''}</h4><span className="ag-rule-size">~{x.tokens} tokens{x.live ? ' · filled in live' : ''}</span></div>
          <p className="ag-rule-text">{x.text}</p>
        </section>
      ))}
      {d.history.length > 0 && (
        <section className="ag-k-card">
          <h3 className="ag-k-h">🧠 What the training changed</h3>
          <ul className="ag-k-list">
            {d.history.map((h, i) => <li key={i}><span>{new Date(h.at).toLocaleDateString()} · {h.action === 'add' ? '➕ added' : h.action === 'remove' ? '➖ removed' : '✏️ changed'} <b>{h.title}</b> — {h.reason}</span></li>)}
          </ul>
        </section>
      )}
      <section className="ag-k-card">
        <h3 className="ag-k-h">🧰 Tools ({d.tools.length})</h3>
        <div className="ag-kb-cards">
          {d.tools.map(t => (
            <article key={t.name} className="ag-kb-card">
              <div className="ag-rule-hd"><h4 className="ag-kb-title">{t.name}</h4><span className="ag-rule-size">~{t.tokens}</span></div>
              <p className="ag-rule-text">{t.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One record: "name | label: value | …" → a card with the name on top and labelled rows. */
function KbCard({ text }) {
  const [title, ...parts] = String(text).split(' | ');
  return (
    <article className="ag-kb-card">
      <h4 className="ag-kb-title">{title}</h4>
      <dl className="ag-kb-fields">
        {parts.map((p, i) => {
          const at = p.indexOf(': ');
          return at > 0
            ? <div key={i} className="ag-kb-row"><dt>{p.slice(0, at)}</dt><dd>{p.slice(at + 2)}</dd></div>
            : <div key={i} className="ag-kb-row"><dt /><dd>{p}</dd></div>;
        })}
      </dl>
    </article>
  );
}

/** Tornado's own mind: lessons, facts, memories, conversations, reminders, briefing. */
function Mind() {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const load = () => api.agentKnowledge().then(setData).catch(e => setErr(e.message));
  useEffect(() => { api.agentKnowledge().then(setData).catch(e => setErr(e.message)); }, []);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try { await api.agentAddFact(text.trim()); setText(''); load(); } catch (x) { setErr(x.message); }
  }
  async function drop(id) { await api.agentDeleteFact(id).catch(() => {}); load(); }
  async function forgetTalk(id) { await api.agentForgetConversation(id).catch(() => {}); load(); }
  async function dropReminder(id) { await api.agentDoneReminder(id).catch(() => {}); load(); }
  const when = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  async function refresh() { try { const r = await api.agentRefreshBriefing(); setData(d => ({ ...d, ...r })); } catch (x) { setErr(x.message); } }
  if (!data) return <div className="ag-know">{err ? `⚠️ ${err}` : 'Loading…'}</div>;
  const facts = data.items.filter(i => i.kind === 'fact'), mem = data.items.filter(i => i.kind === 'memory'), lessons = data.items.filter(i => ['lesson', 'in_rules', 'note'].includes(i.kind));
  const where = { in_rules: '✅ in the rules', note: '🛠️ for Claude', lesson: '⏳ sorting…' };
  const ago = Math.max(0, Math.round((Date.now() - new Date(data.briefingAt)) / 60000));

  return (
    <div className="ag-know">
      <section className="ag-k-card ag-k-lessons">
        <h3 className="ag-k-h">📝 Your notes &amp; lessons</h3>
        <p className="ag-k-sub">What you tell Tornado to note. Tornado doesn't re-read these (they would cost on every reply): how it should behave goes into its rules in a few words, and bugs or missing features are marked for Claude.</p>
        {lessons.length ? <ul className="ag-k-list">{lessons.map(l => <li key={l.id}><span>{l.text} <em className="ag-k-where">{where[l.kind]}</em></span><button type="button" className="ag-k-x" onClick={() => drop(l.id)} aria-label="Remove lesson">✕</button></li>)}</ul> : <div className="ag-k-empty">No lessons yet — tell Tornado "make a note…" when it gets something wrong.</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">📌 Facts you tell it</h3>
        <p className="ag-k-sub">How your business works — prices, policies, delivery times, what you never do. It uses these in every conversation.</p>
        <form className="ag-k-add" onSubmit={add}>
          <input value={text} maxLength={600} onChange={e => setText(e.target.value)} placeholder="e.g. Wedding photos are delivered within 6 weeks" aria-label="New fact" />
          <button className="ag-send" type="submit" disabled={!text.trim()}>Add</button>
        </form>
        {facts.length ? <ul className="ag-k-list">{facts.map(f => <li key={f.id}><span>{f.text}</span><button type="button" className="ag-k-x" onClick={() => drop(f.id)} aria-label="Remove">✕</button></li>)}</ul> : <div className="ag-k-empty">No facts yet.</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">🧠 What it remembers</h3>
        <p className="ag-k-sub">Things you asked it to remember while talking ("remember that…"). Remove anything that's wrong.</p>
        {mem.length ? <ul className="ag-k-list">{mem.map(m => <li key={m.id}><span>{m.text}</span><button type="button" className="ag-k-x" onClick={() => drop(m.id)} aria-label="Forget">✕</button></li>)}</ul> : <div className="ag-k-empty">Nothing remembered yet.</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">💬 What it remembers of your conversations</h3>
        <p className="ag-k-sub">A short summary of each talk with Tornado — the newest ones are what it starts every conversation with. Remove anything you want it to forget.</p>
        {(data.conversations || []).length ? <ul className="ag-k-list">{data.conversations.map(c => <li key={c.id}><span><span className="ag-k-when">{when(c.created_at)}</span>{c.summary}</span><button type="button" className="ag-k-x" onClick={() => forgetTalk(c.id)} aria-label="Forget this conversation">✕</button></li>)}</ul> : <div className="ag-k-empty">No conversations yet.</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">⏰ Open reminders</h3>
        <p className="ag-k-sub">Deliveries, tasks and alarms Tornado is keeping for you. ✓ marks one done.</p>
        {(data.reminders || []).length ? <ul className="ag-k-list">{data.reminders.map(r => <li key={r.id}><span><span className="ag-k-when">{when(r.due_at)} · {r.kind}</span>{r.title}</span><button type="button" className="ag-k-x" onClick={() => dropReminder(r.id)} aria-label="Mark done">✓</button></li>)}</ul> : <div className="ag-k-empty">No open reminders.</div>}
      </section>
      <section className="ag-k-card">
        <h3 className="ag-k-h">📊 Business briefing</h3>
        <p className="ag-k-sub">Rebuilt every 15 minutes from your leads, bookings, crew, packages and reminders · updated {ago === 0 ? 'just now' : `${ago} min ago`} <button type="button" className="ag-k-link" onClick={refresh}>Refresh now</button></p>
        <pre className="ag-k-brief">{data.briefing}</pre>
      </section>
    </div>
  );
}

export default function AgentView() {
  const [msgs, setMsgs] = useState([]);           // { role, content, proposal? }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [usage, setUsage] = useState(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem(SPEAK_KEY) !== 'off'; } catch { return true; } });
  const [pop, setPop] = useState('checking');      // checking | on | off | blocked | unsupported
  const [ppm, setPpm] = useState(false);           // 📋 the PPM Board instead of the chat
  const [know, setKnow] = useState(false);         // 🧠 the knowledge section instead of the chat
  const fromLink = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('voice') === '1';
  const end = useRef(null);
  const rec = useRef(null);

  useEffect(() => { api.agentUsage().then(setUsage).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  /* 📱 this page alone can be installed as an app — clients' pages never offer it */
  useEffect(() => {
    if (document.querySelector('link[rel="manifest"]')) return undefined;
    const l = document.createElement('link');
    l.rel = 'manifest'; l.href = '/agent.webmanifest';
    document.head.appendChild(l);
    return () => l.remove();
  }, []);

  /* 📱 the app's service worker, registered as soon as this tab opens — Chrome
     only offers "Install app" for a page that has one */
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/agent-sw.js', { scope: '/' }).catch(() => {});
  }, []);

  /* 🔔 is this device already getting pop-ups? */
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setPop('unsupported'); return; }
    if (Notification.permission === 'denied') { setPop('blocked'); return; }
    navigator.serviceWorker.getRegistration('/').then(r => r?.pushManager.getSubscription()).then(s => setPop(s ? 'on' : 'off')).catch(() => setPop('off'));
  }, []);

  function say(reply) {
    if (!speak || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken(reply));
    u.lang = navigator.language || 'en-US';
    window.speechSynthesis.speak(u);
  }

  async function send(q, voice = false) {
    const ask = (q ?? text).trim();
    if (!ask || busy) return;
    const next = [...msgs, { role: 'user', content: ask }];
    setMsgs(next); setText(''); setErr(''); setBusy(true);
    try {
      // the conversation sent to the agent is text only — proposal cards stay on screen
      const d = await api.agentChat(next.filter(m => !m.proposal).map(({ role, content }) => ({ role, content })), voice);
      setMsgs([...next, { role: 'assistant', content: d.reply }, ...(d.proposals || []).map(p => ({ role: 'assistant', content: '', proposal: { ...p, state: 'ask' } }))]);
      if (voice) say(d.reply);
      api.agentUsage().then(setUsage).catch(() => {});
    } catch (e) {
      setErr(e.message || 'The assistant could not answer');
      setMsgs(msgs);                              // give the question back to retry
      setText(ask);
    } finally { setBusy(false); }
  }

  /** 🎙️ Tap to talk: live words appear in the box; when you stop, it is asked. */
  function talk() {
    if (!Recognition) { setErr('This browser cannot listen — use Chrome or Edge.'); return; }
    if (listening) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel();
    const r = new Recognition();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    let heard = '';
    r.onresult = (e) => { heard = [...e.results].map(x => x[0].transcript).join(' '); setText(heard); };
    r.onerror = (e) => { if (e.error === 'not-allowed') setErr('Allow the microphone for this site to talk to the AI Agent.'); };
    r.onend = () => { setListening(false); if (heard.trim()) send(heard, true); };
    rec.current = r;
    setErr(''); setListening(true);
    r.start();
  }

  function toggleSpeak() {
    const v = !speak; setSpeak(v);
    try { localStorage.setItem(SPEAK_KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
    if (!v) window.speechSynthesis?.cancel();
  }

  /** 🔔 Pop-ups on this device: permission → service worker → subscription → server. */
  async function popups() {
    try {
      if (pop === 'on') {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { await api.agentPushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
        setPop('off'); return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPop(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/agent-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { key } = await api.agentPushKey();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api.agentPushSubscribe(sub.toJSON());
      setPop('on');
    } catch (e) { setErr(e.message || 'Pop-ups could not be turned on'); }
  }

  /** ✅ / ❌ on a proposed action */
  async function decide(i, yes) {
    const p = msgs[i].proposal;
    setMsgs(m => m.map((x, k) => (k === i ? { ...x, proposal: { ...p, state: 'busy' } } : x)));
    let note;
    if (yes) { const r = await api.agentConfirm(p.id).catch(e => ({ ok: false, message: e.message })); note = r.message; }
    else { await api.agentCancel(p.id).catch(() => {}); note = 'Cancelled — nothing was sent.'; }
    setMsgs(m => m.map((x, k) => (k === i ? { ...x, proposal: { ...p, state: yes ? 'done' : 'no', note } } : x)));
  }

  return (
    <div className="ag">
      <div className="ag-tools">
        <button type="button" className={`ag-tool ${know ? 'is-on' : ''}`} onClick={() => { setKnow(k => !k); setPpm(false); }} aria-pressed={know}>{know ? '💬 Back to chat' : '🧠 Knowledge & memory'}</button>
        <button type="button" className={`ag-tool ${ppm ? 'is-on' : ''}`} onClick={() => { setPpm(p => !p); setKnow(false); }} aria-pressed={ppm}>{ppm ? '💬 Back to chat' : '📋 PPM Board'}</button>
        <button type="button" className={`ag-tool ${speak ? 'is-on' : ''}`} onClick={toggleSpeak} aria-pressed={speak}>{speak ? '🔊 Reads answers aloud' : '🔇 Silent'}</button>
        {pop !== 'unsupported' && (
          <button type="button" className={`ag-tool ${pop === 'on' ? 'is-on' : ''}`} onClick={popups} disabled={pop === 'blocked' || pop === 'checking'}>
            {pop === 'on' ? '🔔 Pop-ups on — turn off' : pop === 'blocked' ? '🔕 Pop-ups blocked in this browser' : '🔔 Turn on pop-ups on this device'}
          </button>
        )}
      </div>
      {ppm ? <PpmBoard /> : know ? <Knowledge /> : (<>
      <div className="ag-chat">
        {msgs.length === 0 && (
          <div className="ag-hello">
            <div className="ag-hello-t">{fromLink ? '🎙️ Tap the microphone and talk to me.' : "🤖 Hi! Type, or tap 🎙️ and talk — ask about your leads, bookings and what's new."}</div>
            <div className="ag-chips">{SUGGEST.map(s => <button key={s} type="button" className="ag-chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (m.proposal ? (
          <div key={i} className="ag-card">
            <div className="ag-card-t">{m.proposal.title}</div>
            <div className="ag-card-d">{m.proposal.details}</div>
            {m.proposal.state === 'ask' && (
              <div className="ag-card-btns">
                <button type="button" className="ag-yes" onClick={() => decide(i, true)}>✅ Yes, send it</button>
                <button type="button" className="ag-no" onClick={() => decide(i, false)}>❌ No</button>
              </div>
            )}
            {m.proposal.state === 'busy' && <div className="ag-card-note">Working…</div>}
            {m.proposal.note && <div className="ag-card-note">{m.proposal.note}</div>}
          </div>
        ) : <div key={i} className={`ag-msg ${m.role === 'user' ? 'is-me' : ''}`}><Rich text={m.content} /></div>))}
        {busy && <div className="ag-msg ag-typing">Looking that up…</div>}
        <div ref={end} />
      </div>
      {err && <div className="ag-err">⚠️ {err}</div>}
      <form className="ag-bar" onSubmit={e => { e.preventDefault(); send(); }}>
        {Recognition && (
          <button type="button" className={`ag-mic ${listening ? 'is-on' : ''} ${fromLink && !listening && !msgs.length ? 'is-ready' : ''}`}
            onClick={talk} aria-label={listening ? 'Stop listening' : 'Talk'}>{listening ? '⏹️' : '🎙️'}</button>
        )}
        <textarea rows={1} value={text} placeholder={listening ? 'Listening…' : 'Ask anything…'} aria-label="Message"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="ag-send" type="submit" disabled={busy || !text.trim() || listening}>Send</button>
      </form>
      </>)}
      {usage && (
        <div className="ag-usage">
          {usage.ready ? `This month: $${usage.spentUsd.toFixed(2)} of $${usage.capUsd} · ${usage.requests} question${usage.requests === 1 ? '' : 's'}` : '⚠️ Needs its key — Super Admin → Settings → AI Agent'}
        </div>
      )}
    </div>
  );
}
