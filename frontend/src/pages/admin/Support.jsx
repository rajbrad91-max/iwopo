/**
 * 🛟 Support: help requests and the help videos.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, Fragment } from 'react';
import { api } from '../../lib/api';

export function SupportView() {
  /* 🎧 Messages vendors send from Help & Support, with their screenshot if they added one; and the video guides shown
     on that page (Raj, 2026-11-07) */
  const [messages, setMessages] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.adminMessages().then(d => setMessages(d.messages || [])).catch(() => setMessages([])); }, []);
  async function viewShot(id) {
    setErr('');
    try { window.open(URL.createObjectURL(await api.adminMessageAttachment(id)), '_blank', 'noopener'); }
    catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="sa-section-title">Support Messages</div>
      {err && <div className="sa-hint">⚠️ {err}</div>}
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>From</th><th>Subject</th><th>Received</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {messages === null ? <tr><td colSpan="5" className="sa-empty">Loading…</td></tr>
              : messages.length === 0 ? <tr><td colSpan="5" className="sa-empty">No support messages yet.</td></tr>
              : messages.map(m => (
                <Fragment key={m.id}>
                  <tr className="sa-msg-row" onClick={() => setOpen(open === m.id ? null : m.id)}>
                    <td className="biz">{m.from_email || '—'}</td>
                    <td>{m.subject || String(m.body || '').slice(0, 80) || '—'}{m.has_attachment && <span className="sa-msg-clip" title="Has a screenshot"> 📎</span>}</td>
                    <td>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                    <td><span className={`sa-badge ${m.status === 'open' ? 'trial' : 'active'}`}>{m.status || 'open'}</span></td>
                    <td className="sa-msg-toggle">{open === m.id ? '▲' : '▼'}</td>
                  </tr>
                  {open === m.id && (
                    <tr className="sa-msg-open"><td colSpan="5">
                      <p className="sa-msg-body">{m.body || '—'}</p>
                      {m.has_attachment && <button type="button" className="sa-view-btn" onClick={() => viewShot(m.id)}>📎 View screenshot</button>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
      <HelpVideosAdmin />
    </>
  );
}

/** 🎬 The video guides on the vendors' Help & Support page: paste a YouTube link and a title; remove any. */
function HelpVideosAdmin() {
  const [videos, setVideos] = useState(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.helpVideos().then(d => setVideos(d.videos || [])).catch(() => setVideos([])); }, []);
  async function add() {
    setBusy(true); setMsg('');
    try { setVideos((await api.adminAddHelpVideo(title, url)).videos); setTitle(''); setUrl(''); setMsg('✅ Added — vendors see it on Help & Support'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    try { setVideos((await api.adminRemoveHelpVideo(id)).videos); } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  return (
    <>
      <div className="sa-section-title sa-hv-title">🎬 Help videos</div>
      <div className="sa-hint">Shown on every vendor's Help &amp; Support page, in this order.</div>
      <div className="sa-hv-add">
        <input className="sa-hv-in" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title, e.g. Setting up your inquiry form" maxLength={140} />
        <input className="sa-hv-in" value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube link" />
        <button type="button" className="sa-view-btn" disabled={busy || !title.trim() || !url.trim()} onClick={add}>{busy ? 'Adding…' : '+ Add video'}</button>
      </div>
      {msg && <div className="sa-hint">{msg}</div>}
      <ul className="sa-hv-list">
        {videos === null ? <li>Loading…</li> : videos.length === 0 ? <li className="sa-hint">No videos yet — vendors see “coming soon”.</li>
          : videos.map(v => (
            <li key={v.id}>
              <span>{v.title} <a href={`https://youtu.be/${v.youtube_id}`} target="_blank" rel="noreferrer" className="sa-hv-link">youtu.be/{v.youtube_id}</a></span>
              <button type="button" className="sa-mem-now" onClick={() => remove(v.id)}>Remove</button>
            </li>
          ))}
      </ul>
    </>
  );
}
