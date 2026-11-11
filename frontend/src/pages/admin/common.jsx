/**
 * 📊 Shared by the Super Admin screens: the stat card and the money format.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */


export function money(v) { return v == null ? null : `$${Number(v).toFixed(2)}`; }

export function StatCard({ label, value, trend, cls }) {
  return (
    <div className="sa-card">
      <div className="sa-label">{label}</div>
      <div className="sa-value">{value}</div>
      <div className={`sa-trend ${cls}`}>{trend}</div>
    </div>
  );
}
