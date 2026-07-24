import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import ChatWidget from './ChatWidget';
import './inquiry.css';

// professions for the background watermark
export const PROFESSIONS = {
  none: { label: 'None', icon: '' },
  photographer: { label: 'Photographer', icon: '📷' },
  videographer: { label: 'Videographer', icon: '🎥' },
  photo_video: { label: 'Photo & Video', icon: '🎬' },
  realestate: { label: 'Real Estate Creator', icon: '🏠' },
  dj: { label: 'DJ', icon: '🎧' },
  makeup: { label: 'Make-Up Artist', icon: '💄' },
  cake: { label: 'Cake Maker', icon: '🎂' },
  florist: { label: 'Florist / Floor Wrapper', icon: '💐' },
  bartender: { label: 'Bartender', icon: '🍸' },
  caterer: { label: 'Caterer', icon: '🍽️' },
  planner: { label: 'Wedding Planner', icon: '📋' },
  musician: { label: 'Musician / Singer', icon: '🎶' },
};

export default function InquiryForm({ vendorId }) {
  const [cfg, setCfg] = useState(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [p, setP] = useState({ role: '', name: '', email: '', phone: '', instagram: '', heard: '' });
  const setPI = (k, v) => setP(s => ({ ...s, [k]: v }));

  const [answers, setAnswers] = useState({});
  const setAns = (id, v) => setAnswers(s => ({ ...s, [id]: v }));

  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.inquirySettings(vendorId).then(d => setCfg(d.settings)).catch(() => setCfg({}));
  }, [vendorId]);

  async function submit() {
    setErr('');
    if (!p.name.trim()) { setErr('Please enter your name'); return; }
    if (!p.email.trim()) { setErr('Please enter your email'); return; }
    // same rule the server enforces, so a typo is caught before the round-trip
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
      setErr('That email address does not look right'); return;
    }
    for (const fld of (cfg.custom_fields || [])) {
      if (fld.required && !answers[fld.id]) { setErr(`"${fld.label}" is required`); return; }
    }
    setBusy(true);
    try {
      await api.createLead({
        vendor_id: Number(vendorId),
        name: p.name, email: p.email, phone: p.phone,
        role: p.role, instagram: p.instagram, heard: p.heard,
        notes, custom_data: answers,
      });
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
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
  const font = c.font || 'Inter';
  const prof = PROFESSIONS[c.background] || PROFESSIONS.none;

  return (
    <div className="iq-wrap" style={{ fontFamily: `'${font}', sans-serif`, '--brand': brand }}>
      {/* page-wide profession watermark */}
      {prof.icon && <div className="iq-watermark" aria-hidden>{Array.from({ length: 120 }).map((_, i) => <span key={i}>{prof.icon}</span>)}</div>}
      <div className={`iq-card iq-theme-${c.theme || 'classic'}`}>
        {/* header: logo left, brand + intro centered */}
        <div className="iq-hd">
          {c.logo_path && <img className="iq-logo" src={`/api/me/logo/${c.logo_path}`} alt="logo" />}
          <div className="iq-hd-text">
            <div className="iq-brand">{c.brand_name || 'Booking Inquiry'}</div>
            {c.intro_link
              ? <a className="iq-sub iq-sub-link" href={c.intro_link} target="_blank" rel="noopener noreferrer">{c.intro_text || 'Tell us about your event'} ↗</a>
              : <p className="iq-sub">{c.intro_text || 'Tell us about your event'}</p>}
          </div>
        </div>

        <div className="iq-body">
          <LeadFormBody cfg={c} p={p} setPI={setPI} answers={answers} setAns={setAns} notes={notes} setNotes={setNotes} />

          {err && <div className="iq-err">⚠️ {err}</div>}
          <button className="iq-btn" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : '📨 Send Inquiry'}
          </button>
        </div>
      </div>
      <ChatWidget vendorId={vendorId} businessName={c.brand_name} />
    </div>
  );
}

// 🧩 SHARED form body — used by Public form, Add Lead, Edit Lead
export function LeadFormBody({ cfg, p, setPI, answers, setAns, notes, setNotes }) {
  const c = cfg || {};
  return (
    <>
      {/* Section 1: Contact Details */}
      <div className="iq-section">
        <div className="iq-section-title">📇 Contact Details</div>
        <div className="iq-grid">
          <div>
            <label>Your Role *</label>
            <select value={p.role} onChange={e => setPI('role', e.target.value)}>
              <option value="">Select…</option>
              <option>Bride</option><option>Groom</option><option>Planner</option><option>Other</option>
            </select>
          </div>
          <div>
            <label>Full Name *</label>
            <input value={p.name} onChange={e => setPI('name', e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label>Email *</label>
            <input value={p.email} onChange={e => setPI('email', e.target.value)} placeholder="you@email.com" />
          </div>
          <div>
            <label>Phone *</label>
            <input value={p.phone} onChange={e => setPI('phone', e.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label>Instagram Handle</label>
            <input value={p.instagram} onChange={e => setPI('instagram', e.target.value)} placeholder="@yourhandle" />
          </div>
          <div>
            <label>How did you hear about us?</label>
            <select value={p.heard} onChange={e => setPI('heard', e.target.value)}>
              <option value="">Select…</option>
              <option>Friend</option><option>Google Maps</option><option>Instagram</option><option>Facebook</option><option>Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Inquiry Details (custom fields) */}
      {(c.custom_fields || []).length > 0 && (
        <div className="iq-section">
          <div className="iq-section-title">✨ {c.details_heading || 'Inquiry Details'}</div>
          <div className="iq-grid">
            {c.custom_fields.map(fld => (
              <div key={fld.id} className={fld.type === 'checkbox' ? 'iq-full' : ''}>
                <CustomField fld={fld} value={answers[fld.id]} onChange={v => setAns(fld.id, v)}
                  answers={answers} fields={c.custom_fields} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Notes */}
      <div className="iq-section">
        <div className="iq-section-title">📝 Notes</div>
        <label>Anything else?</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="3" placeholder="Tell us more…" />
      </div>
    </>
  );
}

/**
 * ⏱️ Hours between two "HH:MM" times, as a decimal.
 * An end time earlier than the start is read as running past midnight — a
 * reception from 20:00 to 01:00 is 5 hours, not minus fifteen.
 * Returns null when either time is missing or unparseable.
 */
export function hoursBetween(from, to) {
  const parse = (t) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  const a = parse(from), b = parse(to);
  if (a === null || b === null) return null;
  const mins = b >= a ? b - a : (1440 - a) + b;   // wrap past midnight
  return mins / 60;
}

/** "6 hrs 30 min" / "1 hr" / "45 min" — the wording vendors already use. */
export function formatHours(dec) {
  if (dec === null || dec === undefined) return '';
  const total = Math.round(dec * 60);
  const h = Math.floor(total / 60), m = total % 60;
  if (!h && !m) return '0 min';
  if (!h) return `${m} min`;
  const hp = `${h} hr${h === 1 ? '' : 's'}`;
  return m ? `${hp} ${m} min` : hp;
}

function CustomField({ fld, value, onChange, answers, fields }) {
  const label = <label>{fld.label}{fld.required && ' *'}</label>;

  if (fld.type === 'dropdown') return (<>
    {label}
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Select…</option>
      {(fld.options || []).map((o, i) => <option key={i}>{o}</option>)}
    </select>
  </>);

  if (fld.type === 'text') return (<>{label}
    <input value={value || ''} onChange={e => onChange(e.target.value)} /></>);

  if (fld.type === 'date') return (<>{label}
    <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} /></>);

  if (fld.type === 'time') return (<>{label}
    <input type="time" value={value || ''} onChange={e => onChange(e.target.value)} /></>);

  if (fld.type === 'location') return (<>{label}
    <LocationField value={value || ''} onChange={onChange} /></>);

  if (fld.type === 'hours') return (
    <HoursField fld={fld} value={value} onChange={onChange} answers={answers} fields={fields} />
  );

  if (fld.type === 'checkbox') return (
    <label className="iq-check-row">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      {fld.label}
    </label>
  );

  return null;
}

/**
 * ⏱️ Hours field. Works out its own value from the form's "from" and "to" time
 * fields, which the vendor picks when building the form (from_field / to_field).
 * The client can still type over it — a shoot with a break in the middle isn't
 * simply end minus start — and a manual value is kept until they clear it.
 */
function HoursField({ fld, value, onChange, answers, fields }) {
  const [manual, setManual] = useState(false);

  const fromId = fld.from_field;
  const toId = fld.to_field;
  const from = fromId ? answers?.[fromId] : null;
  const to = toId ? answers?.[toId] : null;
  const auto = formatHours(hoursBetween(from, to));

  // Fill from the times unless the client has typed their own figure.
  // `value` and `onChange` are deliberately not dependencies: including them
  // would re-run this on every keystroke and fight the manual entry.
  useEffect(() => {
    if (manual) return;
    if (auto && auto !== value) onChange(auto);
    if (!auto && value) onChange('');
  }, [auto, manual]);

  const fromLabel = fields?.find(f => f.id === fromId)?.label;
  const toLabel = fields?.find(f => f.id === toId)?.label;
  const linked = fromId && toId;

  return (<>
    <label>
      {fld.label}{fld.required && ' *'}
      {linked && !manual && <span className="iq-auto-tag">auto</span>}
    </label>
    <input
      value={value || ''}
      placeholder={linked ? `From ${fromLabel || 'start'} → ${toLabel || 'end'}` : 'e.g. 6 hrs 30 min'}
      onChange={e => { setManual(true); onChange(e.target.value); }}
    />
    {linked && manual && (
      <button type="button" className="iq-auto-reset"
        onClick={() => { setManual(false); onChange(auto || ''); }}>
        ↻ recalculate from times
      </button>
    )}
  </>);
}

function LocationField({ value, onChange }) {
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);

  async function lookup(q) {
    onChange(q);
    if (q.length < 3) { setSugs([]); return; }
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
      const d = await r.json();
      setSugs((d.features || []).map(f => {
        const pr = f.properties;
        return [pr.name, pr.city, pr.state, pr.country].filter(Boolean).join(', ');
      }));
      setOpen(true);
    } catch { setSugs([]); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => lookup(e.target.value)} placeholder="Start typing an address…" autoComplete="off" />
      {open && sugs.length > 0 && (
        <div className="iq-sugs">
          {sugs.map((s, i) => (
            <div key={i} className="iq-sug" onClick={() => { onChange(s); setOpen(false); }}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
