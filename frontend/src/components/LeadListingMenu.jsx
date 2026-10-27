import { useEffect, useRef } from 'react';
import './leadListing.css';

/**
 * ⇅ Sort & filter for the Leads list (Raj, 2026-10-26). "Today" is the vendor's own today (their time zone, worked
 * out on the server). The choice is kept in this browser; "Newest first · All time" is the list exactly as before.
 */
export const LEAD_SORT_OPTIONS = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['event', 'Event date (soonest)'], ['name', 'Name A–Z']];
export const LEAD_RANGE_OPTIONS = [['all', 'All time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7days', 'Last 7 days'], ['month', 'This month']];
export const DEFAULT_LISTING = { sort: 'newest', range: 'all' };
export const rangeLabel = (k) => (LEAD_RANGE_OPTIONS.find(([v]) => v === k) || [])[1] || '';

export default function LeadListingMenu({ listing, onChange, onClose, showRanges = true }) {
  const box = useRef(null);
  useEffect(() => {   // a click elsewhere or Escape closes it
    const away = (e) => { if (box.current && !box.current.contains(e.target) && !e.target.closest('.lsm-wrap')) onClose(); };   // the ⇅ button toggles it itself
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  const pick = (k, v) => onChange({ ...listing, [k]: v });
  return (
    <div className="lsm" ref={box} role="menu" aria-label="Sort and filter leads">
      <p className="lsm-h">Sort</p>
      {LEAD_SORT_OPTIONS.map(([v, label]) => (
        <button key={v} type="button" role="menuitemradio" aria-checked={listing.sort === v}
          className={`lsm-opt ${listing.sort === v ? 'is-on' : ''}`} onClick={() => pick('sort', v)}>{listing.sort === v ? '✓ ' : ''}{label}</button>
      ))}
      {showRanges && <>
        <p className="lsm-h">Show leads from</p>
        {LEAD_RANGE_OPTIONS.map(([v, label]) => (
          <button key={v} type="button" role="menuitemradio" aria-checked={listing.range === v}
            className={`lsm-opt ${listing.range === v ? 'is-on' : ''}`} onClick={() => pick('range', v)}>{listing.range === v ? '✓ ' : ''}{label}</button>
        ))}
      </>}
      <button type="button" className="lsm-reset" onClick={() => onChange({ ...DEFAULT_LISTING })}>Reset</button>
    </div>
  );
}
