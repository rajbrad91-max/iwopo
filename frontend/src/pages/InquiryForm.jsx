import { useState } from 'react';
import { api } from '../lib/api';
import './inquiry.css';

export default function InquiryForm({ vendorId }) {
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

  if (done) return (
    <div className="iq-wrap">
      <div className="iq-card iq-done">
        <div className="iq-check">✓</div>
        <h2>Thank you! 🎉</h2>
        <p>Your inquiry has been sent. We'll be in touch soon.</p>
      </div>
    </div>
  );

  return (
    <div className="iq-wrap">
      <div className="iq-card">
        <div className="iq-brand">⬡ Booking Inquiry</div>
        <p className="iq-sub">Tell us about your event 💫</p>

        <label>Your name *</label>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />

        <div className="iq-row">
          <div><label>Email *</label>
            <input value={f.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" /></div>
          <div><label>Phone</label>
            <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 555-5555" /></div>
        </div>

        <label>Event type</label>
        <select value={f.event_type} onChange={e => set('event_type', e.target.value)}>
          <option>Wedding</option><option>Engagement</option><option>Portrait</option><option>Event</option><option>Other</option>
        </select>

        <div className="iq-row">
          <div><label>Event date</label>
            <input type="date" value={f.event_date} onChange={e => set('event_date', e.target.value)} /></div>
          <div><label>Guests</label>
            <input type="number" value={f.guests} onChange={e => set('guests', e.target.value)} placeholder="120" /></div>
        </div>

        <div className="iq-row">
          <div><label>Start time</label>
            <input type="time" value={f.timing_from} onChange={e => set('timing_from', e.target.value)} /></div>
          <div><label>End time</label>
            <input type="time" value={f.timing_to} onChange={e => set('timing_to', e.target.value)} /></div>
        </div>

        <label>Location / Venue</label>
        <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Venue name or address" />

        {isWedding && (
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

        <label>Anything else?</label>
        <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows="3" placeholder="Tell us more about your day…" />

        {err && <div className="iq-err">⚠️ {err}</div>}
        <button className="iq-btn" onClick={submit} disabled={busy}>
          {busy ? 'Sending…' : '📨 Send Inquiry'}
        </button>
      </div>
    </div>
  );
}
