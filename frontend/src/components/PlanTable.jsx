/**
 * 📊 Every plan side by side (Raj, 2026-11-07). Rows come from the server's planCompare (lib/planCatalog.js) — the same
 * plans as everywhere else — so the table cannot promise what a plan does not give. Pro, the plan most vendors pick,
 * is softly highlighted. On a phone the table scrolls sideways with the feature names pinned.
 */
import { fmtMoney } from '../lib/api';
import './plan-table.css';

/** 🌍 A plan's price for the header: the visitor's own currency first (≈), the USD it is set in as the note. */
export function planPriceOf(p, cycle = 'monthly') {
  if (Number(p.price_monthly) === 0) return { cur: '$', big: '0', unit: '', sub: 'Free forever', note: true };
  const annual = cycle === 'annual';
  const usd = Number(annual ? p.price_annual : p.price_monthly);
  const plain = (n) => Number(n).toFixed(2).replace(/\.00$/, '');
  const unit = annual ? '/yr' : '/mo';
  if (p.local) {
    return { cur: '≈', big: fmtMoney(annual ? p.local.annual : p.local.monthly, { currency: p.local.currency }), unit,
      sub: `US$${plain(usd)} · exact amount in your currency at checkout`, note: true };
  }
  return { cur: '$', big: plain(usd), unit, sub: annual ? `reg. $${plain(p.price_annual_regular || p.price_monthly * 12)}` : null };
}

const cellView = (v) => (v === true
  ? <span className="pt-yes" aria-label="Included">✓</span>
  : !v ? <span className="pt-no" aria-label="Not included">—</span>
  : <span className="pt-val">{v}</span>);

export default function PlanTable({ plans, groups, notes = [], priceOf, onChoose, open = true }) {
  if (!plans.length) return null;
  return (
    <div className="pt-wrap pt-scope">
      <table className="pt">
        <thead>
          <tr>
            <th scope="col" className="pt-corner">
              <span className="pt-corner-t">Compare plans</span>
              <span className="pt-corner-s">Everything each plan includes, side by side.</span>
            </th>
            {plans.map(p => {
              const pr = priceOf(p);
              const pop = p.code === 'pro';
              return (
                <th key={p.code} scope="col" className={`pt-plan${pop ? ' is-pop' : ''}`}>
                  {pop && <span className="pt-ribbon">Most popular</span>}
                  <span className="pt-name">{p.name}</span>
                  <span className="pt-tag">{p.tagline}</span>
                  <span className="pt-price"><span className="pt-cur">{pr.cur}</span><span className="pt-big">{pr.big}</span><span className="pt-unit">{pr.unit}</span></span>
                  <span className="pt-note">{pr.sub || ' '}</span>
                  {/* 🚧 while sign-ups are paused, the table says so too — the server refuses anyway (lib/signups.js) */}
                  <button type="button" className={`pt-cta${pop ? ' is-solid' : ''}`} onClick={() => onChoose(p)}>
                    {!open ? 'Opening soon' : Number(p.price_monthly) === 0 ? 'Start free' : `Choose ${p.name}`}
                  </button>
                  <span className="pt-trial">{p.trial_days > 0 ? `${p.trial_days}-day free trial` : '\u00A0'}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        {groups.map(g => (
          <tbody key={g.title}>
            <tr className="pt-group"><th scope="rowgroup" colSpan={plans.length + 1}>{g.title}</th></tr>
            {g.rows.map(r => (
              <tr key={r.key}>
                <th scope="row" className="pt-feat">{r.label}{r.star && <span className="pt-star" aria-hidden="true">*</span>}{r.coming && <span className="pt-soon">Coming soon</span>}</th>
                {plans.map(p => <td key={p.code} className={p.code === 'pro' ? 'is-pop' : ''}>{cellView(r.cells[p.code])}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {notes.length > 0 && <div className="pt-notes">{notes.map(n => <p key={n}>{n}</p>)}</div>}
    </div>
  );
}
