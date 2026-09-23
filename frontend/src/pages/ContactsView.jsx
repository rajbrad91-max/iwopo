import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import './contacts.css';

/**
 * 📇 The address book — people a vendor sends files to.
 *
 * Deliberately not the Leads list. A lead is somebody who might book; a contact
 * is simply somebody you send things to, and is often neither — the editor, the
 * second shooter, the venue coordinator. The two do overlap, which is why the
 * couple already in Leads can be pulled across rather than typed again.
 */
export default function ContactsView() {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);           // the contact being added or changed
  const [msg, setMsg] = useState('');

  const load = useCallback(async (query) => {
    try { setRows((await api.contacts(query)).contacts || []); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }, [dialog]);

  useEffect(() => { load(''); }, [load]);

  /* Searching on every keystroke would be a request per letter, so it waits for
     a pause. 250ms is short enough to feel immediate. */
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  function flash(t) { setMsg(t); setTimeout(() => setMsg(''), 2500); }

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await api.updateContact(edit.id, edit);
      else await api.addContact(edit);
      setEdit(null); load(q.trim()); flash('✅ Saved');
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  async function remove(c) {
    if (!await dialog.confirm(`Remove ${c.name} from your contacts?`,
      { title: 'Remove contact?', okLabel: 'Remove' })) return;
    try { await api.deleteContact(c.id); load(q.trim()); flash('🗑️ Removed'); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  async function fromLeads() {
    setBusy(true);
    try {
      const r = await api.contactsFromLeads();
      load(q.trim());
      flash(r.added ? `✅ Added ${r.added}` : 'Everyone is already here');
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  return (
    <div className="cts">
      <p className="cts-intro">
        People you send files to. Pick them when you share a folder instead of
        typing an address each time.
      </p>

      <div className="cts-bar">
        <input className="cts-search" placeholder="Search name or email"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className="cts-b is-primary" onClick={() => setEdit({ name: '', email: '' })}>
          Add contact
        </button>
        <button className="cts-b" disabled={busy} onClick={fromLeads}>
          Add from Leads
        </button>
      </div>

      {msg && <div className="cts-flash">{msg}</div>}

      {rows.length === 0 ? (
        <p className="cts-quiet">
          {q ? 'Nobody matches that.' : 'No contacts yet. Add one, or pull them across from Leads.'}
        </p>
      ) : (
        <div className="cts-list">
          {rows.map(c => (
            <div key={c.id} className="cts-row">
              <div className="cts-who">
                <span className="cts-name">{c.name}</span>
                <span className="cts-email">{c.email}</span>
              </div>
              {c.phone && <span className="cts-phone">{c.phone}</span>}
              {c.note && <span className="cts-note">{c.note}</span>}
              <button className="cts-x" onClick={() => setEdit(c)} aria-label="Edit">✎</button>
              <button className="cts-x" onClick={() => remove(c)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div className="cts-modal" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="cts-card">
            <h3>{edit.id ? 'Edit contact' : 'Add contact'}</h3>
            <label>Name
              <input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label>Email
              <input type="email" value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} />
            </label>
            <label>Phone <span className="cts-opt">optional</span>
              <input value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <label>Note <span className="cts-opt">optional</span>
              <input value={edit.note || ''} onChange={e => setEdit({ ...edit, note: e.target.value })}
                placeholder="editor, second shooter, bride's mother…" />
            </label>
            <div className="cts-acts">
              <button className="cts-b" onClick={() => setEdit(null)}>Cancel</button>
              <button className="cts-b is-primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
