/**
 * 🎞️ Raw Selector — the vendor's own screen (private feature 'rawsel').
 *
 * Who the editors are, and where every client stands: how many photos they
 * picked, how many of those have their RAW, and when the RAWs will go.
 * Loaded on demand — nobody without the feature ever downloads this file.
 */
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import './rawsel.css';

const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function RawSelectorView() {
  const dialog = useDialog();
  const [editors, setEditors] = useState(null);
  const [clients, setClients] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const portal = `${window.location.origin}/editor`;

  const load = () => {
    api.rawselEditors().then(d => setEditors(d.editors)).catch(() => setEditors([]));
    api.rawselOverview().then(d => setClients(d.clients)).catch(() => setClients([]));
  };
  useEffect(load, []);

  async function addEditor(e) {
    e.preventDefault();
    setMsg('');
    try { await api.rawselAddEditor(email, name); setEmail(''); setName(''); load(); }
    catch (err) { setMsg(err.message || 'Could not add the editor'); }
  }
  async function removeEditor(ed) {
    if (!await dialog.confirm(`${ed.email} will lose access straight away.`, { title: 'Remove this editor?', okLabel: 'Remove', danger: true })) return;
    await api.rawselRemoveEditor(ed.id).catch(() => {});
    load();
  }

  return (
    <div className="rs">
      <section className="rs-card">
        <h2 className="rs-h">👨‍💻 Editors</h2>
        <p className="rs-sub">
          Add your editor's email. They sign up at <a href={portal} target="_blank" rel="noreferrer">{portal}</a> with
          that email, and see only the RAW files of the photos each client picked — never your galleries or JPEGs.
        </p>
        <form className="rs-add" onSubmit={addEditor}>
          <input type="email" required placeholder="editor@email.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Editor email" />
          <input placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} aria-label="Editor name" />
          <button className="rs-btn" type="submit">Add editor</button>
        </form>
        {msg && <div className="rs-err">⚠️ {msg}</div>}
        {editors === null ? <div className="rs-muted">Loading…</div>
          : editors.length === 0 ? <div className="rs-muted">No editors yet.</div>
            : (
              <ul className="rs-list">
                {editors.map(ed => (
                  <li key={ed.id} className="rs-row">
                    <div>
                      <div className="rs-strong">{ed.name || ed.email}</div>
                      {ed.name && <div className="rs-muted">{ed.email}</div>}
                    </div>
                    <span className={`rs-pill ${ed.joined ? 'is-on' : ''}`}>{ed.joined ? `Joined${ed.lastLoginAt ? ` · last in ${day(ed.lastLoginAt)}` : ''}` : 'Invited — not signed up yet'}</span>
                    <button className="rs-x" type="button" onClick={() => removeEditor(ed)} aria-label={`Remove ${ed.email}`}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="rs-card">
        <h2 className="rs-h">📸 Clients</h2>
        <p className="rs-sub">Upload JPEG + RAW together into a client's album. When the client sends their selection, the editor sees it.</p>
        {clients === null ? <div className="rs-muted">Loading…</div>
          : clients.length === 0 ? <div className="rs-muted">No albums with RAW files or selections yet.</div>
            : (
              <div className="rs-table-wrap">
                <table className="rs-table">
                  <thead><tr><th>Client</th><th>Picked</th><th>RAWs for the editor</th><th>All RAWs</th><th>Selection sent</th><th>RAWs deleted on</th></tr></thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.id}>
                        <td className="rs-strong">{c.name}</td>
                        <td>{c.selected || '—'}</td>
                        <td>{c.selected ? <span className={c.selectedWithRaw < c.selected ? 'rs-warn' : ''}>{c.selectedWithRaw} / {c.selected}</span> : '—'}</td>
                        <td>{c.raws ? `${c.raws} · ${gb(c.bytes)}` : '—'}</td>
                        <td>{c.sentAt ? day(c.sentAt) : 'Not yet'}</td>
                        <td>{c.deleteAfter ? day(c.deleteAfter) : 'After delivery + 30 days'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </section>
    </div>
  );
}
