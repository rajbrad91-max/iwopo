/**
 * 🤖 AI Chat: subscribers, costs, the API key and the knowledge base.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api, fmtDateTime } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';

/* ---------- SETTINGS ---------- */
// 🤖 AI Chat — subscribers + knowledge pages
const KFIELDS = [
  { k: 'business_name', label: '🏢 Business name', type: 'input' },
  { k: 'tagline', label: 'About us / tagline', type: 'area' },
  { k: 'about_team', label: '👥 About the team', type: 'area' },
  { k: 'service_area', label: '📍 City / service area', type: 'input' },
  { k: 'contact', label: '📞 Contact (phone / email / socials)', type: 'area' },
  { k: 'hours', label: '🕒 Hours', type: 'input' },
  { k: 'services', label: '📸 Services offered', type: 'area' },
  { k: 'languages', label: '🗣️ Languages the team speaks', type: 'input' },
  { k: 'delivery_time', label: '⏱️ Delivery / turnaround time', type: 'input' },
  { k: 'packages', label: '💰 Packages (what they include — prices optional)', type: 'area' },
  { k: 'faqs', label: '❓ FAQs (Q: … / A: …)', type: 'area' },
  { k: 'policies', label: '📋 Policies (booking, deposit, travel, cancellation)', type: 'area' },
  { k: 'avoid_topics', label: '🚫 Things to avoid', type: 'area' },
  { k: 'tone_notes', label: '🎭 Tone / personality notes', type: 'area' },
  { k: 'notes', label: '📝 Anything else', type: 'area' },
];

export function AiChatView({ vendors }) {
  const dialog = useDialog();
  const [tab, setTab] = useState('subs');
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openVendor, setOpenVendor] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);
  function load() {
    setLoading(true);
    api.chatbotSubscribers().then(d => setSubs(d.subscribers || [])).catch(() => {}).finally(() => setLoading(false));
  }
  async function toggleActive(s) {
    try { await api.chatbotSetActive(s.vendor_id, !s.active); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function addSub(vendorId) {
    if (!vendorId) return;
    try { await api.chatbotAddSubscriber(Number(vendorId)); setAdding(false); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function removeSub(s) {
    if (!await dialog.confirm(`${s.business_name} will lose access to the AI chatbot.`, { title: 'Remove from chatbot?', okLabel: 'Remove' })) return;
    try { await api.chatbotRemoveSubscriber(s.vendor_id); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  if (openVendor) return <KnowledgePage vendorId={openVendor} onBack={() => { setOpenVendor(null); load(); }} />;

  const notSubscribed = vendors.filter(v => !subs.some(s => s.vendor_id === v.id));

  return (
    <>
      <div className="cb-tabs">
        <button className={`cb-tab ${tab === 'subs' ? 'on' : ''}`} onClick={() => setTab('subs')}>👥 Subscribers</button>
        <button className={`cb-tab ${tab === 'costs' ? 'on' : ''}`} onClick={() => setTab('costs')}>💰 Costs</button>
        <button className={`cb-tab ${tab === 'api' ? 'on' : ''}`} onClick={() => setTab('api')}>🔑 API Key</button>
      </div>

      {tab === 'costs' && <ChatbotCosts />}
      {tab === 'api' && <ChatbotApiKey />}
      {tab === 'subs' && (
        <>
          <div className="cb-head">
            <div>
              <div className="sa-section-title">🤖 Chatbot Subscribers</div>
              <div className="cb-sub">{subs.length} subscriber{subs.length === 1 ? '' : 's'} · {subs.filter(s => s.active).length} active</div>
            </div>
            {!adding ? (
              <button className="sa-btn-teal cb-add-btn" onClick={() => setAdding(true)}>➕ Add subscriber</button>
            ) : (
              <div className="cb-add-row">
                <select className="cb-select" defaultValue="" onChange={e => addSub(e.target.value)}>
                  <option value="">Pick a vendor…</option>
                  {notSubscribed.map(v => <option key={v.id} value={v.id}>{v.business_name}</option>)}
                </select>
                <button className="cb-cancel" onClick={() => setAdding(false)}>✕</button>
              </div>
            )}
          </div>

          {loading ? <div className="sa-loading">Loading…</div>
            : subs.length === 0 ? <div className="sa-box cb-empty">No chatbot subscribers yet. Add one above 🤖</div>
            : (
              <div className="cb-list">
                {subs.map(s => (
                  <div key={s.vendor_id} className="cb-card" onClick={() => setOpenVendor(s.vendor_id)}>
                    <div className="cb-card-main">
                      <div className="cb-card-name">{s.business_name}</div>
                      <div className="cb-card-meta">
                        {s.email} · {s.has_knowledge ? '📚 Knowledge filled' : '📭 No knowledge yet'}
                      </div>
                    </div>
                    <div className="cb-card-right" onClick={e => e.stopPropagation()}>
                      <span className={`cb-status ${s.active ? 'on' : 'off'}`}>{s.active ? '🟢 Active' : '⚪ Inactive'}</span>
                      <button className={`cb-toggle ${s.active ? 'on' : ''}`} onClick={() => toggleActive(s)} title={s.active ? 'Turn off' : 'Turn on'}>
                        <span className="cb-knob" />
                      </button>
                      <button className="cb-del" onClick={() => removeSub(s)} title="Remove">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </>
  );
}

// 💰 per-vendor cost tracking
function ChatbotCosts() {
  const [d, setD] = useState(null);
  useEffect(() => { api.chatbotCosts().then(setD).catch(() => {}); }, []);
  if (!d) return <div className="sa-loading">Loading…</div>;
  return (
    <>
      <div className="sa-section-title">💰 Chatbot Costs</div>
      <div className="cb-sub">What each vendor's chatbot is costing you (Anthropic API usage).</div>
      <div className="cb-total">Total spend: <b>${d.total_usd.toFixed(4)}</b></div>
      {d.vendors.length === 0 ? <div className="sa-box cb-empty">No chatbot usage yet.</div> : (
        <div className="table-wrap">
          <table className="sa-table">
            <thead><tr><th>Vendor</th><th>Messages</th><th>Input tokens</th><th>Output tokens</th><th>Cost</th><th>Last used</th></tr></thead>
            <tbody>
              {d.vendors.map(v => (
                <tr key={v.vendor_id}>
                  <td>{v.business_name}</td>
                  <td>{v.messages}</td>
                  <td>{Number(v.input_tokens).toLocaleString()}</td>
                  <td>{Number(v.output_tokens).toLocaleString()}</td>
                  <td><b>${Number(v.cost_usd).toFixed(4)}</b></td>
                  <td>{v.last_used ? fmtDateTime(v.last_used, { dateOnly: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* 🌪️ Tornado's voice on Google Gemini Live: the key (hidden like the others) and
   which of Google's male voices it speaks with (Raj, 2026-10-11: Gemini Live
   is a few dollars a month; ElevenLabs agents were ~1,000 credits a minute). */
function ApiKeyBox({ field, modelField, title, sub, modelHint, missing }) {
  const [s, setS] = useState(null);
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.platformSettings().then(r => setS(r.settings || {})).catch(() => {}); }, []);
  if (!s) return <div className="sa-loading">Loading…</div>;

  async function startEdit() {
    setEditing(true); setShow(false);
    setS(v => ({ ...v, [field]: '' }));                  // 🔒 write-only: paste a new key, or leave empty to keep the current one
  }
  async function save() {
    try {
      await api.savePlatformSettings({ [field]: s[field], [modelField]: s[modelField] });
      setEditing(false); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1800);
      api.platformSettings().then(r => setS(r.settings || {})).catch(() => {});
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  const val = () => (editing ? (s[field] || '') : (s[field] ? '••••••••••••••••' : ''));

  return (
    <>
      <div className="sa-section-title">{title}</div>
      <div className="cb-sub">{sub}</div>
      <div className="sa-box cb-api">
        <div className="cb-api-row">
          <div className="cb-api-field">
            <label className="lbl">API Key</label>
            <input className="cb-input" type={editing && !show ? 'password' : 'text'} readOnly={!editing} value={val()} autoComplete="off"
              placeholder={editing ? 'Paste a new key (empty keeps the current one)' : 'not set'}
              onChange={e => setS({ ...s, [field]: e.target.value })} />
          </div>
          <div className="cb-api-field">
            <label className="lbl">Model (optional)</label>
            <input className="cb-input" readOnly={!editing} value={s[modelField] || ''}
              placeholder={modelHint}
              onChange={e => setS({ ...s, [modelField]: e.target.value })} />
          </div>
        </div>
        <div className="cb-api-actions">
          {!editing ? (
            <button className="sa-btn-teal" onClick={startEdit}>✏️ Edit</button>
          ) : (
            <>
              <button className="sa-btn-teal" onClick={() => setShow(v => !v)}>{show ? '🙈 Hide' : '👁️ Show'}</button>
              <button className="sa-btn-teal" onClick={save}>💾 Save</button>
              <button className="cb-cancel" onClick={() => { setEditing(false); setShow(false); }}>✕</button>
            </>
          )}
          {msg && <span className="cb-msg">{msg}</span>}
        </div>
        {!s[field] && <div className="cb-warn">⚠️ {missing}</div>}
      </div>
    </>
  );
}

function ChatbotApiKey() {
  return (
    <>
      <ApiKeyBox field="anthropic_api_key" modelField="anthropic_model" title="🔑 AI Chatbot key"
        sub="Powers Wopo Assistant for every subscriber, leads from calls and photo descriptions. Kept masked."
        modelHint="claude-haiku-5-5"
        missing="No key — Wopo Assistant replies with a fallback message until you add one." />
    </>
  );
}

// ❓📨 unanswered questions + visitor messages for a vendor
function ChatbotInbox({ vendorId }) {
  const dialog = useDialog();
  const [pending, setPending] = useState([]);
  const [messages, setMessages] = useState([]);
  const [answers, setAnswers] = useState({});

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [vendorId]);
  function load() {
    api.chatbotPending(vendorId).then(d => setPending(d.pending || [])).catch(() => {});
    api.chatbotMessages(vendorId).then(d => setMessages(d.messages || [])).catch(() => {});
  }
  async function resolve(p, dismiss) {
    try { await api.chatbotResolvePending(p.id, answers[p.id] || '', dismiss); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function markRead(m) {
    try { await api.chatbotMarkRead(m.id); load(); } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  const unread = messages.filter(m => m.status === 'unread');
  if (pending.length === 0 && messages.length === 0) return null;

  return (
    <>
      {pending.length > 0 && (
        <div className="sa-box cb-inbox">
          <div className="cb-inbox-title">❓ Questions Wopo Assistant couldn't answer ({pending.length})</div>
          <div className="cb-inbox-hint">Answer these, then add them to the FAQs below so Wopo Assistant knows next time.</div>
          {pending.map(p => (
            <div key={p.id} className="cb-pending">
              <div className="cb-pending-q">“{p.question}”</div>
              <div className="cb-pending-row">
                <input className="cb-input" placeholder="Answer (optional — for your reference)"
                  value={answers[p.id] || ''} onChange={e => setAnswers({ ...answers, [p.id]: e.target.value })} />
                <button className="sa-btn-teal" onClick={() => resolve(p, false)}>✅ Done</button>
                <button className="cb-cancel" onClick={() => resolve(p, true)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="sa-box cb-inbox">
          <div className="cb-inbox-title">📨 Messages for the vendor ({unread.length} unread)</div>
          {messages.map(m => (
            <div key={m.id} className={`cb-vmsg ${m.status === 'unread' ? 'unread' : ''}`}>
              <div className="cb-vmsg-top">
                <span className="cb-vmsg-who">{m.name || 'Visitor'}{m.contact ? ` · ${m.contact}` : ''}</span>
                <span className="cb-vmsg-date">{fmtDateTime(m.created_at, { dateOnly: true })}</span>
              </div>
              <div className="cb-vmsg-body">{m.message}</div>
              {m.status === 'unread' && <button className="cb-mark" onClick={() => markRead(m)}>Mark read</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KnowledgePage({ vendorId, onBack }) {
  const dialog = useDialog();
  const [k, setK] = useState(null);
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [vendorId]);
  function load() {
    api.chatbotKnowledge(vendorId).then(d => {
      setK(d.knowledge); setSub(d.subscriber); setCode(d.subscriber?.access_code || '');
    }).catch(() => {});
  }
  async function save() {
    try { await api.chatbotSaveKnowledge(vendorId, k); setEditing(false); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1800); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function saveCode() {
    try {
      const d = await api.chatbotSetCode(vendorId, code);
      setSub(s => ({ ...s, access_code: d.access_code }));
      setMsg('✅ Access code saved'); setTimeout(() => setMsg(''), 1800);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function copyLink() {
    const url = `${window.location.origin}/knowledge/${sub.share_token}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => dialog.prompt('Select and copy this link:', url, { title: 'Copy link', readOnly: true, okLabel: 'Done' }));
  }

  if (!k || !sub) return <div className="sa-loading">Loading…</div>;
  const shareUrl = `${window.location.origin}/knowledge/${sub.share_token}`;

  return (
    <>
      <div className="cb-head">
        <div>
          <button className="cb-back" onClick={onBack}>← Subscribers</button>
          <div className="sa-section-title">📚 {sub.business_name} — Knowledge</div>
          <div className="cb-sub">This is what the chatbot knows about them.</div>
        </div>
        <div className="cb-actions">
          <button className="sa-btn-teal" onClick={() => setShowShare(v => !v)}>🔗 Share with vendor</button>
          {!editing
            ? <button className="sa-btn-teal" onClick={() => setEditing(true)}>✏️ Edit</button>
            : <button className="sa-btn-teal" onClick={save}>💾 Save</button>}
        </div>
      </div>

      {showShare && (
        <div className="sa-box cb-share">
          <div className="cb-share-title">🔗 Shareable fill-in link</div>
          <div className="cb-share-hint">Send this to the vendor. They enter the access code, fill it in, and it's ready for the chatbot.</div>
          <div className="cb-share-row">
            <input className="cb-input" readOnly value={shareUrl} onFocus={e => e.target.select()} />
            <button className="sa-btn-teal" onClick={copyLink}>{copied ? '✅' : '🔗 Copy'}</button>
          </div>
          <div className="cb-share-row">
            <input className="cb-input" placeholder="Set an access code (e.g. studio2026)" value={code} onChange={e => setCode(e.target.value)} />
            <button className="sa-btn-teal" onClick={saveCode}>🔑 Save code</button>
          </div>
          {!sub.access_code && <div className="cb-warn">⚠️ No access code set — anyone with the link can edit. Set one above.</div>}
        </div>
      )}

      {msg && <div className="cb-msg">{msg}</div>}

      <ChatbotInbox vendorId={vendorId} />

      <div className="sa-box cb-knowledge">
        {KFIELDS.map(f => (
          <div key={f.k} className="cb-field">
            <label className="lbl">{f.label}</label>
            {f.type === 'input'
              ? <input className="cb-input" readOnly={!editing} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />
              : <textarea className="cb-input cb-area" readOnly={!editing} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />}
          </div>
        ))}
      </div>
    </>
  );
}
