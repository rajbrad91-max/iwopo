import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './inquiry.css';

export default function InquiryForm({ vendorId }) {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({
    name: '', email: '', phone: '',
    event_type: 'Wedding', event_date: '', timing_from: '', timing_to: '',
    location: '', hours: '', guests: '',
    gr_bride: false, gr_bride_venue: '',
    gr_groom: false, gr_groom_venue: '',
    notes: '',
  });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    api.inquirySettings(vendorId).then(d => {
      setCfg(d.settings);
      if (d.settings?.event_types?.length) set('event_type', d.settings.event_types[0]);
    }).catch(() => setCfg({}));
  }, [vendorId]);

  async function submit() {
    setErr('');
    if (!f.name || !f.email) { setErr('Name and email are required'); return; }
    setBusy(true);
    try {
      await api.createLead({ ...f, vendor_id: Number(vendorId),
        hours: f.hours ? Number(f.hours) : null,
        guests: f.guests ? Number(f.guests) : null });
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const isWedding = f.event_type === 'Wedding';

  // ⏱️ Auto-calc hours from start + end time
  function calcHours(from, to) {
    if (!from || !to) return '';
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 24 * 60; // handle overnight
    return (mins / 60).toFixed(1).replace(/\.0$/, '');
  }
  function setTime(k, v) {
    setF(s => {
      const next = { ...s, [k]: v };
      next.hours = calcHours(k === 'timing_from' ? v : s.timing_from, k === 'timing_to' ? v : s.timing_to);
      return next;
    });
  }

  if (done) return (
    <div className="iq-wrap">
      <div className="iq-card iq-done">
        <div className="iq-check">✓</div>
        <h2>Thank you! 🎉</h2>
        <p>Your inquiry has been sent. We'll be in touch soon.</p>
      </div>
    </div>
  );

  if (!cfg) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;
  const c = cfg;
  const brand = c.brand_color || '#2dd4bf';

  return (
    <div className="iq-wrap">
      <div className="iq-card" style={{ '--brand': brand }}>
        <div className="iq-brand" style={{ color: brand }}>⬡ {c.brand_name || 'Booking Inquiry'}</div>
        <p className="iq-sub">{c.intro_text || 'Tell us about your event 💫'}</p>

        <label>Your name *</label>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />

        <div className="iq-row">
          <div><label>Email *</label>
            <input value={f.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" /></div>
          {c.show_phone !== false && <div><label>Phone</label>
            <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 555-5555" /></div>}
        </div>

        <label>Event type</label>
        <select value={f.event_type} onChange={e => set('event_type', e.target.value)}>
          {(c.event_types || ['Wedding', 'Engagement', 'Portrait', 'Event', 'Other']).map(t => <option key={t}>{t}</option>)}
        </select>

        <div className="iq-row">
          <div><label>Event date</label>
            <input type="date" value={f.event_date} onChange={e => set('event_date', e.target.value)} /></div>
          {c.show_guests !== false && <div><label>Guests</label>
            <input type="number" value={f.guests} onChange={e => set('guests', e.target.value)} placeholder="120" /></div>}
        </div>

        {c.show_times !== false && (
          <div className="iq-row">
            <div><label>Start time</label>
              <input type="time" value={f.timing_from} onChange={e => setTime('timing_from', e.target.value)} /></div>
            <div><label>End time</label>
              <input type="time" value={f.timing_to} onChange={e => setTime('timing_to', e.target.value)} /></div>
          </div>
        )}

        {f.hours && <div className="iq-hours" style={{ color: brand, borderColor: brand + '44', background: brand + '14' }}>⏱️ Total coverage: <b>{f.hours} hours</b></div>}

        {c.show_location !== false && (<>
          <label>Location / Venue</label>
          <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Venue name or address" />
        </>)}

        {isWedding && c.show_getting_ready !== false && (
          <div className="iq-gr">
            <div className="iq-gr-head">✦ Getting Ready Shoot <span>(optional)</span></div>

            <label className="iq-check-row">
              <input type="checkbox" checked={f.gr_bride} onChange={e => set('gr_bride', e.target.checked)} />
              💄 Bride — Getting Ready
            </label>
            {f.gr_bride && (
              <input className="iq-gr-venue" value={f.gr_bride_venue}
                onChange={e => set('gr_bride_venue', e.target.value)} placeholder="Venue / location (optional)" />
            )}

            <label className="iq-check-row">
              <input type="checkbox" checked={f.gr_groom} onChange={e => set('gr_groom', e.target.checked)} />
              😎 Groom — Getting Ready
            </label>
            {f.gr_groom && (
              <input className="iq-gr-venue" value={f.gr_groom_venue}
                onChange={e => set('gr_groom_venue', e.target.value)} placeholder="Venue / location (optional)" />
            )}
          </div>
        )}

        {c.show_notes !== false && (<>
          <label>Anything else?</label>
          <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows="3" placeholder="Tell us more about your day…" />
        </>)}

        {err && <div className="iq-err">⚠️ {err}</div>}
        <button className="iq-btn" onClick={submit} disabled={busy} style={{ background: brand }}>
          {busy ? 'Sending…' : '📨 Send Inquiry'}
        </button>
      </div>
    </div>
  );
}
