/**
 * 🧩 A counter tile — the four on Leads and the four on the dashboard (Raj, 2026-11-20): the count and its name at the
 * bottom-left, the tile's own icon large and tilted behind them, fading out toward the count (pages/vendor.css
 * .stat-tile). A real button, so it is reached by keyboard and announces itself to a screen reader; `on` marks the
 * chosen filter on Leads.
 */
import NavIcon from './NavIcon';

export default function StatTile({ icon, value, label, on, onClick, ariaLabel }) {
  return (
    <button type="button" className={`stat-tile${on ? ' is-on' : ''}`} onClick={onClick}
      aria-pressed={on === undefined ? undefined : on} aria-label={ariaLabel}>
      <span className="stat-tile-art" data-icon={icon}><NavIcon name={icon} /></span>
      <span className="stat-tile-val">{value}</span>
      <span className="stat-tile-lbl">{label}</span>
    </button>
  );
}
