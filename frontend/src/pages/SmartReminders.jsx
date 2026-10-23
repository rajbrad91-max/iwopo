import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './smartreminders.css';

/**
 * ⏰ Smart reminders (Raj, 2026-10-23): people waiting more than a day for a reply — texts, missed calls, emails.
 * Replying clears one by itself; Done / Don't remind / Snooze clear it by hand. Tornado and Gale read the same list.
 */
const ICON = { text: '💬', call: '📞', email: '📧', instagram: '📸', whatsapp: '🟢' };
const waited = (d) => { const days = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 86400e3)); return `${days} day${days === 1 ? '' : 's'}`; };

export default function SmartReminders() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.agentFollowups().then(d => setRows(d.followups || [])).catch(e => { setRows([]); setErr(e.message); }); }, []);
  async function scan() {
    setBusy(true); setErr('');
    try { setRows((await api.agentFollowupsScan()).followups || []); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function act(r, action, hours) {
    setRows(list => list.filter(x => x.id !== r.id));
    try { await api.agentFollowupAct(r.id, action, hours); } catch (e) { setErr(e.message); setRows(list => [r, ...list]); }
  }
  if (rows === null) return <p className="sr-quiet">Loading…</p>;
  return (
    <div className="sr">
      <div className="sr-bar">
        <p className="sr-intro">People waiting <b>more than a day</b> for your reply. Replying clears them by themselves; Tornado and Gale remind you when you wake them.</p>
        <button type="button" className="sr-btn" disabled={busy} onClick={scan}>{busy ? 'Checking…' : '↻ Check now'}</button>
      </div>
      {err && <p className="sr-err" role="alert">⚠️ {err}</p>}
      {rows.length === 0 ? <p className="sr-quiet">🎉 Nobody is waiting on you.</p> : (
        <ul className="sr-list">
          {rows.map(r => (
            <li key={r.id} className="sr-row">
              <div className="sr-top">
                <span className="sr-who">{ICON[r.channel] || '•'} {r.who}</span>
                <span className="sr-when">waiting {waited(r.last_inbound_at)}</span>
              </div>
              {r.contact && r.contact !== r.who && <div className="sr-contact">{r.contact}</div>}
              {r.snippet && <div className="sr-snip">{r.snippet}</div>}
              <div className="sr-acts">
                <button type="button" className="sr-btn is-on" onClick={() => act(r, 'done')}>✅ Done</button>
                <button type="button" className="sr-btn" onClick={() => act(r, 'snooze', 24)}>💤 Tomorrow</button>
                <button type="button" className="sr-btn" onClick={() => act(r, 'mute')}>🔕 Don't remind</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
