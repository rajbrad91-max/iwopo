/**
 * 🤖 AI Agent — chat with the vendor's private assistant (feature 'agent').
 * Loaded on demand; nobody without the feature downloads it.
 * It reads the panel and answers; it can propose an email or sending packages,
 * shown as a card — nothing goes out until the vendor presses Yes. It never
 * sends a contract. Voice and pop-ups come later.
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import './agent.css';

const SUGGEST = ["What's new today?", 'Any new leads this week?', 'Which events do I have this month?', 'Show me my packages'];

export default function AgentView() {
  const [msgs, setMsgs] = useState([]);           // { role, content, proposal? }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [usage, setUsage] = useState(null);
  const end = useRef(null);

  useEffect(() => { api.agentUsage().then(setUsage).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  async function send(q) {
    const say = (q ?? text).trim();
    if (!say || busy) return;
    const next = [...msgs, { role: 'user', content: say }];
    setMsgs(next); setText(''); setErr(''); setBusy(true);
    try {
      // the conversation sent to the agent is text only — proposal cards stay on screen
      const d = await api.agentChat(next.filter(m => !m.proposal).map(({ role, content }) => ({ role, content })));
      setMsgs([...next, { role: 'assistant', content: d.reply }, ...(d.proposals || []).map(p => ({ role: 'assistant', content: '', proposal: { ...p, state: 'ask' } }))]);
      api.agentUsage().then(setUsage).catch(() => {});
    } catch (e) {
      setErr(e.message || 'The assistant could not answer');
      setMsgs(msgs);                              // give the question back to retry
      setText(say);
    } finally { setBusy(false); }
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
      <div className="ag-chat">
        {msgs.length === 0 && (
          <div className="ag-hello">
            <div className="ag-hello-t">🤖 Hi! Ask me about your leads, bookings and what's new.</div>
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
        ) : <div key={i} className={`ag-msg ${m.role === 'user' ? 'is-me' : ''}`}>{m.content}</div>))}
        {busy && <div className="ag-msg ag-typing">Looking that up…</div>}
        <div ref={end} />
      </div>
      {err && <div className="ag-err">⚠️ {err}</div>}
      <form className="ag-bar" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea rows={1} value={text} placeholder="Ask anything about your business…" aria-label="Message"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="ag-send" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
      {usage && (
        <div className="ag-usage">
          {usage.ready ? `This month: $${usage.spentUsd.toFixed(2)} of $${usage.capUsd} · ${usage.requests} question${usage.requests === 1 ? '' : 's'}` : '⚠️ Needs its key — Super Admin → Settings → AI Agent'}
        </div>
      )}
    </div>
  );
}
