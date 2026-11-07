import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../lib/api';

/**
 * 🔁 Plan renewal, at the bottom of Settings → Account (Raj, 2026-11-07; moved from My Services). Off: the plan ends
 * with the period already paid for — no refund; everything keeps working until then. Only shown on a paid plan.
 */
export default function AutoRenewSetting() {
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api.billing().then(b => setSub(b.subscription || null)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!sub) return null;

  async function setRenew(on) {
    setBusy(true); setMsg('');
    try { await api.billingAutoRenew(on); await load(); setMsg(on ? 'Your plan renews automatically.' : 'Your plan ends with this billing period.'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  const when = sub.renews_at ? fmtDateTime(sub.renews_at, { dateOnly: true }) : null;
  return (
    <div className="set-renew">
      <span className="set-renew-label">Plan renewal</span>
      <button type="button" role="switch" aria-checked={!sub.cancels} disabled={busy}
        className={`svx-switch${sub.cancels ? '' : ' is-on'}`} onClick={() => setRenew(!!sub.cancels)}>
        <span className="svx-switch-knob" />
      </button>
      <span className="set-renew-note">{when ? `${sub.cancels ? 'Ends' : 'Renews'} ${when}` : (sub.cancels ? 'Ends with this period' : 'Renews automatically')}</span>
      {msg && <span className="set-renew-note">{msg}</span>}
    </div>
  );
}
