import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import SignContract from './SignContract';
import './contractpreview.css';
import AutoReleaseToggle from '../components/AutoReleaseToggle';
import { useAutoRelease } from '../lib/useAutoRelease';
import SendPackagesButton from '../components/SendPackages';

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
  const [docKey, setDocKey] = useState(0);   // bumped after release: the document reloads and shows "Released"
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  /* the vendor's templates, so they can choose which agreement to send */
  const [templates, setTemplates] = useState([]);
  const [chosen, setChosen] = useState('');
  const [needsBuilding, setNeedsBuilding] = useState(false);
  const [previewName, setPreviewName] = useState('');

  useEffect(() => {
    api.ctTemplates().then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  /* 📤 the lead and its packages, for Send Packages at the foot of the contract */
  const [lead, setLead] = useState(null);
  const [pkgCount, setPkgCount] = useState(0);
  const [sendMsg, setSendMsg] = useState('');
  useEffect(() => {
    api.lead(leadId).then(d => setLead(d.lead || null)).catch(() => {});
    api.leadPackages(leadId).then(d => setPkgCount((d.packages || []).length)).catch(() => {});
  }, [leadId]);

  useEffect(() => {
    if (!templates.length) return;
    /* The agreement on screen, else the vendor's default, else the first. */
    const pick = (previewName && templates.find(t => t.name === previewName))
      || templates.find(t => t.is_default)
      || templates[0];
    if (pick) setChosen(String(pick.id));
  }, [templates, previewName]);

  function onLoaded(ct) {
    setNeedsBuilding(!ct?.id);
    if (ct?.template_name) setPreviewName(ct.template_name);
  }

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
      setDocKey(k => k + 1);
      setMsg('✅ Released. The client has not been told yet: send the packages to share it with them.');
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  /* 🔓 Auto Release — the same account-wide switch as Contract setup (lib/useAutoRelease). Turning it on approves
     this contract too, as it would have been approved had the switch been on when it was built; otherwise its
     Release button would be greyed out with the contract still held back. */
  const autoRelease = useAutoRelease();
  async function toggleAutoRelease(on, ct) {
    setMsg('');
    try { await autoRelease.save(on); }
    catch (e) { setMsg('⚠️ ' + e.message); return; }
    if (on && ct?.id && !ct.released_at) await release(ct.id);
    else setMsg(on ? '🔓 Auto Release is on — contracts are approved as soon as they are built' : '🔒 Auto Release is off — you release each contract after reading it');
  }
  /* the controls in the preview's bar: the switch, and Release contract — greyed out once the contract is released.
     With Auto Release on, contracts are released as they are built, so the button is greyed out; a contract built
     before the switch went on still has its Release button, or it could never reach the client. */
  const previewActions = (ct) => (
    <div className="ct-prev-actions">
      <AutoReleaseToggle className="ct-prev-auto" on={autoRelease.on} disabled={!autoRelease.ready || busy}
        onChange={(on) => toggleAutoRelease(on, ct)} />
      <button type="button" className="ct-prev-release" onClick={() => release(ct?.id)}
        disabled={busy || !ct?.id || !!ct?.released_at}>
        {ct?.released_at ? `✓ Released ${String(ct.released_at).slice(0, 10)}` : 'Release contract'}
      </button>
    </div>
  );

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
        <SignContract key={docKey} previewLeadId={leadId} previewActions={previewActions} onLoaded={onLoaded} />
      </div>

      {/* 📤 read the contract, then send the packages from here — the same Send Packages as the lead page */}
      {lead && (
        <div className="cp-send">
          <p className="cp-send-note">Happy with the contract? Send {lead.name || 'your client'} their packages.</p>
          <SendPackagesButton lead={lead} packageCount={pkgCount} className="cp-build-btn cp-send-btn" onMessage={setSendMsg} />
          {sendMsg && <div className={`cp-msg ${sendMsg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{sendMsg}</div>}
        </div>
      )}
    </div>
  );
}
