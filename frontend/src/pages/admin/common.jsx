/**
 * 📊 Shared by the Super Admin screens: the stat card and the money format.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */


export function money(v) { return v == null ? null : `$${Number(v).toFixed(2)}`; }

/** A square tile: the big number, what it counts, and a line about it. The number shrinks only when it is long
 *  enough to need to ($12,345.67), so it always fits its square (Raj, 2026-11-16 — like the vendor panel's tiles). */
/** An on/off switch — the same one everywhere in Super Admin (replaced the 🟢/⚪ emoji, Raj 2026-11-16). */
export function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label}
      className={`sa-switch ${on ? 'on' : ''}`} onClick={onChange}><span className="sa-switch-knob" /></button>
  );
}

/** A small delete / remove button, worded for what it does (replaced the 🗑️ emoji, Raj 2026-11-16). */
export function DeleteButton({ onClick, children = 'Delete', title }) {
  return <button type="button" className="sa-del-btn" title={title} onClick={onClick}>{children}</button>;
}

export function StatCard({ label, value, trend, cls }) {
  return (
    <div className="sa-card">
      <div className="sa-value" style={{ '--chars': String(value).length }}>{value}</div>
      <div className="sa-label">{label}</div>
      <div className={`sa-trend ${cls}`}>{trend}</div>
    </div>
  );
}
