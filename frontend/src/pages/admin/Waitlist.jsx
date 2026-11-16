/**
 * 📝 Super Admin → Waitlist (Raj, 2026-11-12): everyone who asked to be told when iwopo opens, newest first, with a
 * switch for the email the owner gets for each new one. Opening (2026-11-16): the sign-ups switch, inviting the people
 * who have waited longest a batch at a time, and where each person is now.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const day = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const STATUS = {
  waiting: () => <span className="sa-badge idle">Waiting</span>,
  invited: (p) => <span className="sa-badge trial">Invited {day(p.invited_at)}</span>,
  joined: () => <span className="sa-badge trial">Signed up</span>,
  plan: () => <span className="sa-badge active">On a plan</span>,
};

export function WaitlistView() {
  const dialog = useDialog();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const [batch, setBatch] = useState(20);
  const [busy, setBusy] = useState(false);
  const load = () => api.adminWaitlist().then(setD).catch(e => setMsg('⚠️ ' + e.message));
  useEffect(() => { load(); }, []);
  const people = d?.people || [];
  const thisWeek = people.filter(p => Date.now() - new Date(p.created_at).getTime() < WEEK).length;
  const waiting = people.filter(p => p.status === 'waiting').length;

  async function copyAll() {
    try { await navigator.clipboard.writeText(people.map(p => p.email).join(', ')); setMsg('✅ Copied'); setTimeout(() => setMsg(''), 1500); }
    catch { setMsg('⚠️ Could not copy'); }
  }
  async function setAlerts(on) {
    try { const r = await api.adminWaitlistAlerts(on); setD(x => ({ ...x, alerts: r.alerts })); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function setSignups(open) {
    const ask = open
      ? { text: 'Anyone will be able to create an account on iwopo.com.', title: 'Open sign-ups?', okLabel: 'Open sign-ups' }
      : { text: 'New accounts can no longer be made. Visitors can join the waitlist instead.', title: 'Pause sign-ups?', okLabel: 'Pause sign-ups' };
    if (!await dialog.confirm(ask.text, { title: ask.title, okLabel: ask.okLabel })) return;
    try { const r = await api.adminSignups(open); setD(x => ({ ...x, signups_open: r.signups_open })); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function invite() {
    const n = Math.min(Number(batch) || 0, waiting);
    if (!n) return;
    if (!await dialog.confirm(`The ${n} ${n === 1 ? 'person' : 'people'} who have waited longest will be emailed a sign-up link, with their extra free month. Each person is only ever invited once.`, { title: `Invite ${n}?`, okLabel: 'Send invites' })) return;
    setBusy(true);
    try { const r = await api.adminWaitlistInvite(n); setMsg(`✅ ${r.sent} invited${r.failed ? ` · ${r.failed} could not be sent` : ''} · ${r.waiting} still waiting`); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function remove(p) {
    if (!await dialog.confirm(`${p.email} will be removed from the waitlist.`, { title: 'Remove from the waitlist?', okLabel: 'Remove' })) return;
    try { await api.adminWaitlistRemove(p.id); load(); } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  return (
    <>
      <div className="sa-section-title">Waitlist{d && <span className="sa-wl-count">{d.total} {d.total === 1 ? 'person' : 'people'} · {thisWeek} this week</span>}</div>
      <div className="sa-wl-bar">
        <label className="sa-wl-alert"><input type="checkbox" checked={!!d?.signups_open} disabled={!d} onChange={e => setSignups(e.target.checked)} /> Sign-ups open on iwopo.com</label>
        <span className="sa-wl-invite">Invite the next
          <input className="sa-set-input sa-wl-num" type="number" min="1" max="200" value={batch} onChange={e => setBatch(e.target.value)} aria-label="How many to invite" />
          <button type="button" className="sa-view-btn" onClick={invite} disabled={!d?.signups_open || !waiting || busy}
            title={d && !d.signups_open ? 'Open sign-ups first' : undefined}>{busy ? 'Sending…' : 'Send invites'}</button>
        </span>
        <label className="sa-wl-alert"><input type="checkbox" checked={!!d?.alerts} disabled={!d} onChange={e => setAlerts(e.target.checked)} /> Email me when someone joins</label>
        <button type="button" className="sa-view-btn" onClick={copyAll} disabled={!people.length}>Copy all emails</button>
        {msg && <span className="sa-hint">{msg}</span>}
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Joined</th><th>Now</th><th></th></tr></thead>
          <tbody>
            {d === null ? <tr><td colSpan="4" className="sa-empty">Loading…</td></tr>
              : people.length === 0 ? <tr><td colSpan="4" className="sa-empty">Nobody has joined the waitlist yet.</td></tr>
              : people.map(p => (
                <tr key={p.id}>
                  <td className="biz">{p.email}</td>
                  <td>{new Date(p.created_at).toLocaleString()}</td>
                  <td>{STATUS[p.status](p)}</td>
                  <td className="sa-wl-act"><button type="button" className="sa-view-btn" onClick={() => remove(p)}>Remove</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
