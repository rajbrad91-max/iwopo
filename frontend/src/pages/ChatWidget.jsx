import { useState, useRef, useEffect } from 'react';
import './chatwidget.css';

// 💬 Tasveer chat widget — drop into any public vendor page.
export default function ChatWidget({ vendorId, businessName }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [session] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const bodyRef = useRef(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ role: 'assistant', content: `Hi! I'm Tasveer from ${businessName || 'the team'} — how can I help?` }]);
    }
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy]);

  async function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch(`/api/chatbot/chat/${vendorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, session }),
      });
      const d = await r.json();
      setMsgs(m => [...m, { role: 'assistant', content: d.reply || "Sorry, I couldn't respond just now." }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: "Sorry, something went wrong. Please try again." }]);
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button className="cw-bubble" onClick={() => setOpen(true)} title="Chat with us">💬</button>
    );
  }

  return (
    <div className="cw-panel">
      <div className="cw-head">
        <div>
          <div className="cw-name">Tasveer</div>
          <div className="cw-status">🟢 Online</div>
        </div>
        <button className="cw-x" onClick={() => setOpen(false)}>✕</button>
      </div>

      <div className="cw-body" ref={bodyRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`cw-msg ${m.role}`}>{m.content}</div>
        ))}
        {busy && <div className="cw-msg assistant cw-typing"><span></span><span></span><span></span></div>}
      </div>

      <form className="cw-input-row" onSubmit={send}>
        <input
          className="cw-input"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <button className="cw-send" type="submit" disabled={busy || !input.trim()}>➤</button>
      </form>
    </div>
  );
}
