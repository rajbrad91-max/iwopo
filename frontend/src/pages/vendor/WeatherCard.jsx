/**
 * 🌦️ The small forecast beside the dashboard tiles (Raj, 2026-11-14).
 *
 * Next booked event within 7 days → that one event's forecast (tap to open the booking).
 * Otherwise → today and tomorrow where the vendor is. Nothing to show → nothing drawn.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { svgSet } from '../../lib/svgSet';

const ICONS = svgSet(import.meta.glob('../../assets/weather/*.svg', { query: '?raw', import: 'default', eager: true }));

/** WMO weather code → our icon and a plain word */
function sky(code) {
  if (code == null) return ['cloud', 'Cloudy'];
  if (code <= 1) return ['sun', 'Clear'];
  if (code === 2) return ['part', 'Partly cloudy'];
  if (code === 3) return ['cloud', 'Cloudy'];
  if (code === 45 || code === 48) return ['cloud', 'Fog'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Snow'];
  if (code >= 95) return ['storm', 'Storms'];
  return ['rain', 'Rain'];
}

/** one practical line for the day of a shoot */
function tip(code, rain) {
  const [kind] = sky(code);
  if (kind === 'storm') return 'Storms likely, plan for cover';
  if (kind === 'snow') return 'Snow, allow extra travel time';
  if (rain >= 50) return 'Pack rain covers';
  return '';
}

const Icon = ({ code, big }) => (
  <span className={`wx-ic ${big ? 'is-big' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[sky(code)[0]] || '' }} />
);

const dayLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function WeatherCard({ openBooking }) {
  const [w, setW] = useState(null);
  useEffect(() => { api.weatherDashboard().then(setW).catch(() => setW(null)); }, []);
  if (!w || w.mode === 'none') return null;

  if (w.mode === 'event') {
    const { day } = w;
    const words = day.rain >= 20 ? `${day.rain}% rain` : sky(day.code)[1];
    const note = tip(day.code, day.rain);
    return (
      <button type="button" className="card is-link wx-card" onClick={() => openBooking(w.lead_id)}
        aria-label={`Weather for ${w.event} on ${dayLabel(w.date)}: ${day.max} degrees, ${words}, ${w.place}. Open booking`}>
        <span className="wx-kick">Next event · {dayLabel(w.date)}</span>
        <span className="wx-row">
          <Icon code={day.code} big />
          <span className="wx-now"><b>{day.max}°</b><small>{words} · {w.place}</small></span>
        </span>
        <span className={`wx-note ${note ? 'is-tip' : ''}`}>{note || `${w.name}${w.event ? ` · ${w.event}` : ''}`}</span>
      </button>
    );
  }

  return (
    <div className="card wx-card">
      <span className="wx-kick is-muted">{w.place}</span>
      <span className="wx-two">
        {w.days.map((d, i) => (
          <span key={d.date} className="wx-day">
            <Icon code={d.code} />
            <span><i>{i ? 'Tomorrow' : 'Today'}</i><b>{d.max}°<u>{d.min}°</u></b></span>
          </span>
        ))}
      </span>
    </div>
  );
}
