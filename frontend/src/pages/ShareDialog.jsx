import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';

/**
 * 🔗 Share a folder — ONE place for the link, who it goes to, and its settings.
 *
 * Nothing becomes public until "Create link" is pressed (Muse review 2026-10-20: one click on the old ↗
 * badge made a folder public straight away). Access is honest: whoever holds the link can open it, so
 * "specific people" means sending them the link here — iwopo does not pretend to gate it per person.
 *
 * Once the link exists (Raj, 2026-11-20): the people come first — the vendor's Contacts as a list to tick,
 * any other address typed underneath, a confirm before anything is emailed — then who it already went to.
 * The link's settings sit folded below, saved only when they were changed.
 */
/* The end date is a day on the VENDOR's calendar: shown as their local day, saved as the last second of it */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (v) => (v ? ymd(new Date(v)) : '');
const todayLocal = () => ymd(new Date());
const shortDay = (v) => (v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const typedEmails = (s) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
const EMAIL_OK = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** The link's settings: upload back, password, end date. */
function LinkSettings({ share, upload, setUpload, password, setPassword, dropPassword, setDropPassword, expires, setExpires }) {
  return (
    <>
      <label className="ff-check">
        <input type="checkbox" checked={upload} onChange={e => setUpload(e.target.checked)} />
        <span>They can also <b>upload files back</b> to you</span>
      </label>

      <label className="ff-share-label" htmlFor="ff-pw">Password (optional)</label>
      <input id="ff-pw" className="dlg-input" type="text" autoComplete="off" disabled={dropPassword}
        placeholder={share?.has_password ? 'A password is set: type a new one to change it' : 'No password'}
        value={password} onChange={e => setPassword(e.target.value)} />
      {share?.has_password && (
        <label className="ff-check">
          <input type="checkbox" checked={dropPassword} onChange={e => setDropPassword(e.target.checked)} />
          <span>Remove the password</span>
        </label>
      )}

      <label className="ff-share-label" htmlFor="ff-exp">Link stops working after (optional)</label>
      <input id="ff-exp" className="dlg-input ff-date" type="date" min={todayLocal()} value={expires} onChange={e => setExpires(e.target.value)} />
    </>
  );
}

export default function ShareDialog({ folder, share: initial, onClose, onChanged }) {
  const dialog = useDialog();
  const [share, setShare] = useState(initial || null);
  const [upload, setUpload] = useState(!!initial?.allow_upload);
  const [expires, setExpires] = useState(dayOf(initial?.expires_at));
  const [password, setPassword] = useState('');
  const [dropPassword, setDropPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [people, setPeople] = useState([]);       // who it already went to
  const [contacts, setContacts] = useState(null);  // null while loading
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState([]);        // contact ids ticked
  const [others, setOthers] = useState('');        // addresses not in Contacts
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const link = share ? `${location.origin}/f/${share.token}` : '';
  const flash = (t) => { setNote(t); setTimeout(() => setNote(''), 2400); };
  const loadPeople = (id) => api.shareRecipients(id).then(d => setPeople(d.recipients || [])).catch(() => {});

  useEffect(() => { api.contacts().then(d => setContacts(d.contacts || [])).catch(() => setContacts([])); }, []);
  useEffect(() => { if (share?.id) loadPeople(share.id); }, [share?.id]);

  // the settings changed since they were last saved — only then is there anything to save
  const dirty = !!share && (upload !== !!share.allow_upload || expires !== dayOf(share.expires_at) || !!password.trim() || dropPassword);

  /** What the settings say, in the shape the server takes. Password only when typed or removed. */
  function settings() {
    const body = { allow_upload: upload, expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null };
    if (dropPassword) body.password = '';
    else if (password.trim()) body.password = password.trim();
    return body;
  }

  async function save(first) {
    setBusy(true);
    try {
      const d = await api.shareFolder(folder.id, settings());
      setShare(d.share); setPassword(''); setDropPassword(false);
      if (first) { await navigator.clipboard?.writeText(`${location.origin}/f/${d.share.token}`).catch(() => {}); flash('Link created and copied'); }
      else flash('Settings saved');
      onChanged?.();
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); flash('Link copied'); }
    catch { flash('Select the link and copy it'); }
  }

  async function stop() {
    if (!await dialog.confirm(`The link for "${folder.name}" stops working for everyone. The folder and its files stay.`,
      { title: 'Stop sharing?', okLabel: 'Stop sharing', danger: true })) return;
    setBusy(true);
    try { await api.unshareFolder(folder.id); onChanged?.(); onClose(); }
    catch (e) { dialog.alert(e.message, { error: true }); setBusy(false); }
  }

  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const extra = typedEmails(others);
  const bad = extra.filter(e => !EMAIL_OK(e));
  const chosen = (contacts || []).filter(c => picked.includes(c.id));
  const count = chosen.length + extra.length;
  const needle = find.trim().toLowerCase();
  const shown = (contacts || []).filter(c => !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle));

  /** ✉️ Nothing is emailed without a yes (Raj, 2026-11-17 — the same pop-up as everywhere else a client is written to). */
  async function send() {
    if (!count) { dialog.alert('Tick someone from your contacts, or type an email address.', { error: true }); return; }
    if (bad.length) { dialog.alert(`${bad.join(', ')} ${bad.length === 1 ? 'is not an email address' : 'are not email addresses'}.`, { error: true }); return; }
    const names = [...chosen.map(c => c.name), ...extra];
    if (!await dialog.confirm(`The link to "${folder.name}" will be emailed to ${names.join(', ')}.`,
      { title: `Email ${count === 1 ? 'this person' : `${count} people`}?`, okLabel: 'Send', danger: false })) return;
    setSending(true);
    try {
      const d = await api.emailShare(share.id, { contact_ids: picked, to: extra, message: message.trim() || undefined });
      setPicked([]); setOthers(''); setMessage('');
      flash(`Sent to ${d.sent_to} ${d.sent_to === 1 ? 'person' : 'people'}`);
      if (d.failed?.length) dialog.alert(`It could not be sent to ${d.failed.join(', ')}. Check the address and try again.`, { title: 'Not everyone got it', error: true });
      loadPeople(share.id);
    } catch (e) { dialog.alert(e.message, { title: 'Could not send', error: true }); }
    finally { setSending(false); }
  }

  const settingProps = { share, upload, setUpload, password, setPassword, dropPassword, setDropPassword, expires, setExpires };

  return (
    <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg-panel ff-share" role="dialog" aria-label={`Share ${folder.name}`}>
        <h3 className="dlg-title">Share &ldquo;{folder.name}&rdquo;</h3>

        {!share ? (
          <>
            <p className="dlg-msg">Nothing is shared yet. Choose the settings, then create the link — anyone who has it can open the folder.</p>
            <div className="ff-section"><LinkSettings {...settingProps} /></div>
            {note && <p className="ff-note">{note}</p>}
            <div className="dlg-actions">
              <button type="button" className="dlg-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="dlg-btn" onClick={() => save(true)} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
            </div>
          </>
        ) : (
          <>
            <span className="ff-status">Shared · anyone with the link can open it</span>
            <div className="ff-link-row">
              <code className="ff-link-text" aria-label="Share link">{link}</code>
              <button type="button" className="dlg-btn" onClick={copy}>Copy link</button>
            </div>

            {/* 📇 who it goes to — Contacts first, ticked with a tap */}
            <div className="ff-section">
              <p className="ff-share-label">Send it to</p>
              {contacts === null ? <p className="ff-share-hint">Loading your contacts…</p>
                : contacts.length === 0 ? <p className="ff-share-hint">No contacts yet — add the people you send files to under File Flyer → Contacts, or type an address below.</p>
                  : (
                    <>
                      {contacts.length > 6 && (
                        <input className="dlg-input" type="search" placeholder="Find a contact" aria-label="Find a contact"
                          value={find} onChange={e => setFind(e.target.value)} />
                      )}
                      <ul className="ff-pick" aria-label="Your contacts">
                        {shown.map(c => (
                          <li key={c.id}>
                            <label className={`ff-pick-row${picked.includes(c.id) ? ' is-on' : ''}`}>
                              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                              <span className="ff-pick-who">
                                <span className="ff-pick-name">{c.name}{c.note && <span className="ff-pick-note">{c.note}</span>}</span>
                                <span className="ff-pick-mail">{c.email}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                        {!shown.length && <li className="ff-share-hint">Nobody matches &ldquo;{find.trim()}&rdquo;.</li>}
                      </ul>
                    </>
                  )}
              <label className="ff-share-label" htmlFor="ff-others">Someone else (optional)</label>
              <input id="ff-others" className="dlg-input" type="text" inputMode="email" placeholder="name@example.com, another@example.com"
                value={others} onChange={e => setOthers(e.target.value)} />
              <textarea className="dlg-input" rows={2} placeholder="Add a message (optional)" aria-label="Message"
                value={message} onChange={e => setMessage(e.target.value)} />
              {share.has_password && <p className="ff-share-hint">The email says a password is needed but does not include it — send that separately.</p>}
              <button type="button" className="dlg-btn ff-send" onClick={send} disabled={sending}>
                {sending ? 'Sending…' : count ? `Send link to ${count === 1 ? chosen[0]?.name || extra[0] : `${count} people`}` : 'Send link'}
              </button>

              {people.length > 0 && (
                <>
                  <p className="ff-share-label">Already sent to</p>
                  <ul className="ff-people">
                    {people.map(p => (
                      <li key={p.id} className="ff-person">
                        <span className="ff-person-n">{p.name || p.email}<span className="ff-pick-mail">{p.name ? p.email : ''}</span></span>
                        <span className="ff-person-s">{p.sent_at ? `Sent ${shortDay(p.sent_at)}` : 'Not sent yet'}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* ⚙️ the link's settings, out of the way until wanted */}
            <details className="ff-section ff-settings" open={dirty || undefined}>
              <summary className="ff-share-label">Link settings</summary>
              <LinkSettings {...settingProps} />
              {dirty && <button type="button" className="dlg-btn ff-send" onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
            </details>

            {note && <p className="ff-note">{note}</p>}
            <div className="dlg-actions">
              <button type="button" className="dlg-btn is-danger" onClick={stop} disabled={busy}>Stop sharing</button>
              <span className="ff-spacer" />
              <button type="button" className="dlg-btn" onClick={onClose} disabled={busy}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
