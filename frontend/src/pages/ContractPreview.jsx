import { useState, useEffect } from 'react';
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
  /* the vendor's templates, so they can choose which agreement to send */
  const [templates, setTemplates] = useState([]);
  const [chosen, setChosen] = useState('');
  const [needsBuilding, setNeedsBuilding] = useState(false);

  useEffect(() => {
    api.ctTemplates().then(d => {
      const list = d.templates || [];
      setTemplates(list);
      /* ⚠️ Pre-selected, because one template is the common case and a
         vendor should not have to choose from a list of one. */
      /* ⚠️ The vendor MARKED one as default — honour it rather than
         offering whichever happens to be first. */
      const pick = list.find(t => t.is_default) || list[0];
      if (pick) setChosen(String(pick.id));
    }).catch(() => {});
  }, []);

  /**
   * Build the contract for this lead from a template.
   * ⚠️ This is the step that was missing entirely — everything after it
   * worked, and nothing could reach it.
   */
  async function buildFromTemplate() {
    if (!chosen) { setMsg('⚠️ Choose a template first'); return; }
    setBusy(true); setMsg('');
    try {
      await api.createContractFromTemplate(leadId, Number(chosen));
      setMsg('✅ Contract built — review it below, then release it.');
      setNeedsBuilding(false);
      /* reload so the preview shows the document that was just built */
      window.location.reload();
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

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

          {/* ⚠️ The step that did not exist. api.createContractFromTemplate
              worked; nothing called it, so a vendor was told no contract had
              been built and had no way to build one. Shown exactly when
              there is nothing to preview. */}
          {needsBuilding && (
            <div className="cp-build">
              <label htmlFor="cp-tpl">Build this contract from</label>
              <select id="cp-tpl" value={chosen} onChange={e => setChosen(e.target.value)}>
                {templates.length === 0 && <option value="">No templates yet — make one in Contract setup</option>}
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>
                ))}
              </select>
              <button className="cp-build-btn" onClick={buildFromTemplate} disabled={busy || !chosen}>
                {busy ? '⏳ Building…' : '📄 Build contract'}
              </button>
            </div>
          )}

      <div className="cp-doc">
        <SignContract previewLeadId={leadId} onRelease={release} />
      </div>
    </div>
  );
}
