import { useState, useEffect } from 'react';
import { themeStyleObject } from '../lib/brandTheme.js';
import { api } from '../lib/api';
import ChatWidget from './ChatWidget';
import './inquiry.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// The list lives in lib/professions.js — the public page and the super panel
// need the same one. Re-exported so existing imports keep working.
export { PROFESSIONS } from '../lib/professions';
import { PROFESSIONS } from '../lib/professions';
import ProfessionArt from '../components/ProfessionArt.jsx';

/* 🤍 Ivory (2026-10-09, Raj's pick of four designs): a white card on a soft
   page tinted from the brand colour, a monogram or logo in a circle, the name
   in a serif (space alone sets it apart — no rule under it), small-caps section titles, plain boxes — calm and classic, so it
   sits with any vendor's own website. The default for every form that has not
   chosen another style. */
export const DEFAULT_THEME = 'ivory';
/** Up to two initials for the monogram: "Perfect Poses Media" → "PP". */
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (w.slice(0, 2).map(x => x[0]).join('') || '·').toUpperCase();
}

export default function InquiryForm({ handle, byHost = false }) {
  /* On a vendor's own domain there is no handle in the URL — the Host header
   * names them. The server hands back their slug, which is what the lead is
   * filed against and what the chat widget talks to. */
  const [who, setWho] = useState(handle || '');
  const [cfg, setCfg] = useState(null);
  // 🔗 a handle that resolves to nothing gets its own card. Falling back to an
  // empty form let a dead link render a blank inquiry that submitted nowhere.
  const [gone, setGone] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  // 🎯 the field an error is about — it is outlined, scrolled to and focused,
  // because a message beside the Send button about a box at the top of the
  // form left clients hunting for it (QA, 2026-10-09)
  const [errField, setErrField] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  useDocumentTitle(cfg?.brand_name);

  const [p, setP] = useState({ role: '', name: '', email: '', phone: '', instagram: '', heard: '' });
  const setPI = (k, v) => { setP(s => ({ ...s, [k]: v })); if (errField === k) { setErrField(''); setErr(''); } };

  const [answers, setAnswers] = useState({});
  const setAns = (id, v) => { setAnswers(s => ({ ...s, [id]: v })); if (errField === `f:${id}`) { setErrField(''); setErr(''); } };

  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = byHost ? api.inquirySettingsByHost() : api.inquirySettings(handle);
    load.then(d => { setCfg(d.settings); if (d.slug) setWho(d.slug); })
        .catch(() => { setGone(true); setCfg({}); });
  }, [handle, byHost]);

  /** Point at the field: outline it, bring it into view, put the cursor in it. */
  function fail(field, message) {
    setErr(message);
    setErrField(field);
    requestAnimationFrame(() => {
      const box = document.querySelector(`[data-field="${field}"]`);
      if (!box) return;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    });
  }

  async function submit() {
    setErr(''); setErrField('');
    // top to bottom, in the order the client sees the boxes
    if (!p.role) return fail('role', 'Please choose your role');
    if (!p.name.trim()) return fail('name', 'Please enter your name');
    if (!p.email.trim()) return fail('email', 'Please enter your email');
    // same rule the server enforces, so a typo is caught before the round-trip
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return fail('email', 'That email address does not look right');
    if (!p.phone.trim()) return fail('phone', 'Please enter your phone number');
    if (p.phone.replace(/\D/g, '').length < 7) return fail('phone', 'That phone number looks too short');
    const problem = checkAnswers(cfg.custom_fields || [], answers);
    if (problem) return fail(`f:${problem.id}`, problem.message);
    setBusy(true);
    try {
      // An unticked box is an answer. Leaving it out of custom_data made the
      // lead look as if the question had never been asked.
      const custom = { ...answers };
      for (const f of cfg.custom_fields || []) {
        if (f.type === 'checkbox') custom[f.id] = answers[f.id] === true;
      }
      await api.createLead({
        vendor_slug: who,
        name: p.name, email: p.email, phone: p.phone,
        role: p.role, instagram: p.instagram, heard: p.heard,
        notes, custom_data: custom,
      });
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (gone) return (
    <div className="iq-wrap">
      <div className="iq-card iq-done">
        <div className="iq-check">🔗</div>
        <h2>This link isn&apos;t in use</h2>
        <p>It may have changed. Ask the studio for their current inquiry link.</p>
      </div>
    </div>
  );

  /* 🎉 The thank-you keeps the vendor's colour, font, name and logo — it used to
     switch to plain beige, so the client seemed to land on another site. */
  if (done) {
    const b = cfg?.brand_color || '#2dd4bf';
    return (
      <div className="iq-wrap" style={themeStyleObject(b, cfg?.theme, cfg?.font || 'Inter')}>
        <div className={`iq-card iq-theme-${cfg?.theme || DEFAULT_THEME}`}>
          <div className="iq-hd">
            {cfg?.logo_path && logoOk
              ? <img className="iq-logo" src={`/api/me/logo/${cfg.logo_path}`} alt="" onError={() => setLogoOk(false)} />
              : <div className="iq-mono" aria-hidden="true">{initials(cfg?.brand_name)}</div>}
            <div className="iq-hd-text"><div className="iq-brand">{cfg?.brand_name || 'Booking Inquiry'}</div></div>
          </div>
          <div className="iq-done">
            <div className="iq-check">✓</div>
            <h2>Thank you! 🎉</h2>
            <p>Your inquiry has been sent. We&apos;ll be in touch soon.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!cfg) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;

  const c = cfg;
  const brand = c.brand_color || '#2dd4bf';
  const font = c.font || 'Inter';
  const theme = c.theme || DEFAULT_THEME;

  return (
    <div className="iq-wrap" style={themeStyleObject(brand, cfg.theme, font)}>
      {/* 🖼️ one big drawing for the vendor's trade behind the card ("None": plain) */}
      <ProfessionArt trade={c.background} />
      <div className={`iq-card iq-theme-${theme}`}>
        {/* header: logo left, brand + intro centered */}
        <div className="iq-hd">
          {/* a logo that fails to load is left out, not shown as an empty box;
              Ivory shows the studio's initials in a circle instead */}
          {c.logo_path && logoOk
            ? <img className="iq-logo" src={`/api/me/logo/${c.logo_path}`} alt="" onError={() => setLogoOk(false)} />
            : <div className="iq-mono" aria-hidden="true">{initials(c.brand_name)}</div>}
          <div className="iq-hd-text">
            <div className="iq-brand">{c.brand_name || 'Booking Inquiry'}</div>
            {c.intro_link
              ? <a className="iq-sub iq-sub-link" href={c.intro_link} target="_blank" rel="noopener noreferrer">{c.intro_text || 'Tell us about your event'} ↗</a>
              : <p className="iq-sub">{c.intro_text || 'Tell us about your event'}</p>}
          </div>
        </div>

        <div className="iq-body">
          <LeadFormBody cfg={c} p={p} setPI={setPI} answers={answers} setAns={setAns} notes={notes} setNotes={setNotes}
            clientForm errField={errField} errText={err} />

          {err && !errField && <div className="iq-err">⚠️ {err}</div>}
          <button className="iq-btn" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : <><span className="iq-emoji">📨 </span>Send Inquiry</>}
          </button>
          <p className="iq-req-note">Fields marked * are required</p>
        </div>
      </div>
      {/* 🤖 only for vendors subscribed to the chatbot */}
      {c.chat && <ChatWidget handle={who} businessName={c.brand_name} botName={c.bot_name} />}
    </div>
  );
}

// 🧩 SHARED form body — used by Public form, Add Lead, Edit Lead
/* The public form passes clientForm (+ the field an error is about); the
   panel's Add / Edit Lead do not — a vendor recording an old booking must be
   able to enter a past date. */
export function LeadFormBody({ cfg, p, setPI, answers, setAns, notes, setNotes, clientForm = false, errField = '', errText = '' }) {
  const c = cfg || {};
  const box = (key, extra = '') => ({ 'data-field': key, className: `${extra} ${errField === key ? 'iq-field-err' : ''}`.trim() || undefined });
  const note = (key) => (errField === key ? <div className="iq-field-msg" role="alert">⚠️ {errText}</div> : null);
  return (
    <>
      {/* Section 1: Contact Details */}
      <div className="iq-section">
        <div className="iq-section-title"><span className="iq-emoji">📇 </span>Contact Details</div>
        <div className="iq-grid">
          <div {...box('role')}>
            <label>Your Role *</label>
            <select value={p.role} onChange={e => setPI('role', e.target.value)}>
              <option value="">Select…</option>
              <option>Bride</option><option>Groom</option><option>Planner</option><option>Other</option>
            </select>
            {note('role')}
          </div>
          <div {...box('name')}>
            <label>Full Name *</label>
            <input value={p.name} onChange={e => setPI('name', e.target.value)} placeholder="Full name" autoComplete="name" />
            {note('name')}
          </div>
          {/* 📱 real email / phone fields: a phone shows the @ keyboard and the number pad */}
          <div {...box('email')}>
            <label>Email *</label>
            <input type="email" inputMode="email" autoComplete="email" value={p.email} onChange={e => setPI('email', e.target.value)} placeholder="you@email.com" />
            {note('email')}
          </div>
          <div {...box('phone')}>
            <label>Phone *</label>
            <input type="tel" inputMode="tel" autoComplete="tel" value={p.phone} onChange={e => setPI('phone', e.target.value)} placeholder="(555) 555-5555" />
            {note('phone')}
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
          <div className="iq-section-title"><span className="iq-emoji">✨ </span>{c.details_heading || 'Inquiry Details'}</div>
          <div className="iq-grid">
            {c.custom_fields.map(fld => (
              <div key={fld.id} {...box(`f:${fld.id}`, fld.type === 'checkbox' ? 'iq-full' : '')}>
                <CustomField fld={fld} value={answers[fld.id]} onChange={v => setAns(fld.id, v)}
                  answers={answers} fields={c.custom_fields} clientForm={clientForm} />
                {note(`f:${fld.id}`)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Notes */}
      <div className="iq-section">
        <div className="iq-section-title"><span className="iq-emoji">📝 </span>Notes</div>
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

/** Today as YYYY-MM-DD in the visitor's own time zone (what a date box shows). */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** The field that holds the EVENT date: mapped to it, or (older forms) the first date field with no mapping. */
function isEventDate(fld, fields) {
  if (fld.maps_to) return fld.maps_to === 'event_date';
  return fld.type === 'date' && fields.find(f => f.type === 'date' && !f.maps_to)?.id === fld.id;
}

/**
 * ✅ What the client form refuses, field by field, in page order:
 *   • a required question left empty;
 *   • an event date already past — no one books a wedding for last year;
 *   • a Number field that is not a number;
 *   • a start and end time that make the event longer than 16 hours — an end
 *     BEFORE the start is still allowed for an evening running past midnight
 *     (20:00 → 01:00 is 5 hours), but 16:00 → 11:00 is a slip, not a 19-hour day.
 * Returns { id, message } for the first problem, or null.
 */
export function checkAnswers(fields, answers) {
  const today = todayLocal();
  const hours = fields.find(f => f.type === 'hours' && f.from_field && f.to_field);
  const fromF = fields.find(f => f.maps_to === 'timing_from') || (hours && fields.find(f => f.id === hours.from_field));
  const toF = fields.find(f => f.maps_to === 'timing_to') || (hours && fields.find(f => f.id === hours.to_field));
  for (const f of fields) {
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === '' || v === false;
    if (f.required && empty) return { id: f.id, message: `"${f.label}" is required` };
    if (empty) continue;
    if (f.type === 'date' && isEventDate(f, fields) && String(v) < today) return { id: f.id, message: 'That date has already passed — please check the event date' };
    if (f.type === 'number' && !/^\d+$/.test(String(v).trim())) return { id: f.id, message: `"${f.label}" needs a number` };
    // hours typed by hand must say how many — words alone reached the lead as an empty Hours
    if (f.type === 'hours' && !/\d/.test(String(v))) return { id: f.id, message: `"${f.label}" needs a number of hours, e.g. 6 or 6 hrs 30 min` };
    if (toF && f.id === toF.id && fromF && answers[fromF.id]) {
      const span = hoursBetween(answers[fromF.id], v);
      if (span !== null && span > 16) return { id: f.id, message: 'The ending time is before the starting time — please check both' };
    }
  }
  return null;
}

function CustomField({ fld, value, onChange, answers, fields, clientForm = false }) {
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
    <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
      min={clientForm && isEventDate(fld, fields) ? todayLocal() : undefined} /></>);

  // 🔢 a count — "how many people", "guests", "servings": the number pad on a phone, digits only
  if (fld.type === 'number') return (<>{label}
    <input type="number" inputMode="numeric" min="0" step="1" value={value ?? ''} onChange={e => onChange(e.target.value)} /></>);

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

/**
 * 📍 Location field — a plain text input.
 *
 * This used to autocomplete against photon.komoot.io. That's a free community
 * service with no SLA or support, called straight from the client's browser, so
 * every guest's IP hit a third party we don't control and suggestions would
 * simply stop if it went down or rate-limited us. Clients know their own venue;
 * typing it is fine.
 */
function LocationField({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Venue name and address"
      autoComplete="off"
    />
  );
}
