import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import './inquiry.css';
import './crewCheckin.css';

const DECLS = [
  { key: 'on_time', label: 'I arrived on time.' },
  { key: 'dressed', label: 'I am dressed appropriately for this assignment.' },
  { key: 'professional', label: 'I will uphold professional conduct for the duration of this job.' },
  { key: 'location_on', label: 'My device location is enabled.' },
];

const MAX_M = 500;

function formatWallTime(t, pref = '12h') {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = Number(m[1]);
  const min = m[2];
  if (pref === '24h') return `${String(h).padStart(2, '0')}:${min}`;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

function formatStampTime(v, pref = '12h') {
  if (!v) return '';
  const s = String(v);
  const raw = s.includes('T') ? s.slice(11, 16) : s;
  return formatWallTime(raw, pref);
}

function resetHint() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'On iPhone: tap AA (or the lock) in the address bar → Website Settings → Location → Allow, then tap the button again.';
  }
  if (/Android/i.test(ua)) {
    return 'On Android Chrome: tap the lock icon in the address bar → Permissions → Location → Allow, then tap the button again.';
  }
  return 'On desktop: click the lock icon left of the URL → Site settings → Location → Allow, then click the button again.';
}

export default function CrewCheckin({ token }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [decls, setDecls] = useState({ on_time: false, dressed: false, professional: false, location_on: false });
  const [geo, setGeo] = useState({
    status: 'idle', // idle | asking | ok | denied | skipped
    lat: null,
    lng: null,
    accuracy: null,
    error: '',
  });
  const [venue, setVenue] = useState(null);
  const [distM, setDistM] = useState(null);
  const [permState, setPermState] = useState('unknown');
  const watchRef = useRef(null);
  const gotFix = useRef(false);

  useEffect(() => {
    api.checkinInfo(token)
      .then(d => {
        setA(d.assignment);
        if (d.venue?.lat != null && d.venue?.lng != null) setVenue(d.venue);
        else if (d.venue_error) setVenue({ error: d.venue_error, precise: false });
      })
      .catch(e => setErr(e.message));
  }, [token]);

  // Observe permission only — never request on load (that burns the Allow popup)
  useEffect(() => {
    let cancelled = false;
    async function readPerm() {
      try {
        if (!navigator.permissions?.query) return;
        const p = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        setPermState(p.state);
        if (p.state === 'denied') {
          setGeo(g => (g.status === 'ok' || g.status === 'skipped' ? g : {
            ...g,
            status: 'denied',
            error: 'Location access was blocked for this site earlier.',
          }));
        }
        p.onchange = () => {
          setPermState(p.state);
          if (p.state === 'granted') {
            setGeo(g => (g.status === 'ok' ? g : {
              status: 'idle', lat: null, lng: null, accuracy: null, error: '',
            }));
          }
        };
      } catch { /* ignore */ }
    }
    readPerm();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const onGeoOk = useCallback((pos) => {
    gotFix.current = true;
    setPermState('granted');
    setGeo({
      status: 'ok',
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      error: '',
    });
    setDecls(d => (d.location_on ? d : { ...d, location_on: true }));
  }, []);

  const onGeoErr = useCallback((e) => {
    if (gotFix.current) return;
    if (e?.code === 1) setPermState('denied');
    setGeo({
      status: 'denied',
      lat: null,
      lng: null,
      accuracy: null,
      error: e?.code === 1
        ? 'Location access was blocked for this site earlier.'
        : e?.code === 3
          ? 'Location timed out. Try again in a clearer signal area.'
          : 'Could not read your location. Try again.',
    });
    setDecls(d => ({ ...d, location_on: false }));
  }, []);

  // User tap → browser Allow / Block popup (when permission is still "prompt")
  const enableLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({
        status: 'denied', lat: null, lng: null, accuracy: null,
        error: 'Location is not available on this device or browser.',
      });
      return;
    }
    setGeo(g => ({ ...g, status: 'asking', error: '' }));
    gotFix.current = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onGeoOk(pos);
        if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = navigator.geolocation.watchPosition(onGeoOk, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 10000,
        });
      },
      onGeoErr,
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  }, [onGeoOk, onGeoErr]);

  function continueWithoutGps() {
    gotFix.current = false;
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setGeo({
      status: 'skipped',
      lat: null,
      lng: null,
      accuracy: null,
      error: '',
    });
    setDecls(d => ({ ...d, location_on: true }));
    setDistM(null);
  }

  useEffect(() => {
    if (geo.status !== 'ok' || venue?.lat == null || venue?.lng == null || !venue?.precise) {
      setDistM(null);
      return;
    }
    setDistM(haversineM(geo.lat, geo.lng, venue.lat, venue.lng));
  }, [geo, venue]);

  function toggle(key) {
    if (key === 'location_on' && geo.status !== 'ok' && geo.status !== 'skipped') return;
    setDecls(d => ({ ...d, [key]: !d[key] }));
  }

  const distanceRequired = geo.status === 'ok' && !!(venue?.precise && venue?.lat != null && venue?.lng != null);
  const nearEnough = !distanceRequired || (distM != null && distM <= MAX_M);
  const locationReady = geo.status === 'ok' || geo.status === 'skipped';
  const allChecked = DECLS.every(d => decls[d.key]);
  const canSubmit = allChecked && locationReady && nearEnough && !busy;

  async function submitAttendance() {
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      const payload = {
        action: 'in',
        declarations: decls,
      };
      if (geo.status === 'ok') {
        payload.lat = geo.lat;
        payload.lng = geo.lng;
        payload.accuracy = geo.accuracy;
      } else {
        payload.location_skipped = true;
      }
      const d = await api.checkinAction(token, payload);
      setA(x => ({ ...x, ...d.assignment }));
    } catch (e) {
      setErr(e.message || 'Attendance could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    setErr('');
    try {
      const d = await api.checkinAction(token, { action: 'out' });
      setA(x => ({ ...x, ...d.assignment }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !a) {
    return (
      <div className="iq-wrap">
        <div className="iq-card ck-card">
          <div className="ck-hd"><h1 className="ck-title">Attendance</h1></div>
          <div className="ck-body"><p className="ck-err">{err}</p></div>
        </div>
      </div>
    );
  }

  if (!a) {
    return (
      <div className="iq-wrap">
        <div className="iq-card ck-card">
          <div className="ck-body"><p className="ck-muted">Loading assignment…</p></div>
        </div>
      </div>
    );
  }

  const alreadyIn = !!a.checked_in_at;
  const alreadyOut = !!a.checked_out_at;
  const pref = a.time_format || '12h';
  const date = a.event_date ? String(a.event_date).slice(0, 10) : 'To be confirmed';
  const start = a.arrive_time || a.timing_from;
  const end = a.leave_time || a.timing_to;
  const slot = [formatWallTime(start, pref), formatWallTime(end, pref)].filter(Boolean).join(' – ')
    || 'To be confirmed';

  let geoMsg = '';
  let geoTone = 'is-wait';
  if (geo.status === 'asking') {
    geoMsg = 'Choose Allow on the browser permission popup.';
  } else if (geo.status === 'skipped') {
    geoMsg = 'Continuing without GPS sharing. Submit only if you are at the event.';
    geoTone = 'is-ok';
  } else if (geo.status === 'denied') {
    geoMsg = geo.error || 'Location access was blocked for this site earlier.';
    geoTone = 'is-bad';
  } else if (geo.status === 'idle') {
    geoMsg = 'Tap the button below — your browser will ask to Allow location.';
  } else if (geo.status === 'ok' && distanceRequired && distM != null && nearEnough) {
    geoMsg = `Location on · about ${Math.round(distM)} m from the venue.`;
    geoTone = 'is-ok';
  } else if (geo.status === 'ok' && distanceRequired && distM != null && !nearEnough) {
    geoMsg = `About ${(distM / 1000).toFixed(1)} km from the venue — move within 500 m to submit.`;
    geoTone = 'is-far';
  } else if (geo.status === 'ok') {
    geoMsg = 'Location on.';
    geoTone = 'is-ok';
  }

  const showLocActions = geo.status !== 'ok' && geo.status !== 'asking' && geo.status !== 'skipped';
  const showBlockedHelp = geo.status === 'denied' || permState === 'denied';

  return (
    <div className="iq-wrap">
      <div className="iq-card ck-card">
        <header className="ck-hd">
          <p className="ck-kicker">Crew attendance</p>
          <h1 className="ck-title">Please clock in</h1>
          <p className="ck-lede">
            {a.name ? `Hello, ${a.name}. ` : ''}
            Confirm your arrival so we can record your attendance for this assignment.
          </p>
          {a.duty ? <p className="ck-role">Role · {a.duty}</p> : null}
        </header>

        <div className="ck-body">
          <section className="ck-event" aria-label="Assignment details">
            <div className="ck-row">
              <span className="ck-label">Client</span>
              <span className="ck-value">{a.client_name || '—'}{a.event_type ? ` · ${a.event_type}` : ''}</span>
            </div>
            <div className="ck-row">
              <span className="ck-label">Date</span>
              <span className="ck-value">{date}</span>
            </div>
            <div className="ck-row">
              <span className="ck-label">Location</span>
              <span className="ck-value">{a.location || '—'}</span>
            </div>
            <div className="ck-row">
              <span className="ck-label">Hours</span>
              <span className="ck-value">{slot}</span>
            </div>
          </section>

          {err && <p className="ck-err">{err}</p>}

          {!alreadyIn && (
            <>
              <section className="ck-decl-block">
                <h2 className="ck-section-title">Please confirm</h2>
                <div className="ck-decls">
                  {DECLS.map(d => {
                    const locked = d.key === 'location_on' && !locationReady;
                    return (
                      <label
                        key={d.key}
                        className={`ck-decl ${decls[d.key] ? 'is-on' : ''} ${locked ? 'is-locked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={!!decls[d.key]}
                          onChange={() => toggle(d.key)}
                          disabled={locked}
                        />
                        <span>{d.label}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <div className={`ck-geo ${geoTone}`} role="status">{geoMsg}</div>

              {geo.status === 'asking' && (
                <p className="ck-loc-hint">If you do not see a popup, check behind this window or the address bar.</p>
              )}

              {showLocActions && (
                <div className="ck-loc-actions">
                  <button type="button" className="ck-loc-btn" onClick={enableLocation}>
                    Allow location access
                  </button>
                  {showBlockedHelp && (
                    <>
                      <p className="ck-loc-hint">{resetHint()}</p>
                      <button type="button" className="ck-loc-skip" onClick={continueWithoutGps}>
                        Continue without sharing location
                      </button>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                className="iq-btn ck-submit"
                onClick={submitAttendance}
                disabled={!canSubmit}
                title={!canSubmit ? 'Confirm every item and share location (or continue without it)' : 'Submit attendance'}
              >
                {busy ? 'Submitting…' : 'Submit attendance'}
              </button>
            </>
          )}

          {alreadyIn && (
            <div className="ck-status is-ok">
              Clocked in at {formatStampTime(a.checked_in_at, pref)}
            </div>
          )}

          {alreadyIn && !alreadyOut && (
            <button type="button" className="iq-btn ck-submit" onClick={checkout} disabled={busy}>
              {busy ? 'Saving…' : 'Clock out'}
            </button>
          )}

          {alreadyOut && (
            <div className="ck-status is-ok">
              Clocked out at {formatStampTime(a.checked_out_at, pref)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
