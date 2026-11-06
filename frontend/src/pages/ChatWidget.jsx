import { useState, useRef, useEffect } from 'react';
import './chatwidget.css';

// 💬 Wopo Assistant — the chat widget, for any public vendor page.
// The name is the vendor's own: they can rename their assistant, and the header
// and the greeting have to agree with what the bot calls itself in its replies.
export default function ChatWidget({ handle, businessName, botName }) {
  const bot = (botName || '').trim() || 'Wopo Assistant';
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [session] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const bodyRef = useRef(null);
  const inputRef = useRef(null);   // ⌨️ the cursor stays in the box, message after message
  const who = `${bot} from ${businessName || 'the team'}`;

  /* 👋 a few seconds after the page opens, a small card beside the bubble says hello (Raj, 2026-11-05). Its ✕ puts
     it away for the rest of the visit; opening the chat puts it away too. */
  const teaserKey = `cw-teaser-closed:${handle}`;
  const [teaser, setTeaser] = useState(false);
  useEffect(() => {
    let closed = false;
    try { closed = sessionStorage.getItem(teaserKey) === '1'; } catch { /* private mode: show it */ }
    if (closed) return undefined;
    const t = setTimeout(() => setTeaser(true), 4000);
    return () => clearTimeout(t);
  }, [teaserKey]);
  function putTeaserAway() {
    setTeaser(false);
    try { sessionStorage.setItem(teaserKey, '1'); } catch { /* private mode: it just returns next visit */ }
  }
  function openChat() { putTeaserAway(); setOpen(true); }

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ role: 'assistant', content: `Hi! I'm ${who} — how can I help?` }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the greeting is written once, when the chat first opens
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
      const r = await fetch(`/api/chatbot/chat/${handle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, session }),
      });
      const d = await r.json();
      setMsgs(m => [...m, { role: 'assistant', content: d.reply || "Sorry, I couldn't respond just now." }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: "Sorry, something went wrong. Please try again." }]);
    } finally { setBusy(false); inputRef.current?.focus(); }
  }

  if (!open) {
    return (
      <>
        {teaser && (
          <div className="cw-teaser" role="button" tabIndex={0} onClick={openChat}
            onKeyDown={e => { if (e.key === 'Enter') openChat(); }}>
            <button type="button" className="cw-teaser-x" aria-label="Close"
              onClick={e => { e.stopPropagation(); putTeaserAway(); }}>✕</button>
            <p className="cw-teaser-hi">👋 Hi! I'm <b>{bot}</b> from {businessName || 'the team'}.</p>
            <p className="cw-teaser-ask">Need help? Just ask!</p>
          </div>
        )}
        <button className="cw-bubble" onClick={openChat} title={`Chat with ${who}`}>💬</button>
      </>
    );
  }

  return (
    <div className="cw-panel">
      <div className="cw-head">
        <div>
          <div className="cw-name">{bot}</div>
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
        {/* never disabled while a reply comes: a disabled box loses the cursor (Raj, 2026-11-05) — the next message can be
            typed meanwhile, and Enter waits until the reply is in */}
        <input
          ref={inputRef}
          className="cw-input"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          autoFocus
        />
        <button className="cw-send" type="submit" disabled={busy || !input.trim()} onMouseDown={e => e.preventDefault()} title="Send">➤</button>
      </form>
    </div>
  );
}
