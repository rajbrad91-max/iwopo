/**
 * 📅 Bookings: the list, the calendar view, and a booking’s detail.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { EmailCopyButton } from './EmailCopyButton';   // 📧 the signed contract to the client
import { useState, useEffect, useRef } from 'react';
import { LeadContact, LeadEvents } from '../../components/LeadOverview';
import LeadEditor from '../../components/LeadEditor';
import { useDialog } from '../../lib/dialog.jsx';
import { api, fmtTime, fmtDateTime, fmtMoney, eventDateValue } from '../../lib/api';
import { CalendarView } from './Calendar';
import { MoneySection } from './MoneySection';

/**
 * 👥 What the crew column says. "Booked" tells a vendor the money is agreed; it
 * says nothing about whether anyone is turning up to shoot the day, which is the
 * thing that actually goes wrong. Read in order: nobody assigned, assigned and
 * waiting, part of the team on site, everyone on site, everyone finished.
 */
function crewStatus(c) {
  const { total = 0, checked_in: inN = 0, checked_out: outN = 0 } = c || {};
  if (!total) return { label: 'Not assigned', cls: 'warn' };   // amber: the one that needs doing
  if (outN >= total) return { label: 'Wrapped', cls: 'active' };
  if (inN >= total) return { label: `All ${total} on site`, cls: 'active' };
  if (inN > 0) return { label: `${inN}/${total} on site`, cls: 'active' };
  return { label: `${total} assigned`, cls: 'trial' };
}

/* the three counters, and what each one picks out when pressed */
const PERIODS = [['month', 'This Month'], ['year', 'This Year'], ['next', 'Next Year']];

export function BookingsView({ routeBooking, onOpenBooking, rawsel = false }) {
  const dialog = useDialog();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('list'); // list | calendar
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState(null);        // a counter pressed: only that period's bookings
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState([]);
  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {}).finally(() => setLoading(false));
  }, [routeBooking]);

  /* 🗑️ The Leads bin (Raj, 2026-11-15), in place of a bin on every row: press it to pick bookings, press it again to
     move the picked ones to History — where Leads → History can restore them, contract and payments included. */
  async function onBinClick() {
    if (!selectMode) { setMode('list'); setSelectMode(true); return; }
    if (!checked.length) { setSelectMode(false); return; }
    const n = checked.length;
    if (!await dialog.confirm('Their contracts and payments stay with them, and you can restore them any time from Leads → History.',
      { title: `Move ${n} booking${n === 1 ? '' : 's'} to History?`, okLabel: 'Move to History', danger: false })) return;
    try {
      await api.bulkArchive(checked);
      setBookings(bs => bs.filter(b => !checked.includes(b.id)));   // the rows go at once
      setChecked([]); setSelectMode(false);
    } catch (err) { dialog.alert(err.message, { error: true }); }
  }
  const toggleCheck = (id) => setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  if (loading) return <div className="loading">Loading…</div>;

  // a booking opens as its own page, not the lead editor — the sale is done, so
  // the details are shown rather than offered up for editing
  if (routeBooking) return <BookingDetail key={routeBooking} id={routeBooking} rawsel={rawsel} />;   // Bookings in the sidebar goes back

  const now = new Date();
  const IN = {
    month: d => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(),
    year: d => d.getFullYear() === now.getFullYear(),
    next: d => d.getFullYear() === now.getFullYear() + 1,
  };
  const inPeriod = (b, p) => { const d = eventDateValue(b.event_date); return !!d && IN[p](d); };
  const countIn = (p) => bookings.filter(b => inPeriod(b, p)).length;

  // 🔢 Booking number, counting down the table so the top row is #1 — matching
  // the order the rows are actually rendered in. Built from the full list, not
  // the filtered rows, so searching never renumbers what's left.
  const bkSeq = new Map(bookings.map((b, i) => [b.id, i + 1]));
  const seqOf = (id) => bkSeq.get(id) ?? '—';

  // 🔍 search across client, event, date, location, phone, email
  const term = q.trim().toLowerCase();
  const match = (b) => !term || [b.name, b.event_type, b.event_date, b.location, b.phone, b.email]
    .some(v => v && String(v).toLowerCase().includes(term));
  const shown = bookings.filter(b => match(b) && (!period || inPeriod(b, period)));
  const allShown = shown.length > 0 && shown.every(b => checked.includes(b.id));
  const someShown = !allShown && shown.some(b => checked.includes(b.id));
  const selectAllBox = (
    <input type="checkbox" className="lead-check-all" checked={allShown}
      onChange={() => setChecked(c => (allShown ? c.filter(id => !shown.some(b => b.id === id)) : [...new Set([...c, ...shown.map(b => b.id)])]))}
      ref={el => { if (el) el.indeterminate = someShown; }} aria-label={`Select all ${shown.length} bookings shown`} />
  );

  return (
    <div>
      <div className="bk-topbar">
        {/* like the Leads tiles: they rise, and pressing one shows only that period (again: everything) */}
        <div className="bk-stats">
          {PERIODS.map(([p, label]) => (
            <button key={p} type="button" className={`bk-stat ${period === p ? 'is-on' : ''}`} aria-pressed={period === p}
              onClick={() => { setPeriod(x => (x === p ? null : p)); setMode('list'); }}>
              <span className="bk-stat-val">{countIn(p)}</span><span className="bk-stat-lbl">{label}</span>
            </button>
          ))}
        </div>
        {/* search · List | Calendar · the bin — the same buttons as Leads */}
        <div className="bk-tools">
          <button type="button" className={`lead-ic-btn ${showSearch ? 'is-on' : ''}`} onClick={() => { setShowSearch(s => !s); if (showSearch) setQ(''); }}
            title="Search bookings" aria-label="Search bookings">🔍</button>
          <div className="bk-toggle" role="group" aria-label="Show bookings as">
            <button type="button" className={`bk-tog-btn ${mode === 'list' ? 'is-on' : ''}`} onClick={() => setMode('list')} title="List"><span className="bk-tog-ic">☰</span><span className="bk-tog-txt"> List</span></button>
            <button type="button" className={`bk-tog-btn ${mode === 'calendar' ? 'is-on' : ''}`} onClick={() => { setMode('calendar'); setSelectMode(false); setChecked([]); }} title="Calendar">🗓️<span className="bk-tog-txt"> Calendar</span></button>
          </div>
          <button type="button" className={`lead-ic-btn lead-ic-del ${selectMode ? 'is-on' : ''}`} onClick={onBinClick}
            title={selectMode ? (checked.length ? `Move ${checked.length} to History` : 'Cancel select') : 'Select to move to History'}>
            {selectMode && checked.length ? `🗑️ ${checked.length}` : '🗑️'}
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="bk-search">
          <input className="gal-input" placeholder="Search bookings — client, event, date, location…"
            value={q} onChange={e => setQ(e.target.value)} autoFocus />
          {term && <span className="bk-search-count">{shown.length} match{shown.length === 1 ? '' : 'es'}</span>}
        </div>
      )}

      {mode === 'calendar' ? <CalendarView onOpen={(l) => onOpenBooking(l.id)} filter={term} /> : (<>
        {selectMode && shown.length > 0 && <label className="lead-selall-bar">{selectAllBox} Select all {shown.length}</label>}
        <div className="table-wrap">
          <table className="bk-table">
            <thead><tr>{selectMode && <th className="col-check">{shown.length > 0 && selectAllBox}</th>}<th className="col-num">#</th><th>Client</th><th>Event</th><th>Date</th><th>Timing</th><th>Crew Status</th><th>Status</th></tr></thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={selectMode ? 8 : 7} className="empty">{term || period ? 'No bookings match' : "No bookings yet. Set a lead's status to booked."}</td></tr>
              ) : shown.map(b => {
                const cs = crewStatus(b.crew);
                return (
                <tr key={b.id} className="row-clickable" onClick={() => (selectMode ? toggleCheck(b.id) : onOpenBooking(b.id))}>
                  {selectMode && (
                    <td className="cell-check"><input type="checkbox" readOnly checked={checked.includes(b.id)} className="lead-check" aria-label={`Select ${b.name}`} /></td>
                  )}
                  <td className="col-num" data-label="#">{seqOf(b.id)}</td>
                  <td className="biz">{b.name}</td>
                  <td className="bk-ev">{b.event_type}</td>
                  <td className="bk-nw bk-date">{b.event_date ? String(b.event_date).slice(0, 10) : '—'}</td>
                  {/* the hours they've booked you for — what a vendor checks
                      when planning a day, rather than the money */}
                  <td className="bk-nw bk-time">{b.timing_from ? `${fmtTime(b.timing_from)} – ${b.timing_to ? fmtTime(b.timing_to) : '?'}` : '—'}</td>
                  <td className="bk-crew" data-label="Crew Status"><span className={`badge is-dot ${cs.cls}`}>{cs.label}</span></td>
                  <td className="bk-st"><span className="badge is-dot active">Booked</span></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

/**
 * 📋 A confirmed booking, as its own page.
 *
 * Clicking a booking used to reopen the lead editor, which is the wrong tool at
 * this point: the sale is agreed, so nothing here should be editable by accident.
 * The details are read-only, the packages show what was offered with the chosen
 * one marked, and the only things you can change are the ones that genuinely
 * move after a booking — money in, and who is working the day.
 */
function BookingDetail({ id, rawsel = false }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [edit, setEdit] = useState(false);   // ✏️ Edit Details open   // 🧾 the vendor's inquiry form — which questions this client was asked
  const [assign, setAssign] = useState({ crew_member_id: '', duty: '', arrive_time: '', leave_time: '' });
  const assignLock = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [id]);
  async function load() {
    try {
      const data = await api.booking(id);
      setD(data);
      if (!cfg) api.myInquirySettings(data.booking?.vendor_id).then(x => setCfg(x.settings)).catch(() => setCfg({}));
    } catch (e) { setErr(e.message); }
  }
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2000); }

  async function addCrew() {
    if (assignLock.current) return;
    if (!assign.crew_member_id) return flash('⚠️ Pick a team member');
    assignLock.current = true;
    setBusy(true);
    try {
      await api.assignCrew(id, { ...assign, crew_member_id: Number(assign.crew_member_id) });
      setAssign({ crew_member_id: '', duty: '', arrive_time: '', leave_time: '' });
      await load(); flash('✅ Assigned');
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { assignLock.current = false; setBusy(false); }
  }
  /* 📸 Raw Selector (private): this person uploads the booking's photos at /photographer — or, off, the vendor does */
  async function setUploads(c, uploads) {
    setD(x => ({ ...x, crew: x.crew.map(k => (k.id === c.id ? { ...k, uploads } : k)) }));   // ticked at once; the save follows
    try { await api.crewUploads(c.id, uploads); flash(uploads ? `📤 ${c.name} uploads the photos` : '📤 You upload the photos'); }
    catch (e) { flash(`⚠️ ${e.message}`); load(); }   // not saved: show what is really stored
  }
  async function removeCrew(aid) {
    setBusy(true);
    try { await api.unassignCrew(aid); await load(); flash('🗑️ Unassigned'); }
    catch (e) { flash('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  if (err) return (
    <div className="ld-view">
      <div className="err-banner">⚠️ {err}</div>
    </div>
  );
  if (!d) return <div className="loading">Loading…</div>;
  // ✏️ Edit Details — the same editor as the lead page (components/LeadEditor); the booking reloads after a save
  if (edit) return <LeadEditor lead={d.booking} cfg={cfg} onSaved={load} onClose={(m) => { setEdit(false); if (m) flash(m); }} />;

  const b = d.booking;
  const chosenId = b.package_id;

  return (
    // Same shell as every other detail screen — Leads, Albums, Templates all use
    // this. A booking page that invented its own wrapper, back button and card
    // styling read as a different product bolted on beside the panel.
    <div className="ld-view">
      {msg && <div className={`ld-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{msg}</div>}

      {/* 👤 the contact strip, as on the lead page */}
      <LeadContact lead={b} cfg={cfg} />
      <div className="lead-grid">
        <div className="lead-left">
          {/* ── details, read-only: the deal is agreed, so nothing here is a form ── */}
          {/* 🗂️ the main event, pre-events and notes — exactly as the lead page shows them (components/LeadOverview) */}
          <LeadEvents lead={b} cfg={cfg} onSaved={load} onEdit={() => setEdit(true)} />

          {/* ── packages: everything that was offered, with the chosen one marked ── */}
          {/* 📦 folded until wanted (Raj, 2026-11-05) — the title says how many were offered */}
          <details className="ld-card bd-fold">
            <summary className="ld-card-h">Packages offered{d.packages.length > 0 && <span className="bd-fold-count">{d.packages.length}</span>}</summary>
            {d.packages.length === 0 ? (
              <p className="bd-empty">No packages were sent for this booking.</p>
            ) : (
              <div className="bd-pkgs">
                {d.packages.map(p => {
                  const isChosen = p.id === chosenId || p.is_selected;
                  const inc = Array.isArray(p.inclusions) ? p.inclusions : [];
                  return (
                    <div key={p.id} className={`bd-pkg ${isChosen ? 'is-chosen' : ''}`}>
                      {isChosen && <span className="bd-pkg-tag">Chosen</span>}
                      <h4 className="bd-pkg-name">{p.name}</h4>
                      {/* the column is `price` — this read `base_price`, which
                          doesn't exist on a lead's package, so every one showed
                          $0 while the leads page showed the real figure */}
                      {/* 📦 what this client pays for it — hours and extras in (lib/packageQuote.js, priced by the server) */}
                      <p className="bd-pkg-price">{fmtMoney(p.quote?.total ?? p.price)}</p>
                      {inc.length > 0 && <ul className="bd-inc">{inc.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                      {p.quote && p.quote.extras.length > 0 && (
                        <ul className="bd-inc bd-extras">
                          {p.quote.extras.map(l => <li key={l.id}>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ''} · {fmtMoney(l.amount)}</li>)}
                        </ul>
                      )}
                      {(p.extras || []).some(x => x.mode === 'included') && (
                        <ul className="bd-inc">{p.extras.filter(x => x.mode === 'included').map(x => <li key={x.id}>{x.name}</li>)}</ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </details>
        </div>

        <div className="lead-right">
          {/* Same money controls as the lead page — a booking is the same record */}
          <MoneySection lead={b} />

          {/* ── paperwork: kept indefinitely, downloadable any time. The offer's Secure and Timer controls belong to the
              lead page, before a booking — a booked client has accepted the offer (Raj, 2026-11-05).
              No ld-card wrapper — .lead-right already paints each child as a card. ── */}
          <div className="bd-side">
            <div className="ld-card-h">Documentation</div>
            <div className="bd-docs">
              {d.contract ? (
                <>
                  {/* open, don't download — same as the contracts list */}
                  <a className="bd-doc" href={`/api/contracts/download/${d.contract.token}`} target="_blank" rel="noreferrer">
                    Signed contract — {d.contract.signed_name || 'signed'} {d.contract.signed_at ? `· ${fmtDateTime(d.contract.signed_at, { dateOnly: true })}` : ''}
                  </a>
                  <a className="bd-doc" href={`/api/contracts/certificate/${d.contract.token}/download`} target="_blank" rel="noreferrer">
                    📜 Signing certificate
                  </a>
                  <EmailCopyButton contract={d.contract} className="bd-doc" />
                </>
              ) : <p className="bd-empty">No signed contract on file.</p>}
              {d.invoices.map(i => (
                <a key={i.id} className="bd-doc" href={`/invoice/${i.token}`} target="_blank" rel="noreferrer">
                  Invoice {i.invoice_number} — {fmtMoney(i.total)} · balance {fmtMoney(i.balance)}
                </a>
              ))}
            </div>
            <p className="bd-fine">Open a document and use your browser&apos;s Print to save it as a PDF. Keep your own copy of anything you may need later.</p>
          </div>

          {/* ── crew ── */}
          <div className="bd-side">
            <div className="ld-card-h">👥 Team on the day</div>
            {/* 👥 one card per person: who, what they do, when they're there, how to reach them */}
            {d.crew.length > 0 ? (
              <div className="bd-crew">
                {d.crew.map(c => (
                  <div className="bd-crew-card" key={c.id}>
                    <div className="bd-crew-top">
                      <span className="bd-crew-name">{c.name}</span>
                      {c.checked_in_at && <span className="bd-crew-in">✅ Checked in</span>}
                      <button className="bd-x" onClick={() => removeCrew(c.id)} disabled={busy} title="Unassign this team member from the day">✕</button>
                    </div>
                    {(c.duty || c.member_role) && <div className="bd-crew-line">🎬 {[...new Set([c.duty, c.member_role].filter(Boolean))].join(' · ')}</div>}
                    {rawsel && (
                      <label className="bd-crew-uploads" title="Signs in at /photographer with the email on their card">
                        <input type="checkbox" checked={!!c.uploads} disabled={busy} onChange={e => setUploads(c, e.target.checked)} />
                        📤 Uploads the photos
                      </label>
                    )}
                    {(c.arrive_time || c.leave_time) && (
                      <div className="bd-crew-line">🕐 {[c.arrive_time, c.leave_time].filter(Boolean).map(fmtTime).join(' – ')}</div>
                    )}
                    {c.member_phone && <div className="bd-crew-line">📞 <a href={`tel:${c.member_phone}`}>{c.member_phone}</a></div>}
                  </div>
                ))}
              </div>
            ) : <p className="bd-empty">No one assigned yet.</p>}
            <h4 className="bd-h4">Assign someone</h4>
            {d.roster.length === 0 ? <p className="bd-fine">No team members yet — add them under Crew.</p> : (
              <div className="bd-assign">
                <label className="bd-assign-wide"><span>Team member</span>
                  <select className="bd-input" value={assign.crew_member_id}
                    onChange={e => setAssign(a => ({ ...a, crew_member_id: e.target.value }))}>
                    <option value="" disabled hidden>Choose…</option>
                    {d.roster.map(r => <option key={r.id} value={r.id}>{r.name}{r.role ? ` (${r.role})` : ''}</option>)}
                  </select>
                </label>
                <label className="bd-assign-wide"><span>Duty</span>
                  <input className="bd-input" placeholder="e.g. Lead photographer"
                    value={assign.duty} onChange={e => setAssign(a => ({ ...a, duty: e.target.value }))} />
                </label>
                <label><span>Arrive</span>
                  <input className="bd-input" type="time" value={assign.arrive_time}
                    onChange={e => setAssign(a => ({ ...a, arrive_time: e.target.value }))} />
                </label>
                <label><span>Leave</span>
                  <input className="bd-input" type="time" value={assign.leave_time}
                    onChange={e => setAssign(a => ({ ...a, leave_time: e.target.value }))} />
                </label>
                <button className="refresh bd-assign-wide bd-assign-btn" onClick={addCrew} disabled={busy} title="Assign this team member to the booking">＋ Assign</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
