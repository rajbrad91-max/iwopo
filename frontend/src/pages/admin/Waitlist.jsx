/**
 * 📝 Super Admin → Waitlist (Raj, 2026-11-12): everyone who asked to be told when iwopo opens, newest first, with a
 * switch for the email the owner gets for each new one.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function WaitlistView() {
  const dialog = useDialog();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api.adminWaitlist().then(setD).catch(e => setMsg('⚠️ ' + e.message));
  useEffect(() => { load(); }, []);
  const people = d?.people || [];
  const thisWeek = people.filter(p => Date.now() - new Date(p.created_at).getTime() < WEEK).length;

  async function copyAll() {
    try { await navigator.clipboard.writeText(people.map(p => p.email).join(', ')); setMsg('✅ Copied'); setTimeout(() => setMsg(''), 1500); }
    catch { setMsg('⚠️ Could not copy'); }
  }
  async function setAlerts(on) {
    try { const r = await api.adminWaitlistAlerts(on); setD(x => ({ ...x, alerts: r.alerts })); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function remove(p) {
    if (!await dialog.confirm(`${p.email} will be removed from the waitlist.`, { title: 'Remove from the waitlist?', okLabel: 'Remove' })) return;
    try { await api.adminWaitlistRemove(p.id); load(); } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  return (
    <>
      <div className="sa-section-title">Waitlist{d && <span className="sa-wl-count">{d.total} {d.total === 1 ? 'person' : 'people'} · {thisWeek} this week</span>}</div>
      <div className="sa-wl-bar">
        <label className="sa-wl-alert"><input type="checkbox" checked={!!d?.alerts} disabled={!d} onChange={e => setAlerts(e.target.checked)} /> Email me when someone joins</label>
        <button type="button" className="sa-view-btn" onClick={copyAll} disabled={!people.length}>Copy all emails</button>
        {msg && <span className="sa-hint">{msg}</span>}
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {d === null ? <tr><td colSpan="3" className="sa-empty">Loading…</td></tr>
              : people.length === 0 ? <tr><td colSpan="3" className="sa-empty">Nobody has joined the waitlist yet.</td></tr>
              : people.map(p => (
                <tr key={p.id}>
                  <td className="biz">{p.email}</td>
                  <td>{new Date(p.created_at).toLocaleString()}</td>
                  <td className="sa-wl-act"><button type="button" className="sa-view-btn" onClick={() => remove(p)}>Remove</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
