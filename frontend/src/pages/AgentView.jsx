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
import { api } from '../lib/api';
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

export default function AgentView() {
  const [msgs, setMsgs] = useState([]);           // { role, content, proposal? }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [usage, setUsage] = useState(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem(SPEAK_KEY) !== 'off'; } catch { return true; } });
  const [pop, setPop] = useState('checking');      // checking | on | off | blocked | unsupported
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
        <button type="button" className={`ag-tool ${speak ? 'is-on' : ''}`} onClick={toggleSpeak} aria-pressed={speak}>{speak ? '🔊 Reads answers aloud' : '🔇 Silent'}</button>
        {pop !== 'unsupported' && (
          <button type="button" className={`ag-tool ${pop === 'on' ? 'is-on' : ''}`} onClick={popups} disabled={pop === 'blocked' || pop === 'checking'}>
            {pop === 'on' ? '🔔 Pop-ups on — turn off' : pop === 'blocked' ? '🔕 Pop-ups blocked in this browser' : '🔔 Turn on pop-ups on this device'}
          </button>
        )}
      </div>
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
        <textarea rows={1} value={text} placeholder={listening ? 'Listening…' : 'Ask anything about your business…'} aria-label="Message"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="ag-send" type="submit" disabled={busy || !text.trim() || listening}>Send</button>
      </form>
      {usage && (
        <div className="ag-usage">
          {usage.ready ? `This month: $${usage.spentUsd.toFixed(2)} of $${usage.capUsd} · ${usage.requests} question${usage.requests === 1 ? '' : 's'}` : '⚠️ Needs its key — Super Admin → Settings → AI Agent'}
        </div>
      )}
    </div>
  );
}
