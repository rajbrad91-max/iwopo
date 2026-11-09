import { useState } from 'react';
import { api, getAuthToken } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import { uploadShootFiles, uploadSummary, SHOOT_ACCEPT } from '../lib/shootUpload';

/**
 * 🛤️ The Raw Selector rail (Raj, 2026-11-09) — one row per client, like the PPM board: Uploaded → Told → Picked →
 * Delivered → RAWs removed, green when done and the next step in orange. Open a row for its Zips (the JPEGs, every
 * RAW, the RAWs of the client's picks, or both), a note for the editor, your own upload, and removing the RAWs — all
 * of them or only those the client did not pick — which the row then keeps as its record. A row stays until you
 * remove it. Data: GET /api/rawsel/overview (routes/rawsel.js).
 */
const STEPS = ['Uploaded', 'Told', 'Picked', 'Delivered', 'RAWs removed'];
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const day = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** which of the five steps a row has reached */
function stepsOf(c) {
  return [c.jpegs > 0, !!c.uploadedAt, !!c.sentAt, !!c.delivered, !!c.rawsRemoved];
}

export default function ShootRail({ clients, reload }) {
  const dialog = useDialog();
  const [open, setOpen] = useState(null);         // the row opened
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookings, setBookings] = useState(null);  // for "Upload a shoot"
  const [newLead, setNewLead] = useState('');

  function toggle(c) {
    setMsg('');
    if (open === c.id) { setOpen(null); return; }
    setOpen(c.id); setNote(c.note || '');
  }
  const zip = (c, what) => `/api/rawsel/albums/${c.id}/zip?what=${what}&token=${encodeURIComponent(getAuthToken() || '')}`;

  async function saveNote(c) {
    try { await api.rawselNote(c.id, note); setMsg('✅ Note saved for the editor'); reload(); }
    catch (e) { setMsg(`⚠️ ${e.message}`); }
  }
  async function removeRaws(c, scope) {
    const what = scope === 'all' ? `all ${c.raws} RAW files` : 'the RAW files the client did not pick';
    if (!await dialog.confirm(`Delete ${what} for ${c.name}? This cannot be undone.`, { title: 'Delete RAW files?', okLabel: 'Delete', danger: true })) return;
    try { const r = await api.rawselDeleteRaws(c.id, scope); setMsg(`🗑️ ${r.deleted} RAW file${r.deleted === 1 ? '' : 's'} deleted`); reload(); }
    catch (e) { setMsg(`⚠️ ${e.message}`); }
  }
  async function removeRow(c) {
    if (!await dialog.confirm(`Remove ${c.name} from the Raw Selector? Its photos and RAW files are deleted too.`, { title: 'Remove this client?', okLabel: 'Remove', danger: true })) return;
    try { await api.rawselDeleteAll(c.id); await api.deleteAlbum(c.id); setOpen(null); reload(); }
    catch (e) { setMsg(`⚠️ ${e.message}`); }
  }
  async function upload(leadId, e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const r = await uploadShootFiles(files, {
      begin: (list) => api.rawselShootBegin(leadId, list),
      complete: (items) => api.rawselShootComplete(leadId, items),
      onProgress: setMsg,
    });
    setBusy(false); setMsg(uploadSummary(r)); setNewLead(''); reload();
  }
  async function tellClient(c) {
    setBusy(true);
    try { const r = await api.rawselShootNotify(c.leadId, true); setMsg(r.clientEmailed ? '✅ The client has been emailed their link and passwords' : '⚠️ The booking has no client email'); reload(); }
    catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }
  function startNew() {
    setMsg('');
    if (bookings) { setBookings(null); return; }
    api.rawselBookings().then(d => setBookings(d.bookings)).catch(e => setMsg(`⚠️ ${e.message}`));
  }

  return (
    <div className="sr">
      <div className="sr-bar">
        <button className="rs-btn" type="button" onClick={startNew}>{bookings ? 'Close' : '➕ Upload a shoot'}</button>
        <span className="sr-legend"><i className="sr-key is-done" />Done <i className="sr-key is-next" />Next <i className="sr-key" />Not yet</span>
      </div>
      {bookings && (
        <div className="sr-new">
          <select className="sr-input" value={newLead} onChange={e => setNewLead(e.target.value)} aria-label="Booking">
            <option value="">Choose the booking…</option>
            {bookings.map(b => <option key={b.id} value={b.id}>{b.name}{b.event ? ` · ${b.event}` : ''}{b.date ? ` · ${day(b.date)}` : ''}{b.hasShoot ? ' (has photos)' : ''}</option>)}
          </select>
          <label className={`rs-btn rs-file ${!newLead || busy ? 'is-off' : ''}`}>Choose RAW + JPEG
            <input type="file" multiple hidden disabled={!newLead || busy} accept={SHOOT_ACCEPT} onChange={e => upload(Number(newLead), e)} />
          </label>
        </div>
      )}
      {msg && !open && <div className="ep-progress">{msg}</div>}
      {clients === null ? <div className="rs-muted">Loading…</div>
        : clients.length === 0 ? <div className="rs-muted">No shoots yet. Upload one, or assign a photographer to upload in Crew Management.</div>
          : clients.map(c => {
            const done = stepsOf(c);
            const next = done.indexOf(false);
            return (
              <div key={c.id} className={`sr-row${open === c.id ? ' is-open' : ''}`}>
                <button className="sr-head" type="button" onClick={() => toggle(c)} aria-expanded={open === c.id}>
                  <span className="sr-who"><b>{c.name}</b><span className="rs-muted">{[c.event, day(c.date)].filter(Boolean).join(' · ') || (c.shoot ? '' : 'Gallery')}</span></span>
                  <ol className="sr-rail" aria-label="Progress">
                    {STEPS.map((s, i) => <li key={s} className={`sr-step${done[i] ? ' is-done' : i === next ? ' is-next' : ''}`}><i className="sr-dot" /><span>{s}</span></li>)}
                  </ol>
                  <span className="sr-counts">📷 {c.jpegs} · RAW {c.raws}{c.selected ? ` · ✅ ${c.selected}` : ''}</span>
                </button>
                {open === c.id && (
                  <div className="sr-body">
                    <div className="sr-group">
                      <h4 className="sr-h">⬇️ Download</h4>
                      <div className="sr-actions">
                        {c.jpegs > 0 && <a className="rs-x" href={zip(c, 'jpeg')}>JPEGs ({c.jpegs})</a>}
                        {c.raws > 0 && <a className="rs-x" href={zip(c, 'raw')}>All RAWs ({c.raws} · {gb(c.bytes)})</a>}
                        {c.selectedWithRaw > 0 && <a className="rs-x" href={zip(c, 'picked')}>RAWs of the picks ({c.selectedWithRaw})</a>}
                        {c.raws > 0 && c.jpegs > 0 && <a className="rs-x" href={zip(c, 'both')}>JPEGs + RAWs</a>}
                        {!c.jpegs && !c.raws && <span className="rs-muted">Nothing uploaded yet.</span>}
                      </div>
                    </div>
                    {c.client && (
                      <div className="sr-group">
                        <h4 className="sr-h">🔗 The client's page</h4>
                        <p className="rs-muted">View password <b>{c.client.view || '—'}</b> · pick password <b>{c.client.pick || '—'}</b> — open it with the pick password to choose for the client.</p>
                        <div className="sr-actions"><a className="rs-x" href={c.client.link} target="_blank" rel="noreferrer">Open the client's page</a></div>
                      </div>
                    )}
                    {c.shoot && (
                      <div className="sr-group">
                        <h4 className="sr-h">⬆️ Upload more</h4>
                        <div className="sr-actions">
                          <label className={`rs-x rs-file${busy ? ' is-off' : ''}`}>Choose RAW + JPEG
                            <input type="file" multiple hidden disabled={busy} accept={SHOOT_ACCEPT} onChange={e => upload(c.leadId, e)} />
                          </label>
                          {c.jpegs > 0 && <button className="rs-x" type="button" disabled={busy} onClick={() => tellClient(c)}>📣 Notify the client</button>}
                        </div>
                      </div>
                    )}
                    <div className="sr-group">
                      <h4 className="sr-h">📝 Note for the editor</h4>
                      <textarea className="sr-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Warm tones, remove the exit sign in the first dance" />
                      <div className="sr-actions"><button className="rs-x" type="button" onClick={() => saveNote(c)}>Save note</button></div>
                    </div>
                    <div className="sr-group">
                      <h4 className="sr-h">🗑️ RAW files</h4>
                      <p className="rs-muted">{c.rawsRemoved ? `${c.rawsRemoved.scope === 'all' ? 'All RAWs' : 'Unpicked RAWs'} removed ${day(c.rawsRemoved.at)}.` : 'RAWs are kept until you remove them.'}</p>
                      <div className="sr-actions">
                        {c.raws > 0 && c.selected > 0 && <button className="rs-x" type="button" onClick={() => removeRaws(c, 'unpicked')}>Delete non-selected</button>}
                        {c.raws > 0 && <button className="rs-x sr-danger" type="button" onClick={() => removeRaws(c, 'all')}>Delete all RAWs</button>}
                        {c.shoot && <button className="rs-x sr-danger" type="button" onClick={() => removeRow(c)}>Remove this client</button>}
                      </div>
                    </div>
                    {msg && <div className="ep-progress">{msg}</div>}
                  </div>
                )}
              </div>
            );
          })}
    </div>
  );
}
