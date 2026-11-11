/**
 * 🤖 AI Chat: the vendor’s Wopo Assistant — what it knows and its conversations.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api, fmtDateTime } from '../../lib/api';

// 🤖 Vendor AI Chat — conversation history (subscribed) or upsell (not)
// 📚 The fields the vendor fills in so their assistant knows the business.
// Order and wording are what the vendor reads, so they live here rather than
// being derived from the API's field list.
const KB_FIELDS = [
  ['bot_name', "Assistant's name", 'input', 'What your assistant calls itself. Defaults to Wopo Assistant.'],
  ['tagline', 'About us', 'area', 'A sentence or two about the business.'],
  ['about_team', 'About the team', 'area', 'Who you are, how long you have been going.'],
  ['contact', 'Contact info', 'area', 'Phone, email, how people reach you.'],
  ['service_area', 'Service area', 'area', 'Where you work, and how far you travel.'],
  ['hours', 'Hours', 'area', 'When you are reachable.'],
  ['services', 'Services offered', 'area', 'Photo, video, albums, anything else.'],
  ['languages', 'Languages spoken', 'area', 'So it can reply in the right one.'],
  ['delivery_time', 'Delivery time', 'area', 'How long clients wait for photos or video.'],
  ['packages', 'What packages include', 'area', 'Describe inclusions. Prices are only shared if you put them here.'],
  ['policies', 'Policies', 'area', 'Booking, deposit, travel, cancellation.'],
  ['faqs', 'Common questions', 'area', 'Question and answer pairs it should use first.'],
  ['avoid_topics', 'Things to avoid', 'area', 'Anything it should never discuss.'],
  ['tone_notes', 'Tone', 'area', 'How it should sound.'],
  ['notes', 'Other notes', 'area', 'Anything else worth knowing.'],
];

export function AiChatVendorView({ goServices }) {
  const [status, setStatus] = useState(null);
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('chats');          // chats | knowledge
  const [kb, setKb] = useState(null);
  const [kbMsg, setKbMsg] = useState('');
  const [kbBusy, setKbBusy] = useState(false);

  useEffect(() => {
    api.myChatbotStatus()
      .then(s => {
        setStatus(s);
        if (s.subscribed) {
          return Promise.all([
            api.myChatbotHistory().then(d => setConvos(d.conversations || [])).catch(() => {}),
            api.myChatbotKnowledge().then(d => setKb(d.knowledge || {})).catch(() => {}),
          ]);
        }
      })
      .catch(() => setStatus({ subscribed: false }))
      .finally(() => setLoading(false));
  }, []);

  async function saveKb() {
    setKbBusy(true); setKbMsg('');
    try {
      await api.saveMyChatbotKnowledge(kb || {});
      setKbMsg('✅ Saved');
      setTimeout(() => setKbMsg(''), 1600);
    } catch (e) { setKbMsg('⚠️ ' + e.message); }
    finally { setKbBusy(false); }
  }

  // ✏️ Rename the assistant from where its name is shown. The field also lives
  // in the Knowledge tab, but a vendor looking at "🤖 Aria" at the top of the
  // page reaches for that, not for the first row of a fifteen-field form.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  async function saveName() {
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === (kb?.bot_name || '')) return;
    setKb(s => ({ ...s, bot_name: next }));            // show it straight away
    try {
      // only the one field — the server leaves everything else untouched
      await api.saveMyChatbotKnowledge({ bot_name: next });
    } catch (e) { setKbMsg('⚠️ ' + e.message); setTimeout(() => setKbMsg(''), 3000); }
  }

  // the assistant's own name, used everywhere it's referred to
  const botName = (kb?.bot_name || '').trim() || 'Wopo Assistant';
  // a conversation is titled by whoever was in it; the name is learned when the
  // visitor books or leaves a message, so older chats stay anonymous
  const titleOf = (c) => c.visitor_name || 'Visitor';

  if (loading) return <div className="loading">Loading…</div>;

  // 🚫 not subscribed → upsell
  if (!status?.subscribed) {
    return (
      <div className="table-wrap ac-upsell">
        <div className="ac-upsell-icon">🤖</div>
        <h2 className="ac-upsell-title">Meet Wopo Assistant, your AI assistant</h2>
        <p className="ac-upsell-text">
          Wopo Assistant chats with visitors on your inquiry page 24/7 — answering their questions,
          collecting their details, and saving them straight into your Leads. You'll see every
          conversation right here.
        </p>
        <ul className="ac-upsell-list">
          <li>💬 Answers questions using your own info</li>
          <li>📋 Captures leads automatically, day and night</li>
          <li>🌍 Replies in your client's language</li>
          <li>📨 Passes messages straight to you</li>
        </ul>
        <button className="refresh ac-upsell-btn" onClick={goServices}>✨ Add AI Chat to my plan</button>
      </div>
    );
  }

  // ⚪ subscribed but switched off
  if (!status.active) {
    return (
      <div className="table-wrap ac-upsell">
        <div className="ac-upsell-icon">⏸️</div>
        <h2 className="ac-upsell-title">Your AI Chat is paused</h2>
        <p className="ac-upsell-text">Wopo Assistant isn't answering visitors right now. Get in touch and we'll switch it back on.</p>
      </div>
    );
  }

  // 💬 reading one conversation
  if (open) {
    return (
      <>
        <button className="refresh ac-back" onClick={() => setOpen(null)}>← All conversations</button>
        <div className="table-wrap ac-thread">
          <div className="ac-thread-head">
            👤 {titleOf(open)} · {fmtDateTime(open.messages[0].at)}
          </div>
          {open.messages.map((m, i) => (
            <div key={i} className={`ac-msg ${m.role}`}>
              <div className="ac-msg-who">{m.role === 'user' ? `👤 ${titleOf(open)}` : `🤖 ${botName}`}</div>
              <div className="ac-msg-text">{m.content}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // 📜 conversations + knowledge
  return (
    <>
      <div className="ac-head">
        <div>
          {renaming ? (
            <input
              className="ac-name-input" autoFocus value={draftName} maxLength={40}
              onChange={e => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <div className="ac-title">
              🤖 {botName}
              <button type="button" className="ac-rename" title="Rename your assistant"
                onClick={() => { setDraftName(kb?.bot_name || botName); setRenaming(true); }}>✏️</button>
            </div>
          )}
          <div className="ac-sub">
            {tab === 'chats'
              ? `${convos.length} conversation${convos.length === 1 ? '' : 's'} · kept for 30 days`
              : 'What your assistant knows about your business'}
          </div>
        </div>
        <div className="ac-tabs">
          <button type="button" className={`ac-tab ${tab === 'chats' ? 'is-on' : ''}`} onClick={() => setTab('chats')}>💬 Conversations</button>
          <button type="button" className={`ac-tab ${tab === 'knowledge' ? 'is-on' : ''}`} onClick={() => setTab('knowledge')}>📚 Knowledge</button>
        </div>
      </div>

      {tab === 'knowledge' ? (
        <div className="table-wrap ac-kb">
          {KB_FIELDS.map(([key, label, kind, hint]) => (
            <div className="ac-kb-row" key={key}>
              <label className="ac-kb-label" htmlFor={`kb-${key}`}>{label}</label>
              <p className="ac-kb-hint">{hint}</p>
              {kind === 'input' ? (
                <input id={`kb-${key}`} className="ac-kb-input" value={kb?.[key] || ''}
                  placeholder="Wopo Assistant"
                  onChange={e => setKb(s => ({ ...s, [key]: e.target.value }))} />
              ) : (
                <textarea id={`kb-${key}`} className="ac-kb-area" rows={3} value={kb?.[key] || ''}
                  onChange={e => setKb(s => ({ ...s, [key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="ac-kb-foot">
            {kbMsg && <span className="ac-kb-msg">{kbMsg}</span>}
            <button className="refresh" onClick={saveKb} disabled={kbBusy}>
              {kbBusy ? 'Saving…' : '💾 Save knowledge'}
            </button>
          </div>
        </div>
      ) : convos.length === 0 ? (
        <div className="table-wrap ac-empty">No conversations yet. When visitors chat with {botName}, they&apos;ll appear here 💬</div>
      ) : (
        <div className="ac-list">
          {convos.map(c => {
            const first = c.messages.find(m => m.role === 'user');
            return (
              <div key={c.session} className="ac-card" onClick={() => setOpen(c)}>
                <div className="ac-card-main">
                  <div className="ac-card-who">👤 {titleOf(c)}</div>
                  <div className="ac-card-snippet">{first ? first.content : '—'}</div>
                  <div className="ac-card-meta">{c.messages.length} messages</div>
                </div>
                <div className="ac-card-date">{fmtDateTime(c.last_at, { dateOnly: true })}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
