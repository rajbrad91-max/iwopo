/**
 * 📊 Every plan side by side (Raj, 2026-11-07). Rows come from the server's planCompare (lib/planCatalog.js) — the same
 * plans as everywhere else — so the table cannot promise what a plan does not give. Pro, the plan most vendors pick,
 * is softly highlighted. On a phone the table scrolls sideways with the feature names pinned.
 * Used by the pricing page, the Super Admin preview and the vendor's Plans & Upgrades page (2026-11-11), which passes:
 *   ctaFor(p)    → { label, onClick, disabled } for that plan's button, or null for none (the default: Choose <plan>)
 *   currentCode  → the vendor's own plan, marked "Your plan" in place of the Most popular ribbon
 *   showTrial    → false hides the trial line under the buttons (the panel says it once, above the table)
 *   corner       → shown under "Compare plans" in the top-left cell (the panel's Monthly / Yearly switch)
 * and priceOf(p) may add `save`, a line under the price (the public page's yearly saving).
 */
import { fmtMoney } from '../lib/api';
import './plan-table.css';

/**
 * 🌍 A plan's price for the header (2026-11-11): the fixed price where the visitor or vendor is — in their currency, or
 * the regional US-dollar price — else the plan's own USD price. The server decides which (lib/regionalPrice.js);
 * `big` is the whole price as one string ($19, CA$25) — one format everywhere. `sub` is a detail for Super Admin's
 * editor only; clients and vendors are shown the price alone (Raj, 2026-11-11). `text` adds the period, for a line
 * like the sign-up box's.
 */
export function planPriceOf(p, cycle = 'monthly') {
  if (Number(p.price_monthly) === 0) return { big: '$0', unit: '', sub: 'Free forever', note: true, text: 'Free' };
  const annual = cycle === 'annual';
  const unit = annual ? '/yr' : '/mo';
  if (p.local) {
    const big = fmtMoney(annual ? p.local.annual : p.local.monthly, { currency: p.local.currency });
    return { big, unit, note: true, text: `${big}${unit}`,
      sub: p.local.regional ? 'Regional price, in US dollars' : `Fixed price in ${p.local.currency}` };
  }
  const plain = (n) => Number(n).toFixed(2).replace(/\.00$/, '');
  const usd = Number(annual ? p.price_annual : p.price_monthly);
  return { big: `$${plain(usd)}`, unit, text: `$${plain(usd)}${unit}`,
    sub: annual ? `reg. $${plain(p.price_annual_regular || p.price_monthly * 12)}` : null };
}

/**
 * 💰 What paying yearly saves against twelve monthly payments (Raj, 2026-11-12), in the price's own currency — the
 * public pricing page shows it under each price and the biggest one on its Monthly / Annual switch. null when yearly
 * saves nothing (or the plan is free).
 */
export function planSaving(p) {
  const m = Number(p.local ? p.local.monthly : p.price_monthly);
  const a = Number(p.local ? p.local.annual : p.price_annual);
  const amount = Math.round((m * 12 - a) * 100) / 100;
  if (!(m > 0) || !(a > 0) || amount <= 0) return null;
  const money = p.local ? fmtMoney(amount, { currency: p.local.currency }) : `$${amount.toFixed(2).replace(/\.00$/, '')}`;
  return { amount, money, pct: Math.round((amount / (m * 12)) * 100) };
}

const cellView = (v) => (v === true
  ? <span className="pt-yes" aria-label="Included">✓</span>
  : !v ? <span className="pt-no" aria-label="Not included">—</span>
  : <span className="pt-val">{v}</span>);

export default function PlanTable({ plans, groups, notes = [], priceOf, onChoose, open = true, ctaFor, currentCode, showTrial = true, corner }) {
  if (!plans.length) return null;
  return (
    <div className="pt-wrap pt-scope">
      <table className="pt">
        <thead>
          <tr>
            <th scope="col" className="pt-corner">
              <span className="pt-corner-t">Compare plans</span>
              <span className="pt-corner-s">Everything each plan includes, side by side.</span>
              {corner && <div className="pt-corner-x">{corner}</div>}
            </th>
            {plans.map(p => {
              const pr = priceOf(p);
              const pop = p.code === 'pro';
              const mine = p.code === currentCode;
              const cta = ctaFor ? ctaFor(p) : {
                label: !open ? 'Join the waitlist' : Number(p.price_monthly) === 0 ? 'Start free' : `Choose ${p.name}`,
                onClick: () => onChoose(p),
              };
              return (
                <th key={p.code} scope="col" className={`pt-plan${pop ? ' is-pop' : ''}${mine ? ' is-mine' : ''}`}>
                  {mine ? <span className="pt-ribbon pt-mine">Your plan</span> : pop && <span className="pt-ribbon">Most popular</span>}
                  <span className="pt-name">{p.name}</span>
                  <span className="pt-tag">{p.tagline}</span>
                  <span className={`pt-price${pr.save ? '' : ' pt-price-solo'}`}><span className="pt-big">{pr.big}</span><span className="pt-unit">{pr.unit}</span></span>
                  {pr.save && <span className="pt-save">{pr.save}</span>}
                  {/* 🚧 while sign-ups are paused, the table says so too — the server refuses anyway (lib/signups.js) */}
                  {cta && (
                    <button type="button" className={`pt-cta${pop && !cta.disabled ? ' is-solid' : ''}`} onClick={cta.onClick} disabled={cta.disabled}>
                      {cta.label}
                    </button>
                  )}
                  {showTrial && <span className="pt-trial">{p.trial_days > 0 ? `${p.trial_days}-day free trial` : '\u00A0'}</span>}
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
