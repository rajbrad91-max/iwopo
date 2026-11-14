/**
 * 📋 Leads: the list, adding one, and a lead’s detail (packages, contracts, money).
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import LeadCard from '../../components/LeadCard';
import { MdSwapVert } from 'react-icons/md';
import LeadListingMenu, { DEFAULT_LISTING, rangeLabel } from '../../components/LeadListingMenu';
import { LeadContact, LeadEvents } from '../../components/LeadOverview';
import LeadEditor from '../../components/LeadEditor';
import { useDialog } from '../../lib/dialog.jsx';
import { api, getUser, fmtDateTime } from '../../lib/api';
import { LeadFormBody, PARTIAL_TIME, plainNumber } from '../InquiryForm';
import SendPackagesModal from '../SendPackagesModal.jsx';
import SendPackagesButton, { markPackagesSent } from '../../components/SendPackages';
import { clientBase } from '../../lib/clientBase';
import { S_LABEL } from './statuses';
import { MoneySection } from './MoneySection';
import { LeadPkgRow, PackageEditor } from './LeadPackage';

// ➕ Manual add-lead modal (mirrors the public inquiry form fields)
function AddLeadModal({ vendorId, onClose, onSaveDone }) {
  const [cfg, setCfg] = useState(null);
  const [p, setP] = useState({ role: '', name: '', email: '', phone: '', instagram: '', heard: '' });
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setPI = (k, v) => setP(s => ({ ...s, [k]: v }));
  const setAns = (id, v) => setAnswers(s => ({ ...s, [id]: v }));

  useEffect(() => {
    api.myInquirySettings(vendorId).then(d => setCfg(d.settings)).catch(() => setCfg({}));
  }, [vendorId]);

  const has = (v) => v !== undefined && v !== null && v !== '';
  async function save() {
    setErr('');
    if (!p.name || !p.email) { setErr('Name and email are required'); return; }
    const custom = { ...answers };
    for (const fld of (cfg?.custom_fields || [])) {
      if (fld.type === 'time' && answers[fld.id] === PARTIAL_TIME) { setErr(`Finish the time for "${fld.label}"`); return; }
      if (fld.required && !answers[fld.id]) { setErr(`"${fld.label}" is required`); return; }
      if (fld.type === 'number' && has(custom[fld.id])) custom[fld.id] = plainNumber(custom[fld.id]);
    }
    setBusy(true);
    try {
      await api.createLead({ name: p.name, email: p.email, phone: p.phone, role: p.role, instagram: p.instagram, heard: p.heard, notes, custom_data: custom });
      onSaveDone();
    } catch (e) { setErr(e.message || 'Failed'); setBusy(false); }
  }

  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="al-modal iq-inline" onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">➕ Add Lead</h3>
          <button className="al-x" onClick={onClose}>✕</button>
        </div>
        {!cfg ? <div className="loading">Loading…</div> : (
          <>
            <LeadFormBody cfg={cfg} p={p} setPI={setPI} answers={answers} setAns={setAns} notes={notes} setNotes={setNotes} />
            {err && <div className="al-err">⚠️ {err}</div>}
            <button className="refresh al-save" onClick={save} disabled={busy}>{busy ? 'Saving…' : '💾 Save Lead'}</button>
          </>
        )}
      </div>
    </div>
  );
}

export function LeadsView({ routeLead, onOpenLead }) {
  const dialog = useDialog();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('active'); // active | history
  const [filter, setFilter] = useState('all'); // all | new | quoted | booked
  const [checked, setChecked] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // the lead whose Send Packages modal is open, if any
  const [sendFor, setSendFor] = useState(null);

  // 🗑️ Bin: 1st click → select mode; with items checked → act; in mode with none → exit.
  //
  // In the active list the bin ARCHIVES. It used to hard-delete, so a mis-tap
  // destroyed a client's enquiry, their packages and their history with no way
  // back. Archiving keeps everything and moves it to History, and permanent
  // deletion now only exists there — a second, deliberate step on a lead the
  // vendor has already put aside.
  function onBinClick() {
    if (!selectMode) { setSelectMode(true); return; }
    if (checked.length) { view === 'history' ? deleteChecked() : archiveChecked(); return; }
    setSelectMode(false);
  }
  async function deleteChecked() {
    if (!checked.length) return;
    if (!await dialog.confirm(`This erases their packages, contracts and payment history.\n\nIt cannot be undone.`, { title: `Permanently delete ${checked.length} lead${checked.length === 1 ? '' : 's'}?`, okLabel: 'Delete for good' })) return;
    try { await api.bulkDeleteLeads(checked); setMsg('🗑️ Deleted for good'); setTimeout(() => setMsg(''), 1500); setSelectMode(false); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  // ⇅ sort & date filter — kept in this browser; "Newest first · All time" is the list exactly as before
  const [listing, setListing] = useState(() => { try { return { ...DEFAULT_LISTING, ...JSON.parse(localStorage.getItem('leads_listing') || '{}') }; } catch { return { ...DEFAULT_LISTING }; } });
  const [showListing, setShowListing] = useState(false);
  const changeListing = (next) => { setListing(next); localStorage.setItem('leads_listing', JSON.stringify(next)); };
  const listed = listing.sort !== 'newest' || listing.range !== 'all';

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [view, listing.sort, listing.range]);
  async function load() {
    setLoading(true); setChecked([]); setSelectMode(false);
    try {
      const d = view === 'active' ? await api.leads(undefined, listing) : await api.leadsHistory(listing);
      setLeads(d.leads || []);
    } catch {}
    finally { setLoading(false); }
  }

  // 🔗 Which lead is open comes from the URL, not from local state — the same
  // shape GalleriesView uses. Until the list has loaded there's nothing to match
  // against, so the table shows briefly and then the detail takes over.
  const sel = routeLead ? leads.find(l => String(l.id) === String(routeLead)) || null : null;
  // A lead can be linked to and still not be in this list: archived leads only
  // exist under History. Say so rather than showing the table as though the
  // click did nothing.
  const missingLead = !!routeLead && !loading && !sel;

  // Opening a lead marks that one read, so the sidebar badge keeps counting
  // leads the vendor hasn't looked at rather than clearing wholesale on arrival.
  // Optimistic: the row un-bolds immediately, and the count is re-read on close.
  useEffect(() => {
    if (!sel || sel.seen_at) return;
    setLeads(ls => ls.map(x => x.id === sel.id ? { ...x, seen_at: new Date().toISOString() } : x));
    api.markLeadsSeen(sel.id).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- marks a lead seen once, when it is opened
  }, [sel?.id]);

  function toggleCheck(id, e) {
    e.stopPropagation();
    setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  async function archiveChecked() {
    if (!checked.length) return;
    if (!await dialog.confirm('You can restore them any time from History.', { title: `Move ${checked.length} lead${checked.length === 1 ? '' : 's'} to History?`, okLabel: 'Move', danger: false })) return;
    try { await api.bulkArchive(checked); setMsg('🗂️ Moved to History'); setTimeout(() => setMsg(''), 1500); setSelectMode(false); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  async function restore(id, e) {
    e.stopPropagation();
    try { await api.restoreLead(id); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  // 📤 Sending from the list opens the same compose modal as the lead detail —
  // a vendor should always see what their client receives before it goes.
  function sendPkgs(l, e) {
    e.stopPropagation();                        // don't open the lead behind it
    setSendFor(l);
  }

  if (sel) return (
    <LeadDetail
      key={sel.id}
      lead={sel}
      onSaved={(row) => setLeads(ls => ls.map(x => x.id === row.id ? { ...x, ...row } : x))}
    />
  );

  // 📊 stat tiles + filtering
  const counts = {
    all: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    quoted: leads.filter(l => l.status === 'quoted').length,
    booked: leads.filter(l => l.status === 'booked').length,
  };
  // 👁️ Opening a lead is a URL change, matching how galleries work. That's what
  // lets a notification (or a pasted link) land on the right lead, and keeps the
  // browser Back button meaningful instead of dropping out of the panel.
  function openLead(l) { onOpenLead(l.id); }

  const byFilter = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const shown = search.trim()
    ? byFilter.filter(l => `${l.name} ${l.email} ${l.phone} ${l.event_type} ${l.location}`.toLowerCase().includes(search.toLowerCase()))
    : byFilter;

  // 🔢 Row number, counting down the table: the top row is #1. The list arrives
  // newest-first, so numbering follows that order rather than creation order —
  // otherwise the newest lead showed the highest number at the top and the
  // column read backwards. Built from the full list, not the visible rows, so
  // filtering or searching never renumbers what's left.
  const seq = new Map(leads.map((l, i) => [l.id, i + 1]));

  // ☑️ Select every lead shown — this tab (Active or History) after the search, never a lead out of sight (Raj,
  // 2026-11-11). One box, in the table header on a computer and above the cards on a phone. Bookings has none.
  const allShown = shown.length > 0 && shown.every(l => checked.includes(l.id));
  const someShown = !allShown && shown.some(l => checked.includes(l.id));
  function toggleAllShown() {
    const ids = shown.map(l => l.id);
    setChecked(c => (allShown ? c.filter(id => !ids.includes(id)) : [...new Set([...c, ...ids])]));
  }
  const selectAllBox = (
    <input type="checkbox" className="lead-check-all" checked={allShown} onChange={toggleAllShown}
      ref={el => { if (el) el.indeterminate = someShown; }} aria-label={`Select all ${shown.length} leads shown`} />
  );
  const seqOf = (id) => seq.get(id) ?? '—';
  const TILES = [
    ['all', '📋', 'Total Leads'],
    ['new', '🆕', 'New'],
    ['quoted', '📤', 'Packages Sent'],
    ['booked', '✅', 'Booked'],
  ];

  return (
    <div>
      {missingLead && (
        <div className="err-banner">
          🔍 That lead isn&apos;t in your active list — it may have been archived. Check History.
        </div>
      )}
      <div className="lead-topbar">
        {view === 'active' ? (
          <div className="lead-stats">
            {TILES.map(([key, icon, label]) => (
              <button key={key} className={`lead-stat ${filter === key ? 'is-on' : ''}`} onClick={() => setFilter(key)}>
                <span className="lead-stat-ic">{icon}</span>
                <span className="lead-stat-val">{counts[key]}</span>
                <span className="lead-stat-lbl">{label}</span>
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="leads-tabs">
          {view === 'active' && <>
            <button className="lead-ic-btn" onClick={() => setShowAdd(true)} title="Add lead">➕</button>
            <button className={`lead-ic-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); setSearch(''); }} title="Search">🔍</button>
          </>}
          {/* the bin means "move to History" in the active list and "delete for
              good" in History, so its wording changes with the view */}
          <button className={`lead-ic-btn lead-ic-del ${selectMode ? 'is-on' : ''}`} onClick={onBinClick}
            title={selectMode
              ? (checked.length
                ? (view === 'history' ? `Delete ${checked.length} permanently` : `Move ${checked.length} to History`)
                : 'Cancel select')
              : (view === 'history' ? 'Select to delete permanently' : 'Select to move to History')}>
            {selectMode && checked.length ? `🗑️ ${checked.length}` : '🗑️'}
          </button>
          <span className="lsm-wrap">
            <button type="button" className={`lead-ic-btn ${listed ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={showListing}
              onClick={() => setShowListing(s => !s)} title="Sort & filter" aria-label="Sort & filter"><MdSwapVert className="lsm-ic" aria-hidden="true" /></button>
            {showListing && <LeadListingMenu listing={listing} onChange={changeListing} onClose={() => setShowListing(false)} />}
          </span>
          <button className={`refresh ${view === 'active' ? 'is-on' : ''}`} onClick={() => setView('active')}>📋 Active</button>
          <button className={`refresh ${view === 'history' ? 'is-on' : ''}`} onClick={() => setView('history')}>📜 History</button>
        </div>
      </div>

      {listing.range !== 'all' && !loading && (
        <div className="lead-range-chip">📅 {rangeLabel(listing.range)} · {leads.length} lead{leads.length === 1 ? '' : 's'}
          <button type="button" aria-label="Show all leads" onClick={() => changeListing({ ...listing, range: 'all' })}>✕</button>
        </div>
      )}

      {(msg || checked.length > 0) && (
        <div className="leads-actions">
          {msg && <span className={`leads-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</span>}
          {checked.length > 0 && (
            view === 'history'
              ? <button className="refresh btn-danger" onClick={deleteChecked}>🗑️ Delete permanently ({checked.length})</button>
              : <button className="refresh btn-archive" onClick={archiveChecked}>🗂️ Move to History ({checked.length})</button>
          )}
        </div>
      )}

      {showSearch && view === 'active' && (
        <input className="lead-search" autoFocus placeholder="🔍 Search name, email, phone, event…" value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {showAdd && <AddLeadModal vendorId={getUser()?.vendor_id} onClose={() => setShowAdd(false)} onSaveDone={() => { setShowAdd(false); load(); }} />}

      {sendFor && (
        <SendPackagesModal
          lead={sendFor}
          link={`${clientBase()}/portal/${sendFor.client_token}`}
          onClose={() => setSendFor(null)}
          onSent={async () => {
            await markPackagesSent(sendFor.id);
            setMsg(`📤 Sent to ${sendFor.email}`);
            setTimeout(() => setMsg(''), 2500);
            load();
          }}
        />
      )}

      {selectMode && shown.length > 0 && <label className="lead-selall-bar">{selectAllBox} Select all {shown.length}</label>}
      <div className="table-wrap">
        <table className="leads-table">
          <thead><tr>{selectMode && <th className="col-check">{shown.length > 0 && selectAllBox}</th>}<th className="col-num">#</th><th>Client</th><th>Event</th><th>Date</th><th>Location</th><th>Packages</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" className="empty">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan="9" className="empty">{view === 'active' ? 'No leads yet. Share your inquiry link! 📨' : 'No archived leads 📜'}</td></tr>
            ) : shown.map(l => (
              <tr key={l.id} onClick={() => { if (selectMode) { setChecked(c => c.includes(l.id) ? c.filter(x => x !== l.id) : [...c, l.id]); return; } if (view === 'active') openLead(l); }} className={`${view === 'active' || selectMode ? 'row-clickable' : ''}${view === 'active' && !l.seen_at ? ' is-unread' : ''}`}>
                {selectMode && (
                  <td className="cell-check" onClick={e => toggleCheck(l.id, e)}>
                    <input type="checkbox" readOnly checked={checked.includes(l.id)} className="lead-check" />
                  </td>
                )}
                <td className="col-num" data-label="#">{seqOf(l.id)}</td>
                {/* 📅 when it arrived — the list could not say (Muse leads comparison, 2026-10-30) */}
                <td className="biz" data-label="Client">{l.name}{l.created_at && <span className="lead-received">📥 {fmtDateTime(l.created_at, { zone: true })}</span>}</td>
                <td data-label="Event">{l.event_type}</td>
                <td data-label="Date">{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
                <td data-label="Location">{l.location || '—'}</td>
                {/* the folder that was sent, or the package once the client
                    has chosen one from it */}
                <td data-label="Packages">{l.package_name || (l.package_template_id ? `📁 ${l.template_name || 'Sent'}` : '—')}</td>
                <td data-label="Status"><span className={`badge ${l.status === 'booked' ? 'active' : 'trial'}`}>{S_LABEL[l.status] || l.status}</span></td>
                <td className="col-actions" data-label="Actions">
                  {view === 'active'
                    ? <div className="lead-actions">
                        {/* 📤 send from the list — no need to open the lead first.
                            Needs a folder assigned and an email, since the mail
                            has nothing to link to otherwise. There's no Open
                            button: the whole row is clickable. */}
                        {l.package_template_id && l.email && (
                          <button
                            className="lead-send"
                            onClick={e => sendPkgs(l, e)}
                            title={`Email the packages to ${l.email}`}
                          >
                            📤 <span className="lead-send-txt">Send Packages</span>
                          </button>
                        )}
                      </div>
                    : <span className="lead-restore" onClick={e => restore(l.id, e)}>↩️ Restore</span>}
                </td>
                {/* 📱 the phone card — hidden in the desktop table */}
                <td className="lc-cell"><LeadCard lead={l} history={view !== 'active'} onSend={sendPkgs} onRestore={restore} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadDetail({ lead, onSaved }) {
  const dialog = useDialog();
  const [edit, setEdit] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  // 📦 The vendor loads a FOLDER; its packages are copied onto this lead so they
  // can be tailored for this client without touching the master list. Locked
  // once sent, so a client can't have the offer change under them.
  const [tpls, setTpls] = useState([]);
  const [tplId, setTplId] = useState(lead.package_template_id || '');
  const [leadPkgs, setLeadPkgs] = useState([]);
  const [pkgLocked, setPkgLocked] = useState(!!lead.packages_sent_at);
  const [editPkg, setEditPkg] = useState(null);   // id of the package being edited
  const [gateway, setGateway] = useState(!!lead.gateway_enabled);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgMsg, setPkgMsg] = useState('');
  const [timer, setTimer] = useState({
    enabled: !!lead.timer_enabled,
    hours: lead.timer_hours ?? 72,
    started_at: lead.timer_started_at || null,
  });

  async function saveTimer(opts = {}) {
    const next = { enabled: timer.enabled, hours: Number(timer.hours) || 72, ...opts };
    try {
      const d = await api.saveTimer(lead.id, next);
      setTimer({ enabled: d.timer_enabled, hours: d.timer_hours, started_at: d.timer_started_at });
      setPkgMsg('✅ Timer saved'); setTimeout(() => setPkgMsg(''), 1500);
    } catch (e) { setPkgMsg('⚠️ ' + e.message); }
  }

  useEffect(() => {
    api.myInquirySettings(lead.vendor_id).then(d => setCfg(d.settings)).catch(() => setCfg({}));
  }, [lead.vendor_id]);

  async function toggleGateway() {
    const next = !gateway;
    setGateway(next);
    try { await api.setGateway(lead.id, next); setPkgMsg(next ? '🔒 Secure login ON' : '🔓 Secure login OFF'); setTimeout(() => setPkgMsg(''), 1500); }
    catch (e) { setGateway(!next); setPkgMsg('⚠️ ' + e.message); }
  }
  const [moneyTick, setMoneyTick] = useState(0);   // 💰 Payments reloads when it moves (Muse F-21)
  // ⏱ hours and guests price the package (extra hours, per guest, per-guest extras) — the total follows an edit to them
  const sizeKey = `${lead.hours ?? ''}|${lead.guests ?? ''}`;
  const lastSize = useRef(sizeKey);
  useEffect(() => {
    if (lastSize.current === sizeKey) return;
    lastSize.current = sizeKey;
    setMoneyTick(t => t + 1);
  }, [sizeKey]);
  // 📤 a message under the packages for a few seconds (components/SendPackages and the package tools use it)
  const flashPkg = (m) => { setPkgMsg(m); setTimeout(() => setPkgMsg(''), 3000); };

  useEffect(() => {
    // folders to choose from, and whatever is already loaded onto this lead
    api.pkgTemplates().then(d => setTpls(d.templates || [])).catch(() => {});
    refreshLeadPkgs();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- LeadDetail is keyed by the lead, so this runs once per lead
  }, []);

  function refreshLeadPkgs() {
    api.leadPackages(lead.id)
      .then(d => { setLeadPkgs(d.packages || []); setPkgLocked(!!d.locked); })
      .catch(() => {});
  }

  // Copy a folder's packages onto this lead. Replaces what's there — this is
  // "offer this client these packages", not "add more".
  async function loadFolder(id) {
    setTplId(id);
    if (!id) { setLeadPkgs([]); return; }
    setPkgBusy(true);
    try {
      const d = await api.loadLeadPackages(lead.id, id);
      setLeadPkgs(d.packages || []);
      setMoneyTick(t => t + 1);   // the total follows the loaded packages
      setMsg(`✅ ${d.packages.length} packages loaded from ${d.folder}`);
      setTimeout(() => setMsg(''), 2200);
    } catch (e) {
      setMsg('⚠️ ' + e.message);
      setTplId(lead.package_template_id || '');
    } finally { setPkgBusy(false); }
  }

  async function savePkg(id, patch) {
    try {
      const d = await api.updateLeadPackage(lead.id, id, patch);
      setLeadPkgs(ps => ps.map(p => p.id === id ? d.package : p));
      setMoneyTick(t => t + 1);
      setEditPkg(null);
    } catch (e) { setMsg('⚠️ ' + e.message); setTimeout(() => setMsg(''), 3000); }
  }

  async function removePkg(id, name) {
    if (!await dialog.confirm(`"${name}" will no longer be offered to this client.`, { title: 'Remove this package?', okLabel: 'Remove' })) return;
    try {
      await api.deleteLeadPackage(lead.id, id);
      setLeadPkgs(ps => ps.filter(p => p.id !== id));
      setMoneyTick(t => t + 1);   // one package left is the one in force
    } catch (e) { setMsg('⚠️ ' + e.message); setTimeout(() => setMsg(''), 3000); }
  }

  async function toggleLock() {
    const next = !pkgLocked;
    if (next === false && !await dialog.confirm('The client may already be looking at them.', { title: 'Unlock these packages?', okLabel: 'Unlock', danger: false })) return;
    try {
      await api.setPackagesLock(lead.id, next);
      setPkgLocked(next);
    } catch (e) { setMsg('⚠️ ' + e.message); setTimeout(() => setMsg(''), 3000); }
  }

  // ✏️ Edit Details — the client's own inquiry form, editable (components/LeadEditor, shared with the booking page)
  if (edit) return <LeadEditor lead={lead} cfg={cfg} onSaved={onSaved} onClose={(m) => { setEdit(false); setMsg(m || ''); }} />;

  // ---- VIEW MODE ----
  return (
    <div className="ld-view">
      {msg && <div className="ld-msg is-ok">{msg}</div>}

      {/* 🗂️ The contact as one strip across the top; under it the main event leads the left column (with every
          other answer about it), then the pre-events and the notes, while Payments and the contract sit beside it on
          the right — components/LeadOverview (shared with the booking page). ✏️ Edit Details edits everything. */}
      <LeadContact lead={lead} cfg={cfg} />
      <div className="lead-grid">
      <div className="lead-left">
      <LeadEvents lead={lead} cfg={cfg} onSaved={onSaved} onEdit={() => setEdit(true)} />
      </div>

      <div className="lead-right">

      {/* 📦 Packages — at the top of the right column, beside the money they decide (Raj, 2026-11-13: before, they sat
          at the bottom of the left column, far from Payments) */}
      <div className="ld-card">
        <div className="ld-card-h">
          📦 Packages
          {pkgLocked && <span className="ld-lock-tag">🔒 Sent</span>}
        </div>

        {/* pick a folder → its packages are copied here, ready to tailor */}
        <select className="ld-select ld-pkg-select" value={tplId}
          onChange={e => loadFolder(e.target.value)} disabled={pkgLocked || pkgBusy}>
          <option value="">— Choose a package folder —</option>
          {tpls.map(t => (
            <option key={t.id} value={t.id}>
              📁 {t.name} ({(t.packages || []).length} package{(t.packages || []).length === 1 ? '' : 's'})
            </option>
          ))}
        </select>

        {pkgLocked && (
          <div className="ld-lock-note">
            These packages have been sent, so they're locked to prevent accidental changes.
            <button type="button" className="ld-unlock-btn" onClick={toggleLock}>✏️ Edit Packages</button>
          </div>
        )}

        {/* the client's own copies — editable per client, master list untouched */}
        {leadPkgs.map(p => (editPkg === p.id
          ? <div key={p.id} className="ld-pkg"><PackageEditor pkg={p} onSave={patch => savePkg(p.id, patch)} onCancel={() => setEditPkg(null)} /></div>
          : <LeadPkgRow key={p.id} pkg={p} lead={lead} locked={pkgLocked}
              onEdit={() => setEditPkg(p.id)} onRemove={() => removePkg(p.id, p.name)} onSave={patch => savePkg(p.id, patch)} />
        ))}

        {!leadPkgs.length && tplId && !pkgBusy && (
          <p className="ld-pkg-empty">That folder has no packages yet.</p>
        )}
        <div className="ld-btn-row">
          <button
            className="refresh ld-btn-sm"
            type="button"
            title="Preview the contract before you send packages"
            onClick={() => window.open(`/contract-preview/${lead.id}`, '_blank')}
          >👁️ Preview Contract</button>
          <SendPackagesButton lead={lead} packageCount={leadPkgs.length} className="refresh bx-primary ld-btn-sm" disabled={pkgBusy}
            onMessage={flashPkg} onSent={() => { setPkgLocked(true); setMoneyTick(t => t + 1); }} />
        </div>
        {pkgMsg && <div className={`ld-msg ${pkgMsg[0] === '⚠' ? 'is-err' : 'is-ok'} ld-msg-mt`}>{pkgMsg}</div>}
      </div>


      {/* 💰 Payment */}
      <MoneySection lead={lead} refresh={moneyTick} />

      {/* 📄 Contract + portal/timer controls — kept together on the action side */}
      <div className="ld-side-box">
        <ContractsBox
          lead={lead}
          actions={(
            <>
              <button
                className={`refresh ld-gate ld-btn-sm ${gateway ? 'is-on' : ''}`}
                onClick={toggleGateway}
                title={gateway
                  ? 'Secure login is ON — client must confirm their email before opening the portal'
                  : 'Secure login is OFF — turn on to require email confirmation before the client portal opens'}
              >🔒 Secure {gateway ? 'ON' : 'OFF'}</button>
              <div className={`ld-timer-btn ${timer.enabled ? 'is-on' : ''}`} title="How long the package offer stays valid after you send it">
                <button
                  className="ld-timer-toggle"
                  onClick={() => saveTimer({ enabled: !timer.enabled })}
                  title={timer.enabled
                    ? 'Offer timer is ON — click to turn off the countdown'
                    : 'Offer timer is OFF — click to start a countdown when packages are sent'}
                >⏳ Timer {timer.enabled ? 'ON' : 'OFF'}</button>
                <input className="ld-timer-hrs" type="number" min="1" max="720" value={timer.hours}
                  onChange={e => setTimer(t => ({ ...t, hours: e.target.value }))}
                  onBlur={() => timer.enabled && saveTimer()}
                  title="Hours the offer stays valid after packages are sent" />
                <span className="ld-timer-unit">h</span>
              </div>
            </>
          )}
        />
        {timer.enabled && timer.started_at && (
          <div className="ld-timer-status">
            ▶ Expires in <b>{expiryText(timer.started_at, timer.hours)}</b>
          </div>
        )}
      </div>

      </div>
      </div>
    </div>
  );
}

/**
 * 📄 One button. The old version listed every contract instance with copy
 * links and a delete control, on top of a preview that showed the raw
 * document — but that preview was never the real one: /contract-preview,
 * the page that actually renders the built HTML the way a client sees it,
 * was never linked from here at all. This opens THAT page, in a new tab so
 * the vendor doesn't lose their place on the lead.
 */
function ContractsBox({ lead, actions = null }) {
  return (
    <div className="ctb-wrap">
      <div className="ctb-head">
        <div className="ctb-title-row">
          <h3 className="ctb-h3">📄 Contract</h3>
          <button
            className="refresh ctb-preview"
            title="Open the contract the client will see, in a new tab"
            onClick={() => window.open(`/contract-preview/${lead.id}`, '_blank')}>
            👁️ Preview
          </button>
        </div>
        {actions && <div className="ctb-actions">{actions}</div>}
      </div>
    </div>
  );
}
// ⏳ human "2d 4h" until offer expiry (or "expired")
function expiryText(startedAt, hours) {
  const end = new Date(startedAt).getTime() + (Number(hours) || 0) * 3600000;
  const ms = end - Date.now();
  if (ms <= 0) return 'expired';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
