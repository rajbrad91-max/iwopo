/**
 * 📊 Super Admin’s dashboard: sellers, revenue, growth and plans in use.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { ResponsiveContainer, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar } from 'recharts';
import { PROFESSIONS } from '../../lib/professions';
import { money, StatCard } from './common';

/* ---------- DASHBOARD ---------- */
export function DashboardView({ vendors, packages, overview }) {
  /* 📈 new sellers per month and the plans in use come from GET /admin/overview. Both used to be invented — an
     MRR line from $4.1k to $6.4k and a 'Service Performance' of 88% down to 28% — on a platform with six sellers. */
  const growth = overview?.growth || [];
  // 🌍 Where sellers actually are. This used to be a hardcoded list that read as
  // real — Canada 52, US 38 — on a platform with three sellers. It now comes
  // from the vendors table, and says so plainly when there's nothing to show.
  const [geo, setGeo] = useState(null);
  useEffect(() => { api.adminVendorStats().then(setGeo).catch(() => setGeo({ countries: [], unset: 0, total: 0 })); }, []);
  /* 🍩 Vendors per profession, counted for real. This was a hardcoded list —
     Photographer 61, Editor 14, 360 Booth 9 — on a platform with three
     vendors, and it charted trades that existed nowhere else in the product.
     It now comes from what vendors actually picked, using the same list the
     inquiry form and the public page use. */
  const TYPE_COLOURS = ['#2dd4bf','#4ade80','#60a5fa','#fbbf24','#a78bfa','#f472b6','#22d3ee','#fb923c','#e879f9','#34d399','#f87171','#c084fc','#94a3b8'];
  const vTypes = [
    ...(geo?.professions || []).map((p, i) => ({
      n: `${PROFESSIONS[p.key]?.icon || ''} ${PROFESSIONS[p.key]?.label || p.key}`.trim(),
      v: p.count,
      c: TYPE_COLOURS[i % TYPE_COLOURS.length],
    })),
    ...(geo?.professions_unset ? [{ n: 'Not set', v: geo.professions_unset, c: '#7c9199' }] : []),
  ];
  const cName = (code) => (COUNTRIES.find(c => c.code === code)?.name) || `🌐 ${code}`;
  const countries = (geo?.countries || []).map(c => [cName(c.code), c.count]);
  const maxC = Math.max(1, ...countries.map(c => c[1]));

  // 📦 sellers on each plan, as they stand
  const palette = ['#2dd4bf','#60a5fa','#a78bfa','#fbbf24','#4ade80','#f472b6','#22d3ee','#fb923c'];
  const planData = (overview?.plans || []).filter(p => p.sellers > 0).map((p, i) => ({ name: p.name, v: p.sellers, c: palette[i % palette.length] }));
  const onPlans = planData.reduce((a, p) => a + p.v, 0);

  return (
    <>
      <div className="sa-stats">
        {/* Real counts, and nothing invented (GET /admin/overview, lib/billing.js's rules). "Paid" used to be every
            seller not on a trial — the owner account and expired trials included. */}
        <StatCard label="Total Sellers" value={vendors.length} trend={`${geo?.unset ?? 0} without a country set`} cls="up" />
        <StatCard label="Active Trials" value={overview?.trial ?? '—'} trend={overview ? `${overview.trials_ending_soon} ending within 7 days` : 'Loading…'} cls="warn" />
        <StatCard label="Paying Sellers" value={overview?.paying_total ?? '—'} trend={overview ? `${money(overview.mrr) || '$0'} a month` : 'Loading…'} cls="up" />
        <StatCard label="Packages" value={packages.length} trend="Live tiers" cls="up" />
      </div>

      <div className="sa-grid-2">
        <div className="sa-box">
          <h3>📈 Seller Growth</h3><div className="sa-box-sub">New sellers each month — last 8 months</div>
          <div className="u-height-220px">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growth}>
                <CartesianGrid stroke="#223238" />
                <XAxis dataKey="label" tick={{ fill: '#7c9199', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#7c9199', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a282d', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
                <Bar dataKey="sellers" name="New sellers" fill="#14b8a655" stroke="#14b8a6" radius={[6,6,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sa-box">
          <h3>🌍 Sellers by Country</h3><div className="sa-box-sub">Where your sellers are based</div>
          <div className="sa-country-list">
            {countries.length === 0 ? (
              <div className="sa-cty-empty">
                {geo === null ? 'Loading…'
                  : geo.total === 0 ? 'No sellers yet.'
                  : `No countries recorded yet — ${geo.unset} of ${geo.total} seller${geo.total === 1 ? '' : 's'} haven't set one in their profile.`}
              </div>
            ) : countries.map(c => (
              <div key={c[0]} className="sa-cty-row">
                <div className="sa-cty-info">
                  <div className="sa-cty-top"><span>{c[0]}</span><span className="cnt">{c[1]} seller{c[1] === 1 ? '' : 's'}</span></div>
                  <div className="sa-cty-bar"><div className="sa-cty-fill" style={{ width: `${c[1] / maxC * 100}%` }} /></div>
                </div>
              </div>
            ))}
            {countries.length > 0 && geo?.unset > 0 && (
              <div className="sa-cty-empty">{geo.unset} seller{geo.unset === 1 ? '' : 's'} haven&apos;t set a country.</div>
            )}
          </div>
        </div>
      </div>

      <div className="sa-grid-2eq">
        <div className="sa-box">
          <h3>📦 Plans in Use</h3><div className="sa-box-sub">Sellers on each plan</div>
          {planData.length === 0 ? <div className="sa-cty-empty">{overview ? 'No seller is on a plan yet.' : 'Loading…'}</div> : (
          <div className="u-min-height-180px u-display-flex u-align-items-center">
            <ResponsiveContainer width="50%" height={210}>
              <PieChart>
                <Pie data={planData} dataKey="v" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {planData.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="sa-adopt">
              {planData.map((s, i) => (
                <div key={i}>
                  <div className="sa-ad-top"><span>{s.name}</span><span className="cnt">{s.v} seller{s.v === 1 ? '' : 's'}</span></div>
                  <div className="sa-ad-bar"><div className="sa-ad-fill" style={{ width: `${s.v / onPlans * 100}%`, background: s.c }} /></div>
                </div>
              ))}
            </div>
          </div>)}
        </div>

        <div className="sa-box">
          <h3>🍩 Vendors by Type</h3><div className="sa-box-sub">Vendors per profession</div>
          {/* 🍩 the box grows with its list — every trade now has a row, and a fixed 180px pushed "Not set" out of the card
             (Raj, 2026-11-05); the list sits in two columns beside a fixed-size donut */}
          <div className="sa-type-box">
            <div className="sa-type-pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vTypes} dataKey="v" nameKey="n" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {vTypes.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="sa-legend sa-legend-cols">
              {vTypes.map((t, i) => (
                <div key={i} className="sa-legend-item">
                  <span className="sa-legend-dot" style={{ background: t.c }} />{t.n}
                  <span className="sa-legend-val">{t.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
