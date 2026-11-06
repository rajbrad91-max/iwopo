import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** 🗑️ Delete a vendor for good: what goes, then the business name typed to confirm (lib/deleteVendor.js). */
export default function DeleteVendorModal({ vendorId, onClose, onDeleted }) {
  const [p, setP] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.vendorDeletePreview(vendorId).then(setP).catch(e => setErr(e.message)); }, [vendorId]);
  const match = p && typed.trim().toLowerCase() === String(p.business_name || '').trim().toLowerCase();

  async function go() {
    setBusy(true); setErr('');
    try { await api.deleteVendor(vendorId, typed); onDeleted(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="sa-del-back" role="dialog" aria-modal="true" aria-label="Delete vendor">
      <div className="sa-del">
        <h3 className="sa-del-h">🗑️ Delete {p ? p.business_name : 'vendor'}?</h3>
        {!p ? <p className="sa-del-p">{err || 'Loading…'}</p> : p.blocked ? <p className="sa-del-p">🔒 {p.blocked}</p> : <>
          <p className="sa-del-p">This removes the account <b>for good</b> — it cannot be undone:</p>
          <ul className="sa-del-list">
            {Object.entries(p.counts).map(([k, n]) => <li key={k}><span>{k}</span><b>{n}</b></li>)}
          </ul>
          <label className="sa-del-p" htmlFor="sa-del-name">Type <b>{p.business_name}</b> to confirm:</label>
          <input id="sa-del-name" className="sa-del-input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </>}
        {err && p && <p className="sa-del-err">⚠️ {err}</p>}
        <div className="sa-del-actions">
          <button type="button" className="sa-del-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          {p && !p.blocked && <button type="button" className="sa-del-go" disabled={!match || busy} onClick={go}>{busy ? 'Deleting…' : 'Delete for good'}</button>}
        </div>
      </div>
    </div>
  );
}
