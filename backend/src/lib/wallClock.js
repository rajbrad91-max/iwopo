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
