import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './projectstages.css';

/* 🧭 A booking's production stages — the same facts Gale and the PPM board read and write (iwopo is the
   single source of truth). Lives in the AI Agent feature: for a vendor without it the server answers 402
   and this card simply isn't there. Done steps green, not-yet orange, like the board. */
const STEPS = [
  ['💾 Data backed up', 'backed_up_at'],
  ['✂️ Sent to editor', 'sent_to_editor_at'],
  ['🖼️ Photos edited', 'editing_photos_done_at'],
  ['🎬 Videos edited', 'editing_videos_done_at'],
];
const CHANNELS = [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['phone', 'Phone call'], ['in_person', 'In person'], ['other', 'Other']];
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const when = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ProjectStages({ leadId }) {
  const [s, setS] = useState(null);
  const [off, setOff] = useState(false);
  const [msg, setMsg] = useState('');
  const [by, setBy] = useState('');
  const [text, setText] = useState('');
  const [ch, setCh] = useState('whatsapp');
  useEffect(() => { api.agentStages(leadId).then(d => { setS(d); setBy(d.backed_up_by || ''); }).catch(() => setOff(true)); }, [leadId]);
  if (off || !s) return null;

  async function save(body) {
    try { const d = await api.agentSetStages(leadId, body); setS(d); setMsg(''); } catch (e) { setMsg(`⚠️ ${e.message}`); }
  }
  async function addMessage() {
    if (!text.trim()) return;
    try { await api.agentAddOutsideMessage(leadId, { channel: ch, text }); setText(''); setS(await api.agentStages(leadId)); } catch (e) { setMsg(`⚠️ ${e.message}`); }
  }
  async function removeMessage(id) {
    try { await api.agentDeleteOutsideMessage(id); setS(await api.agentStages(leadId)); } catch (e) { setMsg(`⚠️ ${e.message}`); }
  }

  return (
    <div className="ld-card ps-card">
      <div className="ld-card-h">🧭 Production</div>
      <div className="ps-steps">
        {STEPS.map(([label, key]) => (
          <div key={key} className={`ps-step ${s[key] ? 'is-done' : 'is-todo'}`}>
            <span className="ps-step-l">{label}</span>
            <input className="ps-date" type="date" value={day(s[key])} onChange={e => save({ [key]: e.target.value || null })} aria-label={label} />
          </div>
        ))}
        <div className="ps-step ps-by">
          <span className="ps-step-l">👤 Backed up by</span>
          <input className="ps-text" value={by} onChange={e => setBy(e.target.value)} onBlur={() => by !== (s.backed_up_by || '') && save({ backed_up_by: by })} placeholder="who backed it up" />
        </div>
      </div>
      {msg && <div className="ld-msg is-err">{msg}</div>}

      <div className="ps-sub">💬 Messages sent outside iwopo</div>
      <div className="ps-add">
        <select className="ps-ch" value={ch} onChange={e => setCh(e.target.value)}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input className="ps-text" value={text} onChange={e => setText(e.target.value)} placeholder="What you sent" onKeyDown={e => e.key === 'Enter' && addMessage()} />
        <button type="button" className="refresh ps-btn" onClick={addMessage} disabled={!text.trim()}>Add</button>
      </div>
      {s.outside_messages.length === 0 ? <div className="ps-empty">None recorded yet.</div> : (
        <ul className="ps-list">
          {s.outside_messages.map(m => (
            <li key={m.id} className="ps-item">
              <span className="ps-tag">{(CHANNELS.find(c => c[0] === m.channel) || [m.channel, m.channel])[1]}</span>
              <span className="ps-item-t">{m.text}</span>
              <span className="ps-when">{when(m.sent_at)}</span>
              <button type="button" className="ps-x" onClick={() => removeMessage(m.id)} aria-label="Remove this message">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="ps-sub">📧 Emails iwopo sent</div>
      {s.emails.length === 0 ? <div className="ps-empty">None yet.</div> : (
        <ul className="ps-list">
          {s.emails.map(e => (
            <li key={e.id} className="ps-item">
              <span className={`ps-tag ${e.ok ? '' : 'is-bad'}`}>{e.ok ? 'sent' : 'failed'}</span>
              <span className="ps-item-t">{e.subject || '(no subject)'}</span>
              <span className="ps-when">{when(e.sent_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
