/**
 * 📊 Super Admin’s dashboard: sellers, revenue, growth, plans, trades and referrers.
 * One screen, nothing to scroll (Raj, 2026-11-16): the tiles sit in the top bar beside the bells (DashboardStats), and
 * the five boxes share the height left under them — two rows of a 3-column grid, the trades spanning two. A list
 * longer than its box scrolls inside it, so nothing is cut. On a phone or a short window the boxes stack as before.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { ResponsiveContainer, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar } from 'recharts';
import { PROFESSIONS } from '../../lib/professions';
import { money, StatCard } from './common';
import { adminPath } from '../../lib/adminRoute';

/** The four tiles — shown in the top bar on the dashboard. Real counts, nothing invented (GET /admin/overview,
 *  lib/billing.js's rules). "Paid" used to be every seller not on a trial — the owner account and expired trials included. */
export function DashboardStats({ vendors, packages, overview, geo }) {
  return (
    <div className="sa-stats">
      <StatCard label="Total Sellers" value={vendors.length} trend={`${geo?.unset ?? 0} without a country set`} cls="up" />
      <StatCard label="Active Trials" value={overview?.trial ?? '—'} trend={overview ? `${overview.trials_ending_soon} ending within 7 days` : 'Loading…'} cls="warn" />
      <StatCard label="Paying Sellers" value={overview?.paying_total ?? '—'} trend={overview ? `${money(overview.mrr) || '$0'} a month` : 'Loading…'} cls="up" />
      <StatCard label="Packages" value={packages.length} trend="Live tiers" cls="up" />
    </div>
  );
}

const TYPE_COLOURS = ['#0d9488', '#4ade80', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c', '#e879f9', '#34d399', '#f87171', '#c084fc', '#94a3b8'];
const PLAN_COLOURS = ['#0d9488', '#60a5fa', '#a78bfa', '#fbbf24', '#4ade80', '#f472b6', '#22d3ee', '#fb923c'];
const cName = (code) => (COUNTRIES.find(c => c.code === code)?.name) || code;

/** A box's bar list: a name, its count, and a bar against the biggest. */
function BarList({ rows, unit }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => (
    <div key={r.key} className="sa-cty-row">
      <div className="sa-cty-info">
        <div className="sa-cty-top"><span>{r.label}</span><span className="cnt">{r.n} {unit}{r.n === 1 ? '' : 's'}</span></div>
        <div className="sa-cty-bar"><div className="sa-cty-fill" style={{ '--pct': `${r.n / max * 100}%` }} /></div>
      </div>
    </div>
  ));
}

export function DashboardView({ overview, geo, go }) {
  /* 📈 new sellers per month and the plans in use come from GET /admin/overview. Both used to be invented — an
     MRR line from $4.1k to $6.4k and a 'Service Performance' of 88% down to 28% — on a platform with six sellers. */
  const growth = overview?.growth || [];
  /* 🌍 Where sellers actually are (the vendors table — it used to be a hardcoded list, Canada 52, US 38, on a platform
     with three sellers), and 🍩 their trades, from the same list the inquiry form and the public page use. */
  const countries = (geo?.countries || []).map(c => ({ key: c.code, label: cName(c.code), n: c.count }));
  const vTypes = [
    ...(geo?.professions || []).map((p, i) => ({ n: PROFESSIONS[p.key]?.label || p.key, v: p.count, c: TYPE_COLOURS[i % TYPE_COLOURS.length] })),
    ...(geo?.professions_unset ? [{ n: 'Not set', v: geo.professions_unset, c: '#7c9199' }] : []),
  ];
  // 📦 sellers on each plan, as they stand
  const planData = (overview?.plans || []).filter(p => p.sellers > 0).map((p, i) => ({ name: p.name, v: p.sellers, c: PLAN_COLOURS[i % PLAN_COLOURS.length] }));
  const onPlans = planData.reduce((a, p) => a + p.v, 0);
  // 🏆 who brought the most sign-ups with their referral code (GET /referrals → board, lib/referrals.js)
  const [refBoard, setRefBoard] = useState(null);
  useEffect(() => { api.referrals().then(d => setRefBoard(d.board)).catch(() => setRefBoard({ referrers: [], totals: { signed_up: 0, paying: 0 } })); }, []);
  const topRefs = (refBoard?.referrers || []).filter(r => r.signed_up > 0).slice(0, 5).map(r => ({ key: r.email, label: r.business_name || r.email, n: r.signed_up }));
  const openReferrals = (e) => {   // a plain click stays in the panel; Ctrl/⌘-click opens a new tab
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); go('referrals');
  };

  return (
    <div className="sa-dash">
      <div className="sa-box">
        <h3>Seller Growth</h3><div className="sa-box-sub">New sellers each month — last 8 months</div>
        <div className="sa-dash-fill">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={growth}>
              <CartesianGrid stroke="#223238" />
              <XAxis dataKey="label" tick={{ fill: '#7c9199', fontSize: 11 }} />
              <YAxis allowDecimals={false} width={30} tick={{ fill: '#7c9199', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a282d', border: '1px solid #223238', borderRadius: 8, color: '#e6f0f2' }} />
              <Bar dataKey="sellers" name="New sellers" fill="#14b8a655" stroke="#14b8a6" radius={[6, 6, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="sa-box">
        <h3>Sellers by Country</h3><div className="sa-box-sub">Where your sellers are based</div>
        <div className="sa-country-list sa-dash-list">
          {countries.length === 0 ? (
            <div className="sa-cty-empty">
              {geo === null ? 'Loading…'
                : geo.total === 0 ? 'No sellers yet.'
                : `No countries recorded yet — ${geo.unset} of ${geo.total} seller${geo.total === 1 ? '' : 's'} haven't set one in their profile.`}
            </div>
          ) : <BarList rows={countries} unit="seller" />}
          {countries.length > 0 && geo?.unset > 0 && (
            <div className="sa-cty-empty">{geo.unset} seller{geo.unset === 1 ? '' : 's'} haven&apos;t set a country.</div>
          )}
        </div>
      </div>

      <div className="sa-box">
        <h3>Top Referrers</h3>
        <div className="sa-box-sub">{refBoard ? `${refBoard.totals.signed_up} sign-up${refBoard.totals.signed_up === 1 ? '' : 's'} from referral codes · ${refBoard.totals.paying} paying` : 'Sign-ups from each vendor’s referral code'}</div>
        <div className="sa-country-list sa-dash-list">
          {!refBoard ? <div className="sa-cty-empty">Loading…</div>
            : topRefs.length === 0 ? <div className="sa-cty-empty">No referrals yet.</div>
            : <BarList rows={topRefs} unit="client" />}
        </div>
        <a className="sa-box-link" href={adminPath('referrals')} onClick={openReferrals}>See all referrals →</a>
      </div>

      <div className="sa-box">
        <h3>Plans in Use</h3><div className="sa-box-sub">Sellers on each plan</div>
        {planData.length === 0 ? <div className="sa-cty-empty">{overview ? 'No seller is on a plan yet.' : 'Loading…'}</div> : (
          <div className="sa-plan-body sa-dash-fill">
            <ResponsiveContainer width="45%" height="100%">
              <PieChart>
                <Pie data={planData} dataKey="v" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                  {planData.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="sa-adopt">
              {planData.map((s, i) => (
                <div key={i}>
                  <div className="sa-ad-top"><span>{s.name}</span><span className="cnt">{s.v} seller{s.v === 1 ? '' : 's'}</span></div>
                  <div className="sa-ad-bar"><div className="sa-ad-fill" style={{ '--pct': `${s.v / onPlans * 100}%`, '--tone': s.c }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sa-box sa-dash-types">
        <h3>Vendors by Type</h3><div className="sa-box-sub">Vendors per profession</div>
        {/* every trade has a row: the list sits in columns beside the donut and scrolls inside the box if it outgrows it */}
        <div className="sa-type-box sa-dash-fill">
          <div className="sa-type-pie">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={vTypes} dataKey="v" nameKey="n" innerRadius="56%" outerRadius="92%" paddingAngle={2}>
                  {vTypes.map((d, i) => <Cell key={i} fill={d.c} stroke="var(--panel)" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="sa-legend sa-legend-cols sa-dash-list">
            {vTypes.map((t, i) => (
              <div key={i} className="sa-legend-item">
                <span className="sa-legend-dot" style={{ '--tone': t.c }} />{t.n}
                <span className="sa-legend-val">{t.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
