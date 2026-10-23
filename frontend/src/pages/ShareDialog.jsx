import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';

/**
 * 🔗 Share a folder — ONE place for the link, its settings and sending it.
 *
 * Nothing becomes public until "Create link" is pressed (Muse review 2026-10-20: one click on the old ↗
 * badge made a folder public straight away). Access is honest: whoever holds the link can open it, so
 * "specific people" means sending them the link here — iwopo does not pretend to gate it per person.
 */
const dayOf = (v) => (v ? String(v).slice(0, 10) : '');
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function ShareDialog({ folder, share: initial, onClose, onChanged }) {
  const dialog = useDialog();
  const [share, setShare] = useState(initial || null);
  const [upload, setUpload] = useState(!!initial?.allow_upload);
  const [expires, setExpires] = useState(dayOf(initial?.expires_at));
  const [password, setPassword] = useState('');
  const [dropPassword, setDropPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [people, setPeople] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const link = share ? `${location.origin}/f/${share.token}` : '';
  const flash = (t) => { setNote(t); setTimeout(() => setNote(''), 2200); };

  useEffect(() => { api.contacts().then(d => setContacts((d.contacts || []).filter(c => c.email))).catch(() => {}); }, []);
  useEffect(() => {
    if (!share?.id) return;
    api.shareRecipients(share.id).then(d => setPeople(d.recipients || [])).catch(() => {});
  }, [share?.id]);

  /** What the settings say, in the shape the server takes. Password only when typed or removed. */
  function settings() {
    const body = { allow_upload: upload, expires_at: expires ? `${expires}T23:59:59` : null };
    if (dropPassword) body.password = '';
    else if (password.trim()) body.password = password.trim();
    return body;
  }

  async function save(first) {
    setBusy(true);
    try {
      const d = await api.shareFolder(folder.id, settings());
      setShare(d.share); setPassword(''); setDropPassword(false);
      if (first) { await navigator.clipboard?.writeText(`${location.origin}/f/${d.share.token}`).catch(() => {}); flash('✅ Link created and copied'); }
      else flash('✅ Saved');
      onChanged?.();
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); flash('🔗 Copied'); }
    catch { flash('Select the link and copy it'); }
  }

  async function stop() {
    if (!await dialog.confirm(`The link for "${folder.name}" stops working for everyone. The folder and its files stay.`,
      { title: 'Stop sharing?', okLabel: 'Stop sharing', danger: true })) return;
    setBusy(true);
    try { await api.unshareFolder(folder.id); onChanged?.(); onClose(); }
    catch (e) { dialog.alert(e.message, { error: true }); setBusy(false); }
  }

  async function send() {
    const list = to.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!list.length) { dialog.alert('Add at least one email address.', { error: true }); return; }
    setSending(true);
    try {
      const d = await api.emailShare(share.id, { to: list, message: message.trim() || undefined });
      setTo(''); setMessage('');
      flash(`✉️ Sent to ${d.sent_to} ${d.sent_to === 1 ? 'person' : 'people'}`);
      api.shareRecipients(share.id).then(r => setPeople(r.recipients || [])).catch(() => {});
    } catch (e) { dialog.alert(e.message, { title: 'Could not send', error: true }); }
    finally { setSending(false); }
  }

  return (
    <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg-panel ff-share" role="dialog" aria-label={`Share ${folder.name}`}>
        <h3 className="dlg-title">Share &ldquo;{folder.name}&rdquo;</h3>
        <p className="dlg-msg">
          {share
            ? <span className="ff-status is-on">Shared · anyone with the link</span>
            : 'Nothing is shared yet. Choose the settings, then create the link.'}
        </p>

        {share && (
          <div className="ff-link-row">
            <code className="ff-link-text" aria-label="Share link">{link}</code>
            <button type="button" className="dlg-btn is-primary" onClick={copy}>Copy link</button>
          </div>
        )}

        <div className="ff-section">
          <label className="ff-share-label">Who can open it</label>
          <p className="ff-share-hint">Anyone you give the link to. To share with specific people, send it to them below.</p>

          <label className="ff-check">
            <input type="checkbox" checked={upload} onChange={e => setUpload(e.target.checked)} />
            <span>They can also <b>upload files back</b> to you</span>
          </label>

          <label className="ff-share-label">Password (optional)</label>
          <input className="dlg-input" type="text" autoComplete="off" disabled={dropPassword}
            placeholder={share?.has_password ? 'A password is set: type a new one to change it' : 'No password'}
            value={password} onChange={e => setPassword(e.target.value)} />
          {share?.has_password && (
            <label className="ff-check">
              <input type="checkbox" checked={dropPassword} onChange={e => setDropPassword(e.target.checked)} />
              <span>Remove the password</span>
            </label>
          )}

          <label className="ff-share-label">Link stops working after (optional)</label>
          <input className="dlg-input ff-date" type="date" min={todayLocal()} value={expires} onChange={e => setExpires(e.target.value)} />
        </div>

        {share && (
          <div className="ff-section">
            <label className="ff-share-label">Send it by email</label>
            <input className="dlg-input" list="ff-contacts" placeholder="client@example.com, someone@else.com"
              value={to} onChange={e => setTo(e.target.value)} />
            <datalist id="ff-contacts">
              {contacts.map(c => <option key={c.id} value={c.email}>{c.name}</option>)}
            </datalist>
            <textarea className="dlg-input" rows={2} placeholder="Add a message (optional)"
              value={message} onChange={e => setMessage(e.target.value)} />
            {share.has_password && <p className="ff-share-hint">🔒 The email says a password is needed but does not include it: send that separately.</p>}
            <button type="button" className="dlg-btn ff-send" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send link'}</button>

            {people.length > 0 && (
              <ul className="ff-people">
                {people.map(p => (
                  <li key={p.id} className="ff-person">
                    <span className="ff-person-n">{p.name || p.email}</span>
                    <span className="ff-person-s">{p.opened_at ? 'opened' : p.sent_at ? 'sent' : 'added'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {note && <p className="ff-note">{note}</p>}

        <div className="dlg-actions">
          {share && <button type="button" className="dlg-btn ff-stop" onClick={stop} disabled={busy}>Stop sharing</button>}
          <span className="ff-spacer" />
          <button type="button" className="dlg-btn" onClick={onClose} disabled={busy}>{share ? 'Done' : 'Cancel'}</button>
          {share
            ? <button type="button" className="dlg-btn is-primary" onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
            : <button type="button" className="dlg-btn is-primary" onClick={() => save(true)} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>}
        </div>
      </div>
    </div>
  );
}
