import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import './inbox.css';

const CommsView = lazy(() => import('./CommsView.jsx'));

/**
 * 📥 The owner's private inbox (Raj, 2026-10-22): one page, four tabs — Calls & Texts (Quo), Email (Gmail),
 * Instagram, WhatsApp. It lives inside the private Calls & Messages feature, so no other vendor can see it.
 */
const TABS = [['calls', '📞 Calls & Texts'], ['email', '📧 Email'], ['instagram', '📸 Instagram'], ['whatsapp', '💬 WhatsApp']];

export default function Inbox() {
  const [tab, setTab] = useState(() => {
    const q = new URLSearchParams(location.search).get('tab');
    return TABS.some(t => t[0] === q) ? q : (localStorage.getItem('inbox_tab') || 'calls');
  });
  const choose = (t) => { setTab(t); localStorage.setItem('inbox_tab', t); history.replaceState(null, '', t === 'calls' ? location.pathname : `${location.pathname}?tab=${t}`); };
  return (
    <div className="ib">
      <div className="ib-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`ib-tab ${tab === k ? 'is-on' : ''}`} onClick={() => choose(k)}>{l}</button>
        ))}
      </div>
      {tab === 'calls' && <Suspense fallback={<p className="ib-quiet">Loading…</p>}><CommsView /></Suspense>}
      {tab === 'email' && <EmailTab />}
      {tab === 'instagram' && <Soon icon="📸" name="Instagram" what="Direct messages from your business Instagram, with replies from here." />}
      {tab === 'whatsapp' && <Soon icon="💬" name="WhatsApp" what="Chats from your WhatsApp Business number, with replies from here." />}
    </div>
  );
}

function Soon({ icon, name, what }) {
  return (
    <div className="ib-empty">
      <div className="ib-empty-art" aria-hidden="true">{icon}</div>
      <p className="ib-empty-t">{name} isn&apos;t connected yet</p>
      <p className="ib-quiet">{what}</p>
    </div>
  );
}

const when = (d) => { const t = new Date(d); return Date.now() - t < 86400e3 ? t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const nameOf = (from) => String(from || '').replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from;
const addrOf = (from) => { const m = String(from || '').match(/<([^>]+)>/); return m ? m[1] : from; };

function EmailTab() {
  const dialog = useDialog();
  const [status, setStatus] = useState(null);
  const [threads, setThreads] = useState(null);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [open, setOpen] = useState(null);       // a thread being read
  const [reply, setReply] = useState('');
  const [compose, setCompose] = useState(null); // { to, subject, body }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => new URLSearchParams(location.search).get('email_error') || '');

  useEffect(() => { api.inboxEmailStatus().then(setStatus).catch(e => setStatus({ connected: false, error: e.message })); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qLive.trim()), 350); return () => clearTimeout(t); }, [qLive]);
  const load = useCallback(() => { api.inboxEmailThreads(q).then(d => setThreads(d.threads || [])).catch(e => { setThreads([]); setMsg(e.message); }); }, [q]);
  useEffect(() => { if (status?.connected) load(); }, [status?.connected, load]);

  async function connect() {
    try { const d = await api.inboxEmailConnect(); location.href = d.url; } catch (e) { setMsg(e.message); }
  }
  async function disconnect() {
    if (!await dialog.confirm('iwopo will stop reading and sending from this mailbox. Your emails stay in Gmail.', { title: 'Disconnect email?', okLabel: 'Disconnect', danger: true })) return;
    await api.inboxEmailDisconnect().catch(() => {}); setStatus({ connected: false, configured: true }); setThreads(null); setOpen(null);
  }
  async function read(id) {
    setReply(''); setOpen({ id, loading: true });
    try { setOpen(await api.inboxEmailThread(id)); setThreads(t => (t || []).map(x => (x.id === id ? { ...x, unread: false } : x))); }
    catch (e) { setOpen(null); setMsg(e.message); }
  }
  async function send(payload, after) {
    setBusy(true); setMsg('');
    try { const r = await api.inboxEmailSend(payload); setMsg(r.sandbox ? '🧪 Practice mode: not really sent.' : '✅ Sent'); after(); load(); }
    catch (e) { setMsg(`⚠️ Not sent: ${e.message} Your text is kept.`); }
    finally { setBusy(false); }
  }
  function sendReply() {
    const last = open.messages[open.messages.length - 1];
    const to = addrOf(last.from === status.email ? last.to : last.from);
    send({ to, subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, body: reply, threadId: open.id, replyTo: { messageId: last.messageId, references: last.references } },
      () => { setReply(''); read(open.id); });
  }
  async function closeCompose() {
    if ((compose.body || compose.to).trim() && !await dialog.confirm('Your email has not been sent. Discard it?', { title: 'Discard draft?', okLabel: 'Discard', danger: true })) return;
    setCompose(null);
  }

  if (!status) return <p className="ib-quiet">Loading…</p>;
  if (!status.connected) {
    return (
      <div className="ib-empty">
        <div className="ib-empty-art" aria-hidden="true">📧</div>
        <p className="ib-empty-t">Email isn&apos;t connected yet</p>
        <p className="ib-quiet">Connect your business Gmail to read and answer client emails here, next to their calls and texts.</p>
        {status.configured
          ? <button className="ib-btn is-on" onClick={connect}>Connect Gmail</button>
          : <p className="ib-quiet">It can be connected once email is set up for this account.</p>}
        {msg && <p className="ib-msg">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="ib-mail">
      <div className="ib-bar">
        <input className="ib-search" type="search" placeholder="Search email" value={qLive} onChange={e => setQLive(e.target.value)} aria-label="Search email" />
        <button className="ib-btn is-on" onClick={() => setCompose({ to: '', subject: '', body: '' })}>＋ New email</button>
        <span className={`ib-pill ${status.sandbox ? 'is-practice' : 'is-on'}`} title={status.sandbox ? 'Test site only: nothing is really sent' : 'Connected'}>
          {status.sandbox ? '● Practice mode' : `● ${status.email}`}
        </span>
        {!status.sandbox && <button className="ib-link" onClick={disconnect}>Disconnect</button>}
      </div>
      {msg && <p className="ib-msg">{msg}</p>}

      <div className={`ib-cols ${open ? 'has-open' : ''}`}>
        <ul className="ib-list">
          {threads === null ? <li className="ib-quiet">Loading…</li>
            : threads.length === 0 ? <li className="ib-quiet">{q ? `No results for "${q}".` : 'No emails yet.'}</li>
            : threads.map(t => (
              <li key={t.id}>
                <button className={`ib-row ${t.unread ? 'is-unread' : ''} ${open?.id === t.id ? 'is-on' : ''}`} onClick={() => read(t.id)}>
                  <span className="ib-row-top"><b>{nameOf(t.from)}</b><span className="ib-when">{when(t.date)}</span></span>
                  <span className="ib-row-sub">{t.subject}</span>
                  <span className="ib-row-snip">{t.snippet}</span>
                </button>
              </li>
            ))}
        </ul>

        {open && (
          <div className="ib-thread">
            <div className="ib-thread-h">
              <button className="ib-link" onClick={() => setOpen(null)}>‹ Back</button>
              <h3 className="ib-thread-t">{open.subject || '…'}</h3>
            </div>
            {open.loading ? <p className="ib-quiet">Loading…</p> : (<>
              {open.messages.map(m => (
                <div key={m.id} className={`ib-m ${addrOf(m.from) === status.email ? 'is-out' : ''}`}>
                  <div className="ib-m-h"><b>{nameOf(m.from)}</b><span className="ib-when">{new Date(m.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                  <div className="ib-m-body">{m.body || '(no text)'}</div>
                </div>
              ))}
              <div className="ib-reply">
                <textarea className="ib-input" rows={4} placeholder="Write a reply…" value={reply} onChange={e => setReply(e.target.value)} />
                <button className="ib-btn is-on" disabled={busy || !reply.trim()} onClick={sendReply}>{busy ? 'Sending…' : 'Send reply'}</button>
              </div>
            </>)}
          </div>
        )}
      </div>

      {compose && (
        <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeCompose(); }}>
          <div className="dlg-panel ib-compose" role="dialog" aria-label="New email">
            <h3 className="dlg-title">New email</h3>
            {status.sandbox && <p className="ib-practice">🧪 Practice mode (test site): nothing is ever sent.</p>}
            <p className="dlg-msg">From: <b>{status.email}</b></p>
            <input className="dlg-input" type="email" placeholder="To: client@example.com" value={compose.to} onChange={e => setCompose({ ...compose, to: e.target.value })} />
            <input className="dlg-input" placeholder="Subject" value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} />
            <textarea className="dlg-input" rows={7} placeholder="Message" value={compose.body} onChange={e => setCompose({ ...compose, body: e.target.value })} />
            <div className="dlg-actions">
              <button className="dlg-btn" onClick={closeCompose}>Cancel</button>
              <button className="dlg-btn is-primary" disabled={busy} onClick={() => send(compose, () => setCompose(null))}>{busy ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
