import { useState } from 'react';
import { api } from '../lib/api';
import SignContract from './SignContract';
import './contractpreview.css';

/**
 * 👁️ A vendor reading their own contract before it goes to a client.
 *
 * A full page rather than a modal. A contract is a document — judging one
 * through a scrolling box inside a dialog is not reviewing it, and the vendor is
 * being asked to take responsibility for what it says.
 *
 * The document itself is rendered by SignContract, the same component the client
 * signs on. Building a second renderer for the preview would let the two drift,
 * and a preview that differs from what gets sent is worse than none: it gives
 * confidence in something nobody has actually checked.
 */
export default function ContractPreview({ leadId }) {
  const [released, setReleased] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function release(contractId) {
    if (!contractId) {
      setMsg('⚠️ No contract has been built for this lead yet.');
      return;
    }
    setBusy(true); setMsg('');
    try {
      await api.releaseContract(contractId);
      setReleased(true);
      setMsg('✅ Released — the packages can be sent now.');
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="cp-page">
      <header className="cp-top">
        <button className="cp-back" onClick={() => { if (!window.close()) window.history.back(); }}>
          ← Back
        </button>
        <span className="cp-title">📄 Contract preview</span>
        {released && <span className="cp-done">✅ Released</span>}
      </header>

      {busy && <div className="cp-msg">Releasing…</div>}
      {msg && <div className={`cp-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</div>}

      <div className="cp-doc">
        <SignContract previewLeadId={leadId} onRelease={release} />
      </div>
    </div>
  );
}
