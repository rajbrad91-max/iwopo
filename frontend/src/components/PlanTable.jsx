/**
 * 📊 Every plan side by side (Raj, 2026-11-07). Rows come from the server's planCompare (lib/planCatalog.js) — the same
 * plans as everywhere else — so the table cannot promise what a plan does not give. Pro, the plan most vendors pick,
 * is softly highlighted. On a phone the table scrolls sideways with the feature names pinned.
 */
const cellView = (v) => (v === true
  ? <span className="pt-yes" aria-label="Included">✓</span>
  : !v ? <span className="pt-no" aria-label="Not included">—</span>
  : <span className="pt-val">{v}</span>);

export default function PlanTable({ plans, groups, priceOf, onChoose }) {
  if (!plans.length) return null;
  return (
    <div className="pt-wrap">
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
                  <span className="pt-name">{p.icon} {p.name}</span>
                  <span className="pt-tag">{p.tagline}</span>
                  <span className="pt-price"><span className="pt-cur">{pr.cur}</span><span className="pt-big">{pr.big}</span><span className="pt-unit">{pr.unit}</span></span>
                  <span className="pt-note">{pr.sub || ' '}</span>
                  <button type="button" className={`pt-cta${pop ? ' is-solid' : ''}`} onClick={() => onChoose(p)}>
                    {Number(p.price_monthly) === 0 ? 'Start free' : `Choose ${p.name}`}
                  </button>
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
                <th scope="row" className="pt-feat">{r.label}{r.coming && <span className="pt-soon">Coming soon</span>}</th>
                {plans.map(p => <td key={p.code} className={p.code === 'pro' ? 'is-pop' : ''}>{cellView(r.cells[p.code])}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
