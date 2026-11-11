import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './regionPrices.css';

/**
 * 🌍 Super Admin → Services & Packages, under the plans table (Raj, 2026-11-11): every territory's fixed prices, the
 * countries it covers, and what iwopo keeps from each plan there — at 95% usage, the floor rather than the average.
 * The "US & other countries" row is the plans table above; the others are plan_region_prices. Data:
 * GET /api/admin/plan-regions (lib/planEconomics.js). Each plan's column carries its own light tint, top to bottom,
 * so a plan stays recognisable while scrolling (Raj, 2026-11-11).
 */
const countryName = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return (code) => { try { return names.of(code); } catch { return code; } };
})();
const price = (sym, v) => (v == null ? '—' : `${sym}${Number(v).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 })}`);   // $7.50, not $7.5
const usd = (v) => (v == null ? '—' : `$${v.toFixed(2)}`);
const tone = (m) => (m >= 0.25 ? 'is-good' : m >= 0.10 ? 'is-ok' : 'is-low');
const band = (code) => `rp-band-${code}`;   // 🎨 the plan's column tint (regionPrices.css)

function Countries({ list }) {
  if (!list.length) return <span className="rp-muted">The US and every country not in another row</span>;
  const all = list.map(countryName).join(', ');
  if (list.length <= 3) return <span>{all}</span>;
  return (
    <details className="rp-countries">
      <summary>{list.length} countries</summary>
      <span>{all}</span>
    </details>
  );
}

export default function RegionPricesTable({ rev }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [cycle, setCycle] = useState('monthly');   // whose profit to show: monthly or yearly billing
  useEffect(() => { api.adminPlanRegions().then(setData).catch(e => setErr(e.message)); }, [rev]);

  if (err) return <div className="rp-err">⚠️ {err}</div>;
  if (!data) return <div className="rp-muted">Loading prices by country…</div>;
  const plans = data.regions[0]?.plans || [];
  const c = data.costs;

  return (
    <>
      <div className="sa-section-title rp-title">Prices by country &amp; region 🌍</div>
      <p className="rp-help">
        Fixed prices in each territory&apos;s own currency — they do not move with exchange rates. Yearly: Essential and Pro
        pay 10 months, Studio pays 11. Shown before tax. The first row is the pricing table above.
      </p>
      <div className="rp-wrap">
        <table className="rp">
          <thead>
            <tr>
              <th rowSpan={2}>Territory</th>
              <th rowSpan={2}>Countries</th>
              {plans.map(p => <th key={p.code} colSpan={2} className={`rp-plan ${band(p.code)}`}>{p.name}</th>)}
            </tr>
            <tr>{plans.map(p => [<th key={`${p.code}m`} className={band(p.code)}>Monthly</th>, <th key={`${p.code}y`} className={band(p.code)}>Yearly</th>])}</tr>
          </thead>
          <tbody>
            {data.regions.map(r => (
              <tr key={r.code}>
                <td className="rp-region"><b>{r.name}</b><span className="rp-muted">{r.currency}{r.code === 'USD-R' ? ' · regional' : ''}</span></td>
                <td className="rp-list"><Countries list={r.countries} /></td>
                {r.plans.map(p => [
                  <td key={`${p.code}m`} className={`rp-num ${band(p.code)}`}>{price(r.symbol, p.monthly)}{r.currency !== 'USD' && <span className="rp-muted">≈ {usd(p.usd_monthly)}</span>}</td>,
                  <td key={`${p.code}y`} className={`rp-num ${band(p.code)}`}>{price(r.symbol, p.annual)}</td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sa-section-title rp-title">Add-on prices by country &amp; region 🧩</div>
      <p className="rp-help">Fixed in each territory&apos;s currency, a month. Yearly: 10 months; storage 12 (it costs iwopo every month). Shown before tax.</p>
      <div className="rp-wrap">
        <table className="rp">
          <thead>
            <tr><th>Territory</th>{(data.addons || []).map(a => <th key={a.id} className="rp-plan">{a.name}</th>)}</tr>
          </thead>
          <tbody>
            {data.regions.map(r => (
              <tr key={r.code}>
                <td className="rp-region"><b>{r.name}</b><span className="rp-muted">{r.currency}</span></td>
                {(r.addons || []).map(a => (
                  <td key={a.id} className="rp-num">
                    {price(r.symbol, a.monthly)}
                    {a.studio_monthly != null && <span className="rp-muted">Studio {price(r.symbol, a.studio_monthly)}</span>}
                    {r.currency !== 'USD' && a.usd_monthly != null && <span className="rp-muted">≈ {usd(a.usd_monthly)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sa-section-title rp-title">Your profit per subscriber 💰</div>
      <div className="rp-bar">
        <p className="rp-help">What iwopo keeps from one subscriber a month, in USD, after Stripe fees, storage and AI — with every vendor at {Math.round(c.usage * 100)}% of their plan.</p>
        <div className="rp-switch" role="group" aria-label="Billing">
          <button type="button" className={cycle === 'monthly' ? 'is-on' : ''} onClick={() => setCycle('monthly')}>Monthly billing</button>
          <button type="button" className={cycle === 'annual' ? 'is-on' : ''} onClick={() => setCycle('annual')}>Yearly billing</button>
        </div>
      </div>
      <div className="rp-wrap">
        <table className="rp">
          <thead>
            <tr><th>Territory</th>{plans.map(p => <th key={p.code} className={`rp-plan ${band(p.code)}`}>{p.name}</th>)}</tr>
          </thead>
          <tbody>
            {data.regions.map(r => (
              <tr key={r.code}>
                <td className="rp-region"><b>{r.name}</b><span className="rp-muted">{r.currency}</span></td>
                {r.plans.map(p => {
                  const k = p.keep?.[cycle];
                  return (
                    <td key={p.code} className={`rp-num ${band(p.code)}`}>
                      {k ? <><b>{usd(k.profit)}</b><span className={`rp-margin ${tone(k.margin)}`}>{Math.round(k.margin * 100)}%</span></> : <span className="rp-muted">rate unavailable</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rp-note">
        Costs used: storage ${c.r2PerGbMonth}/GB a month (Cloudflare R2) · AI ${c.aiPerReply} a reply × {c.repliesPerChat} replies a chat (Claude Haiku 5.5)
        · Stripe {(c.stripe.pct * 100).toFixed(1)}% + {Math.round(c.stripe.fixed * 100)}¢, Billing {(c.stripe.billing * 100).toFixed(1)}%, Tax {(c.stripe.tax * 100).toFixed(1)}%,
        +{(c.stripe.international * 100).toFixed(1)}% international card and +{(c.stripe.conversion * 100).toFixed(0)}% conversion outside the US · today&apos;s exchange rates.
        Servers and other shared costs are not included. Margin: <span className="rp-margin is-good">25%+</span> <span className="rp-margin is-ok">10–25%</span> <span className="rp-margin is-low">under 10%</span>
      </p>
    </>
  );
}
