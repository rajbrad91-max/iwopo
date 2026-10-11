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
  // every problem found, keyed by the box it belongs to — all are shown at once (QA 2026-10-10)
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  useDocumentTitle(cfg?.brand_name);

  const [p, setP] = useState({ role: '', name: '', email: '', phone: '', instagram: '', heard: '' });
  const clearErr = (k) => setErrs(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const setPI = (k, v) => { setP(s => ({ ...s, [k]: v })); clearErr(k); };

  const [answers, setAnswers] = useState({});
  const setAns = (id, v) => { setAnswers(s => ({ ...s, [id]: v })); clearErr(`f:${id}`); };

  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = byHost ? api.inquirySettingsByHost() : api.inquirySettings(handle);
    load.then(d => { setCfg(d.settings); if (d.slug) setWho(d.slug); })
        .catch(() => { setGone(true); setCfg({}); });
  }, [handle, byHost]);

  /** Point at the field: outline it, bring it into view, put the cursor in it. */
  /** Mark every problem, and take the client to the first one. */
  function fail(list) {
    const all = Array.isArray(list) ? list : [list];
    setErrs(Object.fromEntries(all.map(x => [x.field, x.message])));
    const first = all[0]?.field;
    requestAnimationFrame(() => {
      const box = document.querySelector(`[data-field="${first}"]`);
      if (!box) return;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    });
  }

  async function submit() {
    setErr(''); setErrs({});
    // top to bottom, in the order the client sees the boxes — every problem at once
    const problems = [];
    if (!p.role) problems.push({ field: 'role', message: 'Please choose your role' });
    if (!p.name.trim()) problems.push({ field: 'name', message: 'Please enter your name' });
    if (!p.email.trim()) problems.push({ field: 'email', message: 'Please enter your email' });
    // same rule the server enforces, so a typo is caught before the round-trip
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) problems.push({ field: 'email', message: 'That email address does not look right' });
    if (!p.phone.trim()) problems.push({ field: 'phone', message: 'Please enter your phone number' });
    else if (p.phone.replace(/\D/g, '').length < 7) problems.push({ field: 'phone', message: 'That phone number looks too short' });
    for (const x of allProblems(cfg.custom_fields || [], answers)) problems.push({ field: `f:${x.id}`, message: x.message });
    if (problems.length) return fail(problems);
    setBusy(true);
    try {
      // An unticked box is an answer. Leaving it out of custom_data made the
      // lead look as if the question had never been asked.
      const custom = { ...answers };
      for (const f of cfg.custom_fields || []) {
        if (f.type === 'checkbox') custom[f.id] = answers[f.id] === true;
        // 349.99 stays 349.99 — kept as the client wrote it, without commas or a $ sign
        if (f.type === 'number' && custom[f.id] !== undefined && custom[f.id] !== '') custom[f.id] = plainNumber(custom[f.id]);
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
            clientForm errs={errs} />

          {err && <div className="iq-err">⚠️ {err}</div>}
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
export function LeadFormBody({ cfg, p, setPI, answers, setAns, notes, setNotes, clientForm = false, errs = {} }) {
  const c = cfg || {};
  const box = (key, extra = '') => ({ 'data-field': key, className: `${extra} ${errs[key] ? 'iq-field-err' : ''}`.trim() || undefined });
  const note = (key) => (errs[key] ? <div className="iq-field-msg" role="alert">⚠️ {errs[key]}</div> : null);
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
              <div key={fld.id} {...box(`f:${fld.id}`, fld.type === 'checkbox' || fld.type === 'paragraph' ? 'iq-full' : '')}>
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
/** Every problem on the form, top to bottom. */
export function allProblems(fields, answers) {
  const out = [];
  for (const f of fields) { const p = checkAnswers([f], answers, fields); if (p) out.push(p); }
  return out;
}

/** "$1,349.99" → "1349.99"; anything that is not a plain amount comes back unchanged. */
export function plainNumber(v) {
  const t = String(v).trim().replace(/[$\s,]/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? t : String(v).trim();
}

export function checkAnswers(fields, answers, allFields = fields) {
  const today = todayLocal();
  const hours = allFields.find(f => f.type === 'hours' && f.from_field && f.to_field);
  const fromF = allFields.find(f => f.maps_to === 'timing_from') || (hours && allFields.find(f => f.id === hours.from_field));
  const toF = allFields.find(f => f.maps_to === 'timing_to') || (hours && allFields.find(f => f.id === hours.to_field));
  for (const f of fields) {
    const v = answers[f.id];
    // ⏱️ a time with only some of hour / minutes / AM-PM picked
    if (f.type === 'time' && v === PARTIAL_TIME) return { id: f.id, message: `Please pick the hour, minutes and AM/PM for "${f.label}"` };
    const empty = v === undefined || v === null || v === '' || v === false;
    if (f.required && empty) return { id: f.id, message: `"${f.label}" is required` };
    if (empty) continue;
    if (f.type === 'date' && isEventDate(f, allFields) && String(v) < today) return { id: f.id, message: 'That date has already passed — please check the event date' };
    // decimals are fine — a price or a budget has cents (QA 2026-10-10: 349.99 was refused)
    if (f.type === 'number' && !/^\d+(\.\d{1,2})?$/.test(plainNumber(v))) return { id: f.id, message: `"${f.label}" needs a number, e.g. 350 or 349.99` };
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

  // 📝 a longer answer — line breaks kept (QA 2026-10-10: a one-line box flattened them)
  if (fld.type === 'paragraph') return (<>{label}
    <textarea rows="4" value={value || ''} onChange={e => onChange(e.target.value)} /></>);

  if (fld.type === 'date') return (<>{label}
    <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
      min={clientForm && isEventDate(fld, fields) ? todayLocal() : undefined} /></>);

  // 🔢 a number — a count or an amount. A text box with the number pad: a number
  // box turned 349.99 into 349.989990234375 in some browsers and refused it.
  if (fld.type === 'number') return (<>{label}
    <input type="text" inputMode="decimal" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="e.g. 150" /></>);

  if (fld.type === 'time') return (<>{label}
    <TimeSelect value={value} onChange={onChange} /></>);

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

/** A time where only some of hour / minutes / AM-PM is picked — caught before sending. */
export const PARTIAL_TIME = 'partial';

/**
 * 🕐 Time — hour, minutes, AM/PM as three plain dropdowns.
 *
 * QA 2026-10-10: start and end times never reached a single lead. A browser's
 * time box stays EMPTY until hour, minutes and AM/PM are all filled, and
 * typing "4 PM" leaves it blank without a word — so the time, and the Hours
 * worked out from it, silently vanished. Three dropdowns have no half-filled
 * state the client can't see: picking the hour fills :00, AM/PM must be
 * chosen, and anything still missing is pointed out before sending.
 * The value stays "HH:MM" (24-hour), exactly what the lead has always stored.
 */
function TimeSelect({ value, onChange }) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  const [part, setPart] = useState(() => (m ? { h: String(+m[1] % 12 || 12), mi: m[2], ap: +m[1] >= 12 ? 'PM' : 'AM' } : { h: '', mi: '', ap: '' }));
  const put = (next) => {
    const t = { ...part, ...next };
    if (next.h && !t.mi) t.mi = '00';
    setPart(t);
    if (t.h && t.mi && t.ap) {
      const h24 = (+t.h % 12) + (t.ap === 'PM' ? 12 : 0);
      onChange(`${String(h24).padStart(2, '0')}:${t.mi}`);
    } else onChange(t.h || t.mi || t.ap ? PARTIAL_TIME : '');
  };
  return (
    <div className="iq-time">
      <select aria-label="Hour" value={part.h} onChange={e => put({ h: e.target.value })}>
        <option value="">Hour</option>
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => <option key={h} value={String(h)}>{h}</option>)}
      </select>
      <select aria-label="Minutes" value={part.mi} onChange={e => put({ mi: e.target.value })}>
        <option value="">Min</option>
        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(x => <option key={x} value={x}>:{x}</option>)}
      </select>
      <select aria-label="AM or PM" value={part.ap} onChange={e => put({ ap: e.target.value })}>
        <option value="">AM/PM</option>
        <option>AM</option><option>PM</option>
      </select>
    </div>
  );
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
      {linked && !manual && <>{' '}<span className="iq-auto-tag">auto</span></>}
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
