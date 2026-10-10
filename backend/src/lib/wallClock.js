/**
 * Calendar day as YYYY-MM-DD. A stored date is UTC midnight, so the
 * Y-M-D is the day that was typed — not the server's local day.
 * Real moments (check-in, "today") do not use this.
 */
export function calendarYmd(d) {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * A wedding time the client typed ("16:00"), shown in the vendor's 12h/24h
 * preference. This is not a moment in time — the timezone is not applied.
 * 24h is zero-padded HH:MM. 12h is "2:30 PM", matching the preference buttons.
 */
export function formatWallTime(t, pref = '12h') {
  if (t == null || t === '') return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = Number(m[1]);
  const min = m[2];
  if (!Number.isFinite(h) || h > 23) return String(t);
  if (pref === '24h') return `${String(h).padStart(2, '0')}:${min}`;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}
