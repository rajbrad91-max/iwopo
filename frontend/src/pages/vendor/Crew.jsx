/**
 * 👷 Crew Management: the team, their shoots and pay.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import { phoneChars } from '../../lib/phone';
import { useDialog } from '../../lib/dialog.jsx';
import { api, fmtTime, fmtEventDate } from '../../lib/api';
import CameraFtpBox from '../../components/CameraFtpBox';

export function CrewView({ rawsel = false }) {
  const [ftpFor, setFtpFor] = useState(null);   // 📡 the crew member whose camera FTP login is open
  const dialog = useDialog();
  const [tab, setTab] = useState('upcoming'); // upcoming | past | team
  const [crew, setCrew] = useState([]);
  const [f, setF] = useState({ name: '', role: '', phone: '', email: '' });
  const [msg, setMsg] = useState('');
  const [memberId, setMemberId] = useState('');
  const [period, setPeriod] = useState('week'); // week | biweek | month
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState([]);
  const [periodMeta, setPeriodMeta] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const saving = useRef(false);

  useEffect(() => { api.crew().then(d => setCrew(d.crew || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (tab === 'team') return;
    setLoading(true);
    const q = { view: tab, period };
    if (memberId) q.member_id = memberId;
    api.crewSchedule(q)
      .then(d => {
        setRows(d.assignments || []);
        setTotals(d.totals || []);
        setPeriodMeta({ from: d.period_from || '', to: d.period_to || '' });
      })
      .catch(() => { setRows([]); setTotals([]); })
      .finally(() => setLoading(false));
  }, [tab, memberId, period]);

  function flash(m) { setNote(m); setTimeout(() => setNote(''), 2500); }

  function startEdit(c) {
    setEditId(c.id);
    setF({ name: c.name || '', role: c.role || '', phone: c.phone || '', email: c.email || '' });
    setAdding(true);
    setMsg('');
  }

  async function add() {
    // Set before any await. A second click otherwise fires another save
    // before React disables the button.
    if (saving.current) return;
    const name = f.name.trim();
    if (!name) return setMsg('⚠️ Name required');
    saving.current = true;
    setMsg('');
    const wasEdit = editId;
    try {
      const body = {
        name,
        role: f.role.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
      };
      if (wasEdit) await api.updateCrew(wasEdit, body);
      else await api.addCrew(body);
      setF({ name: '', role: '', phone: '', email: '' });
      setAdding(false);
      setEditId(null);
      setMsg(wasEdit ? '✅ Saved' : '✅ Added'); setTimeout(() => setMsg(''), 1500);
      const d = await api.crew(); setCrew(d.crew || []);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { saving.current = false; }
  }

  function cancelAdd() {
    setAdding(false);
    setEditId(null);
    setF({ name: '', role: '', phone: '', email: '' });
    setMsg('');
  }

  async function del(id) {
    if (!await dialog.confirm('They will be removed from your crew list.', { title: 'Remove crew member?', okLabel: 'Remove' })) return;
    try { await api.deleteCrew(id); setCrew(c => c.filter(x => x.id !== id)); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  function checkinUrl(token) {
    if (!token) return '';
    return `${window.location.origin}/checkin/${token}`;
  }

  async function copyLink(a) {
    setBusyId(a.id);
    try {
      // mint token + return link only — do not email
      const d = await api.crewRemind(a.id, { send_email: false });
      const token = (d.link && d.link.split('/').pop()) || a.checkin_token;
      const link = checkinUrl(token);
      if (!link) throw new Error('No check-in link');
      if (token && !a.checkin_token) {
        setRows(rs => rs.map(r => r.id === a.id ? { ...r, checkin_token: token } : r));
      }
      try {
        await navigator.clipboard.writeText(link);
        flash('🔗 Check-in link copied');
      } catch {
        await dialog.prompt('Clipboard was blocked. Copy this check-in link:', link, {
          title: 'Check-in link', okLabel: 'Done', readOnly: true,
        });
      }
    } catch (e) { flash('⚠️ ' + (e.message || 'Could not copy')); }
    finally { setBusyId(null); }
  }

  async function emailRemind(a) {
    setBusyId(a.id);
    try {
      const d = await api.crewRemind(a.id, { send_email: true });
      if (d.emailed) flash(`📧 Reminder sent to ${d.email}`);
      else flash('⚠️ ' + (d.error || 'Email not sent — link is still available to copy'));
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setBusyId(null); }
  }

  function attendLabel(a) {
    if (a.checked_out_at) return { t: 'Done', cls: 'is-done' };
    if (a.checked_in_at) return { t: 'Checked in', cls: 'is-in' };
    return { t: 'Awaiting', cls: 'is-wait' };
  }

  function fmtHours(h) {
    if (h == null || Number.isNaN(Number(h))) return '—';
    const n = Number(h);
    return `${n % 1 === 0 ? n : n.toFixed(2)}h`;
  }

  // One section per crew member — jobs stack under them (no repeated name/role)
  const grouped = (() => {
    const map = new Map();
    for (const a of rows) {
      const key = a.member_id ?? `x-${a.id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          member_id: a.member_id,
          member_name: a.member_name || 'Crew',
          member_role: a.member_role || '',
          member_email: a.member_email || '',
          member_phone: a.member_phone || '',
          jobs: [],
        };
        map.set(key, g);
      }
      g.jobs.push(a);
    }
    return [...map.values()].sort((a, b) =>
      String(a.member_name).localeCompare(String(b.member_name)));
  })();

  const periodLbl = { week: 'Weekly', biweek: 'Bi-weekly', month: 'Monthly' };

  return (
    <div className="cr-wrap">
      <div className="cr-tabs">
        <button type="button" className={`cr-tab ${tab === 'upcoming' ? 'is-on' : ''}`} onClick={() => setTab('upcoming')} title="Jobs coming up">📅 Upcoming</button>
        <button type="button" className={`cr-tab ${tab === 'past' ? 'is-on' : ''}`} onClick={() => setTab('past')} title="Finished jobs and hours">🏁 Past</button>
        <button type="button" className={`cr-tab ${tab === 'team' ? 'is-on' : ''}`} onClick={() => setTab('team')} title="Add and manage your team">👷 Team</button>
      </div>

      {note && <div className={`cr-note ${note[0] === '⚠' ? 'is-err' : 'is-ok'}`}>{note}</div>}

      {tab !== 'team' && (
        <div className="cr-filters">
          <label className="cr-filter">
            <span>Crew member</span>
            <select value={memberId} onChange={e => setMemberId(e.target.value)} title="Filter by team member">
              <option value="">Everyone</option>
              {crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {tab === 'past' && (
            <div className="cr-period" title="Hours summary window">
              {['week', 'biweek', 'month'].map(p => (
                <button key={p} type="button" className={`cr-pill ${period === p ? 'is-on' : ''}`} onClick={() => setPeriod(p)}>
                  {periodLbl[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'past' && (
        <div className="cr-totals">
          {totals.length === 0 ? (
            <p className="cr-empty-inline">No logged hours in this {periodLbl[period].toLowerCase()} window{periodMeta.from ? ` (${periodMeta.from} → ${periodMeta.to})` : ''}.</p>
          ) : totals.map(t => (
            <div key={t.member_id} className="cr-total">
              <div className="cr-total-name">{t.member_name}</div>
              <div className="cr-total-hours">{fmtHours(t.hours)}</div>
              <div className="cr-total-jobs">{t.jobs} job{t.jobs === 1 ? '' : 's'} · {periodLbl[period]}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'team' ? (
        <>
          {!adding ? (
            <div className="cr-team-bar">
              <button type="button" className="refresh cr-add-btn" onClick={() => { setAdding(true); setMsg(''); }} title="Open the form to add someone">
                ➕ Add Team Member
              </button>
              {msg && <span className={`cr-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</span>}
            </div>
          ) : (
            <div className="cr-card">
              <div className="cr-card-h">{editId ? '✏️ Edit crew member' : '➕ Add crew member'} {msg && <span className={`cr-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</span>}</div>
              <div className="cr-add-grid">
                <input className="cr-input" placeholder="Name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus />
                <input className="cr-input" placeholder="Role (e.g. 2nd shooter)" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} />
                <input className="cr-input" type="tel" inputMode="tel" placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: phoneChars(e.target.value) })} />
                <input className="cr-input" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
              </div>
              <div className="cr-add-acts">
                <button type="button" className="refresh cr-add-btn" onClick={add} title={editId ? 'Save changes to this person' : 'Save this person to your team'}>{editId ? 'Save' : '+ Add to team'}</button>
                <button type="button" className="refresh cr-cancel-btn" onClick={cancelAdd} title="Close without saving">Cancel</button>
              </div>
            </div>
          )}
          <div className="cr-card cr-card-table">
            <table className="cr-table">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th></th></tr></thead>
              <tbody>
                {crew.length === 0 ? (
                  <tr><td colSpan="5" className="empty">No crew yet. Add your team above, then assign them on a booking.</td></tr>
                ) : crew.map(c => (
                  <tr key={c.id}>
                    <td className="biz">{c.name}</td>
                    <td className="cr-role">{c.role || '—'}</td>
                    <td className="cr-phone">{c.phone || '—'}</td>
                    <td className="cr-email">{c.email || '—'}</td>
                    <td className="cr-acts">
                      {rawsel && <button type="button" className={`cr-icon-btn${c.has_ftp ? ' is-on' : ''}`} onClick={() => setFtpFor(c)} title="Camera FTP login">📡</button>}
                      <button type="button" className="cr-icon-btn" onClick={() => startEdit(c)} title="Edit this person">✏️</button>
                      <button type="button" className="cr-icon-btn" onClick={() => del(c.id)} title="Remove from your team">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <div className="loading">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="cr-card">
          <p className="cr-empty">
            {tab === 'upcoming'
              ? 'No upcoming crew jobs. Assign someone on a booking under Team on the day.'
              : 'No past crew jobs yet.'}
          </p>
        </div>
      ) : (
        <div className="cr-list">
          {grouped.map(g => (
            <section key={g.member_id ?? g.member_name} className="cr-person">
              <header className="cr-person-h">
                <div>
                  <div className="cr-person-name">{g.member_name}</div>
                  <div className="cr-person-sub">
                    {[g.member_role, g.member_phone, g.member_email].filter(Boolean).join(' · ') || `${g.jobs.length} job${g.jobs.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <span className="cr-person-count">{g.jobs.length} job{g.jobs.length === 1 ? '' : 's'}</span>
              </header>
              <div className="cr-person-jobs">
                {g.jobs.map(a => {
                  const att = attendLabel(a);
                  const date = a.event_date ? fmtEventDate(a.event_date) : 'Date TBC';
                  const joinTimes = (from, to) => [from, to].filter(Boolean).map(fmtTime).filter(Boolean).join(' – ');
                  const slot = joinTimes(a.arrive_time, a.leave_time)
                    || joinTimes(a.timing_from, a.timing_to)
                    || 'Time TBC';
                  return (
                    <div key={a.id} className="cr-job">
                      <div className="cr-job-top">
                        <div>
                          <div className="cr-job-client">
                            {a.client_name || '—'}{a.event_type ? ` · ${a.event_type}` : ''}
                            {a.duty ? <span className="cr-job-duty"> · {a.duty}</span> : null}
                          </div>
                        </div>
                        <span className={`cr-badge ${att.cls}`}>{att.t}</span>
                      </div>
                      <div className="cr-job-meta">
                        <span title="Event date">📅 {date}</span>
                        <span title="On-site hours">⏰ {slot}</span>
                        <span title="Location">📍 {a.location || '—'}</span>
                        {tab === 'past' && <span title="Hours for this job">⏱️ {fmtHours(a.hours)}</span>}
                      </div>
                      {tab === 'upcoming' && (
                        <div className="cr-job-acts">
                          <button
                            type="button"
                            className="refresh cr-act"
                            disabled={busyId === a.id}
                            onClick={() => emailRemind(a)}
                            title={g.member_email ? `Email check-in link to ${g.member_email}` : 'Add an email on the Team tab first'}
                          >📧 Email reminder</button>
                          <button
                            type="button"
                            className="refresh cr-act"
                            disabled={busyId === a.id}
                            onClick={() => copyLink(a)}
                            title="Copy the attendance check-in URL"
                          >🔗 Copy reminder URL</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {ftpFor && <CameraFtpBox member={ftpFor} onClose={() => setFtpFor(null)} />}
    </div>
  );
}
