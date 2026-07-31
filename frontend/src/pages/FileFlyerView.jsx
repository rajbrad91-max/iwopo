import { useState, useEffect, useRef } from 'react';
import { api, fmtDateTime } from '../lib/api';
import './fileflyer.css';
import ShareDrive from './ShareDrive.jsx';
import { useDialog } from '../lib/dialog.jsx';

/** Bytes as something a person reads, not a number to decode. */
export function fmtBytes(n) {
  const b = Number(n || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 📤 File Flyer — links a vendor hands to a client to pass files either way.
 *
 * Standalone by design: a share is not tied to a lead, so it works for anyone
 * the vendor deals with — a client, a second shooter, a venue — not only
 * someone who has already booked.
 */
export default function FileFlyerView() {
  const dialog = useDialog();
  const [shares, setShares] = useState([]);
  const [storage, setStorage] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [emailFor, setEmailFor] = useState(null);   // which share the send dialog is for       // the share being looked at
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', note: '', password: '', allow_upload: true, expires_at: '' });

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const d = await api.fileShares();
      setShares(d.shares || []);
      setStorage(d.storage || null);
    } catch (e) { flash('⚠️ ' + e.message); }
  }
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2200); }

  async function create() {
    if (!form.title.trim()) return flash('⚠️ Give it a title');
    setBusy(true);
    try {
      await api.createFileShare({
        title: form.title, note: form.note || null,
        password: form.password || null, allow_upload: form.allow_upload,
        expires_at: form.expires_at || null,
      });
      setForm({ title: '', note: '', password: '', allow_upload: true, expires_at: '' });
      setShowNew(false);
      await load(); flash('✅ Link created');
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function remove(id, title) {
    if (!await dialog.confirm(`"${title}" and every file in it will be deleted. This cannot be undone.`, { title: 'Delete this link?', okLabel: 'Delete' })) return;
    setBusy(true);
    try { await api.deleteFileShare(id); await load(); flash('🗑️ Deleted'); }
    catch (e) { flash('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  function copyLink(token) {
    // current origin, so a link copied on staging doesn't point at the live site
    navigator.clipboard?.writeText(`${window.location.origin}/f/${token}`);
    flash('🔗 Link copied');
  }

  if (open) return (
    <ShareDrive share={open}
      onBack={() => { setOpen(null); load(); }}
      onStorage={setStorage} />
  );

  const pct = storage ? Math.min(100, Math.round(storage.used_bytes / storage.limit_bytes * 100)) : 0;

  return (
    <div>
      <div className="ff-head">
        <div>
          <h2 className="ff-h2">📤 File Flyer</h2>
          <p className="ff-sub">Send files to a client, or let them send files back — one link, either direction.</p>
        </div>
        <button className="refresh ff-new" onClick={() => setShowNew(v => !v)}>
          {showNew ? '✕ Cancel' : '➕ New link'}
        </button>
      </div>

      {storage && (
        <div className="ff-storage">
          <div className="ff-storage-row">
            <span>💾 <b>{fmtBytes(storage.used_bytes)}</b> of {storage.limit_mb} MB used</span>
            <span className="ff-storage-left">{fmtBytes(storage.remaining_bytes)} free</span>
          </div>
          <div className="ff-bar"><div className={`ff-bar-fill ${pct > 90 ? 'is-full' : ''}`} style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {msg && <div className={`ff-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

      {showNew && (
        <div className="ff-form">
          <label className="ff-label">Title</label>
          <input className="ff-input" placeholder="e.g. Wedding final files"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />

          <label className="ff-label">A note for them (optional)</label>
          <textarea className="ff-input ff-ta" rows={2} placeholder="Anything they should know"
            value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />

          <div className="ff-form-row">
            <div>
              <label className="ff-label">Password (optional)</label>
              <input className="ff-input" placeholder="Leave blank for no password"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="ff-label">Expires (optional)</label>
              <input className="ff-input" type="date"
                value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
            </div>
          </div>

          <label className="ff-check">
            <input type="checkbox" checked={form.allow_upload}
              onChange={e => setForm({ ...form, allow_upload: e.target.checked })} />
            Let them upload files back to me
          </label>

          <button className="refresh ff-create" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : '📤 Create link'}
          </button>
        </div>
      )}

      {shares.length === 0 ? (
        <p className="ff-empty">No links yet. Create one to send files to a client.</p>
      ) : (
        <div className="ff-list">
          {shares.map(s => (
            <div key={s.id} className="ff-card">
              <div className="ff-card-main" onClick={() => setOpen(s)}>
                <h3 className="ff-card-t">{s.title}</h3>
                <p className="ff-card-meta">
                  {s.file_count} file{s.file_count === 1 ? '' : 's'} · {fmtBytes(s.size_bytes)}
                  {s.has_password && ' · 🔒 password'}
                  {!s.allow_upload && ' · download only'}
                  {s.expires_at && ` · expires ${String(s.expires_at).slice(0, 10)}`}
                </p>
              </div>
              <div className="ff-card-actions">
                <button className="ff-mini" onClick={() => copyLink(s.token)}>🔗 Copy link</button>
                <button className="ff-mini" onClick={() => setEmailFor(s)}>✉️ Send by email</button>
                <button className="ff-mini" onClick={() => setOpen(s)}>📂 Open</button>
                <button className="ff-mini is-del" onClick={() => remove(s.id, s.title)} disabled={busy}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {emailFor && (
        <EmailShareModal share={emailFor} onClose={() => setEmailFor(null)} />
      )}
    </div>
  );
}

/**
 * ✉️ Send a share link to a client.
 *
 * Addresses are validated on the server too — this only catches the obvious
 * cases early so a typo does not cost a round trip.
 */
function EmailShareModal({ share, onClose }) {
  const dialog = useDialog();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const list = to.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!list.length) { dialog.alert('Add at least one email address.', { error: true }); return; }
    setSending(true);
    try {
      const d = await api.emailShare(share.id, { to: list, message: message.trim() || undefined });
      onClose();
      dialog.alert(
        `Sent to ${d.sent_to} ${d.sent_to === 1 ? 'person' : 'people'}` +
        (d.via === 'platform' ? ', using iwopo\u2019s mail server.' : ', from your own email.'),
        { title: 'On its way' });
    } catch (e) {
      // the server explains WHY when there is no mail server configured — pass
      // that through rather than a generic failure the vendor cannot act on
      dialog.alert(e.message, { title: 'Could not send', error: true });
    } finally { setSending(false); }
  }

  return (
    <div className="ff-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ff-modal">
        <h3 className="ff-modal-t">✉️ Send &ldquo;{share.title}&rdquo;</h3>
        <p className="ff-modal-sub">
          They&rsquo;ll get a link to open and download everything in this folder.
        </p>

        <label className="ff-label">Send to</label>
        <input className="ff-input" autoFocus placeholder="client@example.com, someone@else.com"
          value={to} onChange={e => setTo(e.target.value)} />
        <p className="ff-hint">Separate several addresses with a comma.</p>

        <label className="ff-label">Add a message (optional)</label>
        <textarea className="ff-input ff-ta" rows={3}
          placeholder="Here are the photos from Saturday!"
          value={message} onChange={e => setMessage(e.target.value)} />

        {share.password && (
          <p className="ff-hint">
            🔒 This link asks for a password. The email says so, but it will not
            include the password — send that separately.
          </p>
        )}

        <div className="ff-modal-acts">
          <button className="ff-btn" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="ff-btn is-primary" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send link'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 📂 One share, opened — its files, and the way to add more.
 *
 * Files the CLIENT sent are marked as theirs. That distinction is the whole
 * point of a two-way link: a vendor opening this needs to see at a glance
 * what arrived versus what they sent, without reading timestamps.
 */
function ShareDetail({ share, onBack }) {
  const dialog = useDialog();
  const [items, setItems] = useState([]);
  const [storage, setStorage] = useState(null);
  const [info, setInfo] = useState(share);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { load(); }, [share.id]);
  async function load() {
    try {
      const d = await api.fileShareItems(share.id);
      setItems(d.items || []);
      setStorage(d.storage || null);
      if (d.share) setInfo(s => ({ ...s, ...d.share }));
    } catch (e) { flash('⚠️ ' + e.message); }
  }
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2500); }

  async function onPick(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    try {
      const d = await api.uploadShareFiles(share.id, files);
      setStorage(d.storage || storage);
      await load();
      flash(`✅ ${files.length} file${files.length === 1 ? '' : 's'} added`);
    } catch (err) {
      // the server says exactly why when it's a space problem — pass that on
      // rather than replacing it with something vaguer
      flash('⚠️ ' + err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeItem(id, name) {
    if (!await dialog.confirm(`"${name}" will be deleted from this link.`, { title: 'Remove file?', okLabel: 'Remove' })) return;
    setBusy(true);
    try { const d = await api.deleteShareItem(id); setStorage(d.storage || storage); await load(); flash('🗑️ Removed'); }
    catch (e) { flash('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  function copyLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/f/${info.token}`);
    flash('🔗 Link copied');
  }

  return (
    <div>
      <div className="ff-detail-top">
        <button className="refresh" onClick={onBack}>← Back to File Flyer</button>
        <button className="refresh" onClick={copyLink}>🔗 Copy link</button>
      </div>

      <h2 className="ff-h2">{info.title}</h2>
      {info.note && <p className="ff-sub">{info.note}</p>}
      <p className="ff-card-meta">
        {info.has_password && '🔒 password protected · '}
        {info.allow_upload ? 'they can upload back' : 'download only'}
        {info.expires_at && ` · expires ${String(info.expires_at).slice(0, 10)}`}
      </p>

      {storage && (
        <p className="ff-card-meta">💾 {fmtBytes(storage.used_bytes)} of {storage.limit_mb} MB used · {fmtBytes(storage.remaining_bytes)} free</p>
      )}

      {msg && <div className={`ff-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

      <div className="ff-upload">
        <input ref={fileRef} type="file" multiple onChange={onPick} disabled={busy} id="ff-file-input" hidden />
        <label htmlFor="ff-file-input" className={`ff-upload-btn ${busy ? 'is-busy' : ''}`}>
          {busy ? 'Uploading…' : '📎 Add files'}
        </label>
      </div>

      {items.length === 0 ? (
        <p className="ff-empty">Nothing here yet.</p>
      ) : (
        <div className="ff-items">
          {items.map(i => (
            <div key={i.id} className={`ff-item ${i.uploaded_by === 'client' ? 'is-client' : ''}`}>
              <div className="ff-item-main">
                <span className="ff-item-name">{i.filename}</span>
                <span className="ff-item-meta">
                  {fmtBytes(i.size_bytes)} · {fmtDateTime(i.created_at, { dateOnly: true })}
                  {i.uploaded_by === 'client' && ` · 📥 from ${i.uploader_name || 'them'}`}
                </span>
              </div>
              <div className="ff-item-actions">
                <a className="ff-mini" href={`/api/files/item/${i.id}/download`}>⬇️</a>
                <button className="ff-mini is-del" onClick={() => removeItem(i.id, i.filename)} disabled={busy}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
