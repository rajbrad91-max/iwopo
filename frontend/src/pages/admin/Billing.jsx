/**
 * 💳 Billing: paying sellers, revenue and what is owed.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { money, StatCard } from './common';

export function BillingView({ packages, overview }) {
  const o = overview;
  return (
    <>
      <div className="sa-stats">
        <StatCard label="MRR" value={o ? (money(o.mrr) || '$0') : '—'} trend="What subscribers pay, in US dollars at today's rate" cls="up" />
        <StatCard label="ARR" value={o ? (money(o.arr) || '$0') : '—'} trend="A year of today’s subscriptions" cls="up" />
        <StatCard label="Active Trials" value={o?.trial ?? '—'} trend={o ? `${o.trials_ending_soon} ending within 7 days` : 'Loading…'} cls="warn" />
        <StatCard label="Past Due" value={o?.past_due ?? '—'} trend={o ? `${money(o.owed) || '$0'} owed` : 'Loading…'} cls="neutral" />
      </div>
      <div className="sa-section-title">Revenue by Plan</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Plan</th><th>Sellers on it</th><th>Paying</th><th>MRR</th></tr></thead>
          <tbody>
            {!o ? <tr><td colSpan="4" className="sa-empty">Loading…</td></tr> : o.plans.map(p => (
              <tr key={p.id}>
                <td className="biz">{p.name}</td><td>{p.sellers}</td><td>{p.paying}</td><td>{money(p.mrr) || '$0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sa-section-title">Package Prices</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Package</th><th>Monthly</th><th>Annual</th><th>Trial</th></tr></thead>
          <tbody>
            {packages.map(p => (
              <tr key={p.id}>
                <td className="biz">{p.icon} {p.name}</td>
                <td>{money(p.price_monthly) || '—'}</td>
                <td>{money(p.price_annual) || '—'}</td>
                <td>{p.trial_days}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- SUPPORT ----------
   🎧 The messages vendors send from Help & Support (support_messages — filed here before any email goes). This
   used to list three invented tickets (BeatDrop DJ, Glow by Mona, 360 Spin Co). */
