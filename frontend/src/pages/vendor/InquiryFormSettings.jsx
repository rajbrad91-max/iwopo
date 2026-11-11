/**
 * 🧾 Inquiry Form: the form builder — fields, presets, conditions and colours.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api } from '../../lib/api';
import { PROFESSIONS } from '../InquiryForm';
import { OTHER } from '../../lib/formRules';
import { inquiryUrl } from '../../lib/clientBase';

/**
 * 🔀 "Show this question: Always / Only when…" (2026-10-30). Optional on every question — "Always" is how every
 * form behaved before. The source can be an EARLIER dropdown or checkbox, or one of the built-in contact questions.
 * The rules themselves live in lib/formRules.js (the server applies the same ones).
 */
const BUILTIN_SOURCES = [
  { id: '@heard', label: 'How did you hear about us?', type: 'dropdown', options: ['Friend', 'Google Maps', 'Instagram', 'Facebook', 'Other'] },
  { id: '@role', label: 'Your Role', type: 'dropdown', options: ['Bride', 'Groom', 'Planner', 'Other'] },
];
function ShowIfEditor({ f, index, fields, onChange }) {
  const earlier = fields.slice(0, index).filter(x => (x.type === 'dropdown' || x.type === 'checkbox') && x.label);
  const sources = [...BUILTIN_SOURCES, ...earlier.map(x => ({
    id: x.id, label: x.label, type: x.type, options: [...(x.options || []), ...(x.allow_other ? [OTHER] : [])],
  }))];
  const rule = f.show_if?.field ? f.show_if : null;
  const src = rule && sources.find(x => x.id === rule.field);
  const values = rule?.values || [];
  const set = (patch) => onChange({ ...rule, ...patch });
  return (
    <div className="fb-showif">
      <label className="fb-label">👁️ Show this question</label>
      <select className="fb-select" value={rule?.field || ''} onChange={e => {
        const s2 = sources.find(x => x.id === e.target.value);
        onChange(s2 ? { field: s2.id, op: 'in', values: s2.type === 'checkbox' ? [true] : [] } : null);
      }}>
        <option value="">Always</option>
        {sources.map(x => <option key={x.id} value={x.id}>Only when “{x.label}”…</option>)}
      </select>
      {src?.type === 'checkbox' && (
        <select className="fb-select fb-showif-op" value={rule.op} onChange={e => set({ op: e.target.value, values: [true] })}>
          <option value="in">…is ticked</option>
          <option value="not_in">…is not ticked</option>
        </select>
      )}
      {src && src.type !== 'checkbox' && (<>
        <select className="fb-select fb-showif-op" value={rule.op} onChange={e => set({ op: e.target.value })}>
          <option value="in">…is one of</option>
          <option value="not_in">…is not one of</option>
        </select>
        <div className="fb-showif-vals">
          {src.options.map(o => (
            <label key={o} className="fb-chip">
              <input type="checkbox" checked={values.includes(o)}
                onChange={e => set({ values: e.target.checked ? [...values, o] : values.filter(v => v !== o) })} />
              {o === OTHER ? 'Other (typed)' : o}
            </label>
          ))}
        </div>
        {!values.length && <p className="fb-hint">💡 Tick at least one answer — until then this question always shows.</p>}
      </>)}
      {rule && !src && <p className="fb-hint">⚠️ The question this depended on was removed or moved below it — it now always shows.</p>}
    </div>
  );
}

/** A comma-separated list typed in one box — kept as typed until the box is left, so commas can be typed freely. */
function ListInput({ value, placeholder, onChange }) {
  const [text, setText] = useState((value || []).join(', '));
  return (
    <input className="fb-input" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map(x => x.trim()).filter(Boolean))} />
  );
}

// 🏗️ Section 2 custom field builder
const FIELD_TYPES = [
  { t: 'dropdown', label: '📋 Dropdown' },
  { t: 'text', label: '✏️ Text' },
  // a longer answer — line breaks kept
  { t: 'paragraph', label: '📝 Long text' },
  // a count or an amount — guests, servings, a budget (decimals allowed)
  { t: 'number', label: '🔢 Number' },
  { t: 'date', label: '📅 Date' },
  { t: 'time', label: '🕐 Time' },
  { t: 'hours', label: '⏱️ Hours' },
  { t: 'location', label: '📍 Location' },
  { t: 'checkbox', label: '☑️ Checkbox' },
  // 🏷️ a title that groups the questions under it — asks nothing
  { t: 'heading', label: '🏷️ Section title' },
  // 🗓️ the client adds Mehndi, Jaggo, Reception… each with its own date, times and place → the lead's Pre-Events card
  { t: 'pre_events', label: '🗓️ Pre-Events' },
];

/** The event names a new Pre-Events question offers — the vendor edits them like dropdown options. */
const PRE_EVENT_NAMES = ['Mehndi', 'Jaggo', 'Maiyan', 'Sangeet', 'Haldi', 'Reception'];

/**
 * 🎉 One click that lays out the questions every event booking needs.
 *
 * Adding these one at a time meant six clicks and then typing six labels, every
 * time a vendor built a form. They arrive already labelled and already mapped to
 * the real lead columns, and every one of them is an ordinary field afterwards —
 * rename it, reorder it, change its options, delete it.
 *
 * There are two Time fields rather than one because an event has a start and an
 * end: the Bookings list shows a range, and the Hours field can work itself out
 * from the pair. One Time field would leave both half-filled.
 */
const EVENT_PRESET = [
  { type: 'dropdown', label: 'Type of Event', maps_to: 'event_type',
    options: ['Wedding', 'Engagement', 'Reception', 'Birthday', 'Corporate', 'Other'] },
  { type: 'date',     label: 'Date of Event',   maps_to: 'event_date' },
  { type: 'time',     label: 'Starting Time',   maps_to: 'timing_from' },
  { type: 'time',     label: 'Ending Time',     maps_to: 'timing_to' },
  { type: 'hours',    label: 'Hours of Coverage', maps_to: 'hours' },
  { type: 'location', label: 'Location',        maps_to: 'location' },
];


/**
 * 🧰 Starter question sets, one per trade.
 *
 * Every vendor asks a couple the same handful of things — when, where, how long,
 * how many — and then a few their own trade cares about. A DJ needs to know
 * whether there is a sound limit; a caterer needs dietary requirements; a florist
 * needs the venue's colours. Beginning from an empty form means each vendor
 * rediscovers that list by forgetting something on a real booking first.
 *
 * A preset is a starting point, not a cage: everything it adds is an ordinary
 * field afterwards — rename it, reorder it, delete it, add your own.
 *
 * The five shared fields at the top of each list are the ones the panel maps to
 * real columns, so a preset also wires the Bookings timing, date and location
 * without the vendor having to know those mappings exist.
 */
const CORE_EVENT = [
  { type: 'dropdown', label: 'Type of Event', maps_to: 'event_type',
    options: ['Wedding', 'Engagement', 'Reception', 'Birthday', 'Corporate', 'Other'] },
  { type: 'date', label: 'Date of Event', maps_to: 'event_date' },
  { type: 'time', label: 'Starting Time', maps_to: 'timing_from' },
  { type: 'time', label: 'Ending Time', maps_to: 'timing_to' },
  { type: 'location', label: 'Venue / Location', maps_to: 'location' },
];

/** 🖼️ The background watermark a preset brings (Raj, 2026-11-05 — one way: a preset sets the watermark; choosing a
 *  watermark never touches the questions). A preset names its own (`trade`, e.g. PPM Special → Photo & Video), else a
 *  preset named after a trade brings that trade's drawing, else ("Start blank") the watermark is left as it is. */
const presetTrade = (key) => FORM_PRESETS[key]?.trade ?? (key !== 'none' && PROFESSIONS[key] ? key : null);

const FORM_PRESETS = {
  /* ✏️ (Raj, 2026-10-28) a vendor whose trade isn't listed starts blank and builds their own, instead of loading
     someone else's trade and deleting it. Only the event date stays — every vendor needs it to quote — and the
     background watermark is left as it is (this is not a trade). */
  custom: { label: '✏️ Start blank — build my own', fields: [
    { type: 'date', label: 'Date of Event', maps_to: 'event_date' },
  ] },
  photographer: { label: '📷 Photographer', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Coverage', maps_to: 'hours' },
    { type: 'dropdown', label: 'Coverage needed', options: ['Ceremony only', 'Ceremony + Reception', 'Full day', 'Multiple days'] },
    { type: 'checkbox', label: 'Getting-ready coverage' },
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'text', label: 'Any must-have shots?' },
  ] },
  videographer: { label: '🎥 Videographer', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Coverage', maps_to: 'hours' },
    { type: 'dropdown', label: 'Film length', options: ['Highlight (3–5 min)', 'Feature (10–20 min)', 'Full ceremony + highlight'] },
    { type: 'checkbox', label: 'Drone footage' },
    { type: 'checkbox', label: 'Live streaming' },
    { type: 'text', label: 'Music preference' },
  ] },
  photo_video: { label: '🎬 Photo & Video', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Coverage', maps_to: 'hours' },
    { type: 'dropdown', label: 'What do you need?', options: ['Photos only', 'Videos only', 'Photos & Videos'] },
    { type: 'checkbox', label: 'Drone footage' },
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
  ] },
  dj: { label: '🎧 DJ', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Play', maps_to: 'hours' },
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'dropdown', label: 'Indoor or outdoor?', options: ['Indoor', 'Outdoor', 'Both'] },
    { type: 'checkbox', label: 'Venue has a sound limit' },
    { type: 'checkbox', label: 'Microphone needed for speeches' },
    { type: 'text', label: 'Music style / must-plays' },
    { type: 'text', label: 'Do-not-play list' },
  ] },
  makeup: { label: '💄 Make-Up Artist', fields: [
    ...CORE_EVENT,
    { type: 'number', label: 'How many people need makeup?' },
    { type: 'time', label: 'Time you need to be ready by' },
    { type: 'dropdown', label: 'Look', options: ['Natural', 'Soft glam', 'Full glam', 'Not sure yet'] },
    { type: 'checkbox', label: 'Hair styling as well' },
    { type: 'checkbox', label: 'Trial session wanted' },
    { type: 'text', label: 'Any allergies or sensitivities?' },
  ] },
  cake: { label: '🎂 Cake Maker', fields: [
    ...CORE_EVENT,
    { type: 'number', label: 'Number of servings' },
    { type: 'dropdown', label: 'Tiers', options: ['1', '2', '3', '4+', 'Not sure yet'] },
    { type: 'text', label: 'Flavours you would like' },
    { type: 'text', label: 'Dietary requirements (nut-free, gluten-free…)' },
    { type: 'checkbox', label: 'Delivery and setup needed' },
  ] },
  florist: { label: '💐 Florist', fields: [
    ...CORE_EVENT,
    { type: 'text', label: 'Colour palette' },
    { type: 'number', label: 'Bouquets needed (how many?)' },
    { type: 'number', label: 'Buttonholes needed (how many?)' },
    { type: 'checkbox', label: 'Ceremony arrangements' },
    { type: 'checkbox', label: 'Table centrepieces' },
    { type: 'checkbox', label: 'Setup and takedown' },
  ] },
  bartender: { label: '🍸 Bartender', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Service', maps_to: 'hours' },
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'dropdown', label: 'Bar type', options: ['Open bar', 'Cash bar', 'Limited (beer & wine)', 'Cocktails only'] },
    { type: 'checkbox', label: 'You are supplying the alcohol' },
    { type: 'checkbox', label: 'Glassware needed' },
  ] },
  caterer: { label: '🍽️ Caterer', fields: [
    ...CORE_EVENT,
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'dropdown', label: 'Service style', options: ['Plated', 'Buffet', 'Family style', 'Canapés / stations'] },
    { type: 'text', label: 'Dietary requirements' },
    { type: 'checkbox', label: 'Kids meals needed' },
    { type: 'checkbox', label: 'Staff for serving' },
    { type: 'checkbox', label: 'Venue has a kitchen' },
  ] },
  planner: { label: '📋 Wedding Planner', fields: [
    ...CORE_EVENT,
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'dropdown', label: 'What do you need?', options: ['Full planning', 'Partial planning', 'Day-of coordination'] },
    { type: 'text', label: 'Vendors already booked' },
    { type: 'text', label: 'Rough budget' },
  ] },
  musician: { label: '🎶 Musician / Singer', fields: [
    ...CORE_EVENT,
    { type: 'hours', label: 'Hours of Performance', maps_to: 'hours' },
    { type: 'dropdown', label: 'Where will you play?', options: ['Ceremony', 'Drinks reception', 'Dinner', 'Evening', 'More than one'] },
    { type: 'checkbox', label: 'Indoor' },
    { type: 'checkbox', label: 'PA system provided by venue' },
    { type: 'text', label: 'Song requests' },
  ] },
  /* 🚗 (Raj, 2026-10-26) a driver's "when and where" is a pick-up and a finish, not a venue — so this one spells out
     its own core fields; they map to the same Bookings columns (date, timing, hours, location, guests = passengers) */
  /* ⭐ PPM Special (Raj, 2026-10-30): the full Perfect Poses Media inquiry — everything his old Laravel form asked,
     rebuilt from the builder's own pieces, so any vendor can load it and change anything. Rules name their source
     question by "key"; loading points them at the real question ids. */
  ppm_special: { label: '⭐ PPM Special — Perfect Poses Media', trade: 'photo_video', fields: [
    { type: 'text', label: "Friend's Name (who referred you)", show_if: { field: '@heard', op: 'in', values: ['Friend'] } },
    { key: 'evt', type: 'dropdown', label: 'Type of Event', maps_to: 'event_type', required: true,
      options: ['Wedding', 'Pre-wedding', 'Engagement', 'Birthday party', 'Commercial'], allow_other: true, other_label: 'Other (type your event)' },
    { type: 'dropdown', label: 'Type of Service', required: true, options: ['Photos & Videos', 'Only Photos', 'Only Videos'] },
    { type: 'date', label: 'Date of Event', maps_to: 'event_date', required: true },
    { type: 'location', label: 'Location', maps_to: 'location', required: true, show_if: { field: 'evt', op: 'not_in', values: ['Pre-wedding'] } },
    { type: 'time', label: 'Starting Time', maps_to: 'timing_from', required: true, show_if: { field: 'evt', op: 'not_in', values: ['Pre-wedding'] } },
    { type: 'time', label: 'Ending Time', maps_to: 'timing_to', required: true, show_if: { field: 'evt', op: 'not_in', values: ['Pre-wedding'] } },
    { type: 'hours', label: 'Hours of Coverage', maps_to: 'hours', show_if: { field: 'evt', op: 'not_in', values: ['Pre-wedding'] } },
    { type: 'number', label: 'Est. Guests', maps_to: 'guests', required: true, show_if: { field: 'evt', op: 'not_in', values: ['Pre-wedding'] } },
    { type: 'dropdown', label: 'Coverage — Sides', required: true, options: ['Both Sides', 'Groom Side', 'Bride Side'], show_if: { field: 'evt', op: 'in', values: ['Wedding'] } },
    { type: 'heading', label: 'Pre-Wedding Shoot', show_if: { field: 'evt', op: 'in', values: ['Wedding', 'Engagement', OTHER] } },
    { type: 'dropdown', label: 'Pre-Wedding Shoot — Service', options: ['Photos & Videos', 'Only Photos', 'Only Videos'], show_if: { field: 'evt', op: 'in', values: ['Wedding', 'Engagement', OTHER] } },
    { type: 'date', label: 'Pre-Wedding Shoot — Date', show_if: { field: 'evt', op: 'in', values: ['Wedding', 'Engagement', OTHER] } },
    { type: 'heading', label: 'Getting Ready', show_if: { field: 'evt', op: 'in', values: ['Wedding'] } },
    { key: 'grb', type: 'checkbox', label: 'Bride — Getting Ready', maps_to: 'gr_bride', show_if: { field: 'evt', op: 'in', values: ['Wedding'] } },
    { type: 'location', label: 'Bride — Getting Ready Venue', maps_to: 'gr_bride_venue', show_if: { field: 'grb', op: 'in', values: [true] } },
    { key: 'grg', type: 'checkbox', label: 'Groom — Getting Ready', maps_to: 'gr_groom', show_if: { field: 'evt', op: 'in', values: ['Wedding'] } },
    { type: 'location', label: 'Groom — Getting Ready Venue', maps_to: 'gr_groom_venue', show_if: { field: 'grg', op: 'in', values: [true] } },
    { type: 'pre_events', label: 'Jaggo, Maiyaan, Reception, Engagement, Proposal & more', options: ['Jaggo', 'Choora', 'Maiyan', 'Reception'],
      pe_services: ['Photos & Videos', 'Only Photos', 'Only Videos'], show_if: { field: 'evt', op: 'in', values: ['Wedding', 'Engagement', OTHER] } },
  ] },
  transportation: { label: '🚗 Transportation', fields: [
    { type: 'dropdown', label: 'Type of Event', maps_to: 'event_type',
      options: ['Wedding', 'Engagement', 'Reception', 'Prom / Graduation', 'Corporate', 'Airport transfer', 'Other'] },
    { type: 'date', label: 'Date of Event', maps_to: 'event_date' },
    { type: 'time', label: 'Pick-up Time', maps_to: 'timing_from' },
    { type: 'time', label: 'Finish Time', maps_to: 'timing_to' },
    { type: 'hours', label: 'Hours of Service', maps_to: 'hours' },
    { type: 'location', label: 'Pick-up Address', maps_to: 'location' },
    { type: 'text', label: 'Drop-off Address' },
    { type: 'text', label: 'Stops along the way (ceremony, photos, reception…)' },
    { type: 'number', label: 'Number of passengers', maps_to: 'guests' },
    { type: 'number', label: 'Number of vehicles' },
    { type: 'dropdown', label: 'Vehicle type',
      options: ['Limousine', 'Stretch SUV', 'Luxury sedan', 'Vintage / classic car', 'Party bus', 'Shuttle / coach', 'Not sure yet'] },
    { type: 'dropdown', label: 'Trip', options: ['One way', 'Return trip', 'Hourly (as directed)'] },
    { type: 'checkbox', label: 'Decorations (ribbons, flowers)' },
    { type: 'checkbox', label: 'Red carpet service' },
    { type: 'text', label: 'Special requests' },
  ] },
  // ✨ any other trade (Muse F-24: "Other" had no preset) — the event, and what they would like from us
  other: { label: '✨ Other', fields: [
    ...CORE_EVENT,
    { type: 'number', label: 'Guest count (approx.)', maps_to: 'guests' },
    { type: 'text', label: 'What would you like from us?' },
  ] },
};

function FieldBuilder({ fields, setFields, onTrade }) {
  const dialog = useDialog();
  const uid = () => 'f' + Math.random().toString(36).slice(2, 8);

  // 🔗 Which real lead columns a field can feed. Fetched from the API so the
  // builder always offers exactly what the server will accept.
  const [cols, setCols] = useState([]);
  useEffect(() => { api.mappableColumns().then(d => setCols(d.columns || [])).catch(() => {}); }, []);

  // A new field starts unmapped, except a Time field: a form with start and end
  // times almost always means the booking's timing, and leaving them unmapped
  // silently left the Timing column on Bookings empty. First free slot wins, and
  // the vendor can still change or clear it below.
  const add = (t) => {
    let maps_to = '';
    if (t === 'time') {
      const taken = new Set(fields.map(f => f.maps_to).filter(Boolean));
      maps_to = !taken.has('timing_from') ? 'timing_from'
        : !taken.has('timing_to') ? 'timing_to' : '';
    }
    const options = t === 'dropdown' ? ['Option 1'] : t === 'pre_events' ? [...PRE_EVENT_NAMES] : [];
    setFields([...fields, { id: uid(), type: t, label: t === 'pre_events' ? 'Pre-Events' : '', required: false, maps_to, options }]);
  };
  const upd = (i, patch) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  // 🎉 Add the whole event group at once. A column already claimed by an
  // existing field is left claimed — the new field still appears, just
  // unmapped, so adding this twice can't quietly steal a mapping.
  /* 🎉 Adds the event questions the form does not have yet — a question it already asks (its date, its times) is not
     added twice (Muse F-24) — and works the Hours out from the start and end times, whichever were there before. */
  const addEventGroup = () => {
    const have = new Set(fields.map(f => f.maps_to).filter(Boolean));
    const added = EVENT_PRESET.filter(p => !(p.maps_to && have.has(p.maps_to))).map(p => ({
      id: uid(), type: p.type, label: p.label, required: false, maps_to: p.maps_to || '', options: p.options ? [...p.options] : [],
    }));
    const all = [...fields, ...added];
    const from = all.find(f => f.maps_to === 'timing_from'), to = all.find(f => f.maps_to === 'timing_to');
    setFields(all.map(f => (added.includes(f) && f.type === 'hours' && from && to ? { ...f, from_field: from.id, to_field: to.id } : f)));
  };
  /**
   * 🧰 Load a whole trade's starter questions.
   *
   * Replacing rather than appending, because a preset is "start me off as a
   * florist", not "add eleven more fields to what I already have" — but only
   * after asking, since a vendor who has already built a form would lose it.
   *
   * Mappings are claimed only where free, so loading a second preset on top
   * can't silently steal a column another field already feeds.
   */
  const loadPreset = async (key) => {
    const preset = FORM_PRESETS[key];
    if (!preset) return;
    const tradeKey = presetTrade(key);
    const trade = tradeKey && PROFESSIONS[tradeKey]?.label;
    if (fields.length && !await dialog.confirm(
      `This replaces the ${fields.length} question${fields.length === 1 ? '' : 's'} you have now. You can edit everything afterwards.${trade ? ` The background watermark becomes ${trade}.` : ''} The Section 2 heading goes back to the default.`,
      { title: `Load the ${preset.label} questions?`, okLabel: 'Load them', danger: false }
    )) return;
    const taken = new Set();
    const loaded = preset.fields.map(p => {
      const free = p.maps_to && !taken.has(p.maps_to);
      if (free) taken.add(p.maps_to);
      return {
        id: uid(), type: p.type, label: p.label,
        /* 📅 the event date is the one answer every vendor needs to quote at
           all — a preset that left it optional let inquiries arrive dateless
           (QA run over all 11 presets, 2026-10-10) */
        required: p.required ?? (free && p.maps_to === 'event_date'),
        maps_to: free ? p.maps_to : '',
        options: p.options ? [...p.options] : [],
        ...(p.allow_other ? { allow_other: true, other_label: p.other_label || '' } : {}),
        ...(p.pe_services ? { pe_services: [...p.pe_services] } : {}),
        ...(p.add_label ? { add_label: p.add_label } : {}),
      };
    });
    /* ⏱️ an Hours question works itself out from the start and end times —
       but only if it is LINKED to them. Every preset left it on "Client types
       it", so the hours never calculated and clients typed anything there. */
    const fromId = loaded.find(f => f.maps_to === 'timing_from')?.id;
    const toId = loaded.find(f => f.maps_to === 'timing_to')?.id;
    for (const f of loaded) {
      if (f.type === 'hours' && fromId && toId) { f.from_field = fromId; f.to_field = toId; }
    }
    /* 🔀 a preset's "show only when…" names its source question by a key — point each rule at that question's id */
    const idOfKey = Object.fromEntries(preset.fields.map((p, x) => [p.key, loaded[x].id]).filter(([k]) => k));
    for (const [x, p] of preset.fields.entries()) {
      if (!p.show_if) continue;
      const src = String(p.show_if.field).startsWith('@') ? p.show_if.field : idOfKey[p.show_if.field];
      if (src) loaded[x].show_if = { ...p.show_if, field: src, values: [...p.show_if.values] };
    }
    setFields(loaded);
    // 🖼️ the preset's own drawing goes behind the form (presetTrade) — loading "Florist" or PPM Special leaves
    // their drawing, not whatever trade was chosen last time
    if (onTrade && tradeKey) onTrade(tradeKey);
  };

  const del = async (i) => {
    const name = fields[i]?.label?.trim();
    if (!await dialog.confirm(name ? `"${name}" will be removed from your form.` : 'This question will be removed from your form.', { title: 'Delete this question?', okLabel: 'Delete' })) return;
    const gone = fields[i]?.id;
    setFields(fields.filter((_, idx) => idx !== i).map(o => (o.show_if?.field === gone ? { ...o, show_if: null } : o)));
  };
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return;
    const copy = [...fields]; [copy[i], copy[j]] = [copy[j], copy[i]]; setFields(copy);
  };

  return (
    <div>
      {/* 🧰 Start from a trade rather than an empty form. Every vendor asks the
          same handful of things and then a few their own trade cares about;
          rediscovering that list by forgetting something on a real booking is a
          poor way to learn it. */}
      <div className="fb-preset-row">
        <span className="fb-preset-label">🧰 Start from a preset</span>
        <select className="fb-preset-sel" value="" onChange={e => { loadPreset(e.target.value); e.target.value = ''; }}>
          <option value="">Choose your trade…</option>
          {Object.entries(FORM_PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} · {v.fields.length} question{v.fields.length === 1 ? '' : 's'}</option>
          ))}
        </select>
        <span className="fb-preset-hint">then edit, reorder or remove anything</span>
      </div>

      {/* add field buttons — the Event group sits apart because it adds six at
          once, and a vendor shouldn't have to guess that from the label */}
      <div className="fb-add-row">
        <button className="refresh fb-preset" onClick={addEventGroup}
          title="Adds Type of Event, Date, Starting Time, Ending Time, Hours and Location — all editable">
          + 🎉 Event
        </button>
        <span className="fb-add-sep" />
        {FIELD_TYPES.map(ft => (
          <button key={ft.t} className="refresh fb-add-btn" onClick={() => add(ft.t)}>+ {ft.label}</button>
        ))}
      </div>

      {fields.length === 0 && <p className="sub">No custom fields yet. Add fields above ☝️</p>}

      {/* field list */}
      {fields.map((f, i) => (
        <div className="u-background-panel-2 u-border-1px-solid-line u-border-radius-10px u-padding-12px u-margin-bottom-10px" key={f.id}>
          <div className="u-display-flex u-align-items-center u-gap-8px u-margin-bottom-8px">
            <span className="u-font-size-12px u-color-muted">{FIELD_TYPES.find(x => x.t === f.type)?.label}</span>
            <div className="u-margin-left-auto u-display-flex u-gap-4px">
              <button className="refresh u-padding-3px-8px u-font-size-11px" onClick={() => move(i, -1)}>↑</button>
              <button className="refresh u-padding-3px-8px u-font-size-11px" onClick={() => move(i, 1)}>↓</button>
              <button className="refresh u-padding-3px-8px u-font-size-11px u-color-red" onClick={() => del(i)}>🗑️</button>
            </div>
          </div>

          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-8px u-width-100pct u-font-size-13px" placeholder="Field label (e.g. Event Type)" value={f.label} onChange={e => upd(i, { label: e.target.value })} />

          {/* dropdown options */}
          {(f.type === 'dropdown' || f.type === 'pre_events') && (
            <div className="u-margin-top-8px">
              {f.type === 'pre_events' && <p className="fb-hint">🗓️ The event names clients can pick — they can also type their own.</p>}
              {f.options.map((opt, oi) => (
                <div className="u-display-flex u-gap-6px u-margin-bottom-5px" key={oi}>
                  <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-8px u-width-100pct u-font-size-12px" value={opt} onChange={e => upd(i, { options: f.options.map((o, x) => x === oi ? e.target.value : o) })} />
                  <button className="refresh u-padding-4px-9px u-font-size-11px" onClick={() => upd(i, { options: f.options.filter((_, x) => x !== oi) })}>✕</button>
                </div>
              ))}
              <button className="refresh u-padding-4px-10px u-font-size-11px" onClick={() => upd(i, { options: [...f.options, 'Option ' + (f.options.length + 1)] })}>+ option</button>
            </div>
          )}

          {/* ✍️ optional: the client may type an answer that isn't in the list */}
          {f.type === 'dropdown' && (
            <label className="fb-check">
              <input type="checkbox" checked={!!f.allow_other} onChange={e => upd(i, { allow_other: e.target.checked })} />
              ✍️ Let clients type their own answer (adds “Other — type your own”)
            </label>
          )}

          {/* 🗓️ Pre-Events: an optional fixed list for each pre-event's Service, and the button's wording */}
          {f.type === 'pre_events' && (
            <div className="fb-pair">
              <div>
                <label className="fb-label">Service choices (optional) 🎬</label>
                <ListInput value={f.pe_services} placeholder="Photos & Videos, Only Photos" onChange={v => upd(i, { pe_services: v })} />
              </div>
              <div>
                <label className="fb-label">Button wording</label>
                <input className="fb-input" value={f.add_label || ''} placeholder="Add Pre-Event" onChange={e => upd(i, { add_label: e.target.value })} />
              </div>
            </div>
          )}

          {/* ⏱️ an Hours field can calculate itself from two Time fields on the
              same form. Only Time fields are offered, and only ones that exist. */}
          {f.type === 'hours' && (() => {
            const times = fields.filter(x => x.type === 'time' && x.label);
            const named = (t) => (times.filter(x => x.label.trim().toLowerCase() === t.label.trim().toLowerCase()).length > 1
              ? `${t.label} (question ${fields.indexOf(t) + 1})` : t.label);
            if (!times.length) return (
              <p className="fb-hint">
                💡 Add two <strong>🕐 Time</strong> fields to calculate hours automatically.
              </p>
            );
            return (
              <div className="fb-pair">
                <div>
                  <label className="fb-label">Calculate from ⏱️</label>
                  <select className="fb-select" value={f.from_field || ''}
                    onChange={e => upd(i, { from_field: e.target.value })}>
                    <option value="">Client types it</option>
                    {times.map(t => <option key={t.id} value={t.id}>{named(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fb-label">…until</label>
                  <select className="fb-select" value={f.to_field || ''}
                    onChange={e => upd(i, { to_field: e.target.value })}>
                    <option value="">Client types it</option>
                    {times.filter(t => t.id !== f.from_field).map(t => <option key={t.id} value={t.id}>{named(t)}</option>)}
                  </select>
                </div>
              </div>
            );
          })()}

          {f.type !== 'heading' && (
            <label className="fb-required">
              <input type="checkbox" checked={f.required} onChange={e => upd(i, { required: e.target.checked })} /> Required
            </label>
          )}

          <ShowIfEditor f={f} index={i} fields={fields} onChange={rule => upd(i, { show_if: rule })} />

          {/* 📋 "Show on leads" — fills the EVENT column of the leads table.
              Only one field can, so ticking this unticks whichever field had it.
              It's the same maps_to mechanism as the dropdown below, surfaced as a
              checkbox because filling that column is what vendors actually ask for. */}
          {cols.some(c => c.key === 'event_type' && c.types.includes(f.type)) && (
            <label className="fb-check">
              <input
                type="checkbox"
                checked={f.maps_to === 'event_type'}
                onChange={async e => {
                  const on = e.target.checked;
                  const owner = fields.find((o, idx) => idx !== i && o.maps_to === 'event_type');
                  if (on && owner && !await dialog.confirm(
                    `"${owner.label || 'Another question'}" fills the Event column now. Show "${f.label || 'this question'}" there instead?`,
                    { title: 'Only one question can fill the Event column', okLabel: 'Use this one', danger: false })) return;
                  setFields(fields.map((o, idx) => {
                    if (idx === i) return { ...o, maps_to: on ? 'event_type' : '' };
                    // only one field may own the column — release it from any other
                    return on && o.maps_to === 'event_type' ? { ...o, maps_to: '' } : o;
                  }));
                }}
              />
              Show in the <strong>Event</strong> column on Leads
            </label>
          )}

          {/* 🔗 optional link to a real lead column, so the answer shows in
              Bookings / Calendar / the lead details rather than only in the
              custom-answers list. Only columns this field's type can fill.
              event_type is excluded — the checkbox above owns that one, so the
              same setting never appears in two controls. */}
          {cols.some(c => c.key !== 'event_type' && c.types.includes(f.type)) && (
            <div className="fb-map">
              <label className="fb-label">
                Where should this answer appear? 🔗
              </label>
              <select
                className="fb-select"
                value={f.maps_to === 'event_type' ? '' : (f.maps_to || '')}
                disabled={f.maps_to === 'event_type'}
                onChange={e => upd(i, { maps_to: e.target.value })}
              >
                <option value="">📋 In the answers list only</option>
                {cols.filter(c => c.key !== 'event_type' && c.types.includes(f.type)).map(c => {
                  // one column can only be fed by one field
                  const taken = fields.some((o, oi) => oi !== i && o.maps_to === c.key);
                  return <option key={c.key} value={c.key} disabled={taken}>
                    ⭐ {c.label}{taken ? ' — used by another field' : ''}
                  </option>;
                })}
              </select>
              <p className="fb-hint">
                {f.maps_to === 'event_type'
                  ? <>📋 Already showing in the <strong>Event</strong> column — untick above to change this.</>
                  : f.maps_to
                    ? <>⭐ Shows as <strong>{cols.find(c => c.key === f.maps_to)?.label}</strong> on the lead, and in Bookings, Calendar and contracts.</>
                    : <>📋 Saved with the inquiry and shown in the lead&apos;s answers list. Pick a field above to also show it on the lead card.</>}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function InqFormSettings() {
  /* 🧑‍💼 a preset loaded here sets the vendor's trade when the form is saved (Contract setup's sample follows it) */
  const [chosenTrade, setChosenTrade] = useState(null);
  // 🔗 The vendor's public handle. It comes from the server rather than the
  // stored session because a vendor who logged in before handles existed has a
  // session that predates the field, and their link would render "undefined".
  const [handle, setHandle] = useState('');
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.myInquirySettings()
      .then(d => { setS(d.settings); setHandle(d.slug || ''); })
      .catch(() => setS({}));       // show the form, not an endless spinner
  }, []);

  async function save() {
    setMsg('');
    setSaving(true);
    try {
      await api.saveInquirySettings(s);
      if (chosenTrade) { await api.setProfession(chosenTrade); setChosenTrade(null); }
      // Re-read from the server rather than trusting the local copy. A save that
      // half-succeeded, or a second tab editing the same form, would otherwise
      // leave the panel showing something the public form never received —
      // "✅ Saved" while the two quietly disagree.
      const fresh = await api.myInquirySettings();
      setS(fresh.settings);
      setMsg('✅ Saved');
      setTimeout(() => setMsg(''), 2500);
    }
    catch (e) { setMsg('⚠️ ' + e.message); }
    setSaving(false);
  }
  if (!s) return <div className="loading">Loading…</div>;

  return (
    <div className="u-max-width-560px">
      <div className="table-wrap u-padding-22px">
        <h2 className="u-margin-top-0">🎨 Customize your inquiry form {msg && <span className="u-font-size-13px u-color-green">{msg}</span>}</h2>
        <p className="sub inq-link-row">
          Your link: <b className="inq-link">{handle ? inquiryUrl(handle) : '…'}</b> 🔗
          {' · '}
          {/* opens the live public form, so a vendor can check a change landed
              without hunting for the URL. Cache-busted because the page they
              last looked at may still be open in another tab. */}
          <a href={`${inquiryUrl(handle)}?v=${Date.now()}`} target="_blank" rel="noreferrer"
            className="inq-preview">
            👁️ Preview
          </a>
        </p>

        <label className="u-font-size-12px u-color-muted">Brand name</label>
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.brand_name || ''} onChange={e => setS({ ...s, brand_name: e.target.value })} />

        <div className="if-brand-row">
          <div>
            <label className="u-font-size-12px u-color-muted u-display-block">Brand color</label>
            <div className="u-display-flex u-align-items-center u-gap-8px">
              <input className="u-width-60px u-height-36px u-border-none u-background-transparent u-cursor-pointer" type="color" value={s.brand_color} onChange={e => setS({ ...s, brand_color: e.target.value })} />
              <HexField value={s.brand_color} onChange={hex => setS({ ...s, brand_color: hex })} />
            </div>
          </div>
          <div className="if-wm">
            <label className="u-font-size-12px u-color-muted u-display-block u-margin-bottom-4px">Background watermark</label>
            <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.background || 'none'} onChange={e => setS({ ...s, background: e.target.value })}>
              {Object.entries(PROFESSIONS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
        </div>

        <label className="u-font-size-12px u-color-muted u-display-block u-margin-top-12px">Intro text</label>
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.intro_text || ''} onChange={e => setS({ ...s, intro_text: e.target.value })} />

        <label className="u-font-size-12px u-color-muted u-display-block u-margin-top-10px">Intro link (optional — makes intro clickable) 🔗</label>
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.intro_link || ''} placeholder="https://yoursite.com" onChange={e => setS({ ...s, intro_link: e.target.value })} />

        {/* 🎨 Theme + font */}
        <div className="u-display-flex u-gap-12px u-margin-top-14px">
          <div className="u-flex-1">
            <label className="u-font-size-12px u-color-muted">Theme</label>
            <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.theme || 'ivory'} onChange={e => setS({ ...s, theme: e.target.value })}>
              <option value="ivory">Ivory (calm, classic)</option>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="elegant">Elegant</option>
              <option value="bold">Bold</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div className="u-flex-1">
            <label className="u-font-size-12px u-color-muted">Font</label>
            <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.font || 'Inter'} onChange={e => setS({ ...s, font: e.target.value })}>
              <option value="Inter">Inter</option>
              <option value="Poppins">Poppins</option>
              <option value="Playfair Display">Playfair</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Lora">Lora</option>
            </select>
          </div>
        </div>

        {/* 🏗️ Section 2 builder */}
        <div className="u-border-top-1px-solid-line u-margin-20px-0-14px u-padding-top-16px">
          <label className="u-font-size-12px u-color-muted">Section 2 heading</label>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" value={s.details_heading || ''} placeholder="Event Details" onChange={e => setS({ ...s, details_heading: e.target.value })} />
          <h3 className="u-margin-16px-0-4px">🏗️ Inquiry Details fields</h3>
          <p className="sub u-margin-bottom-12px">Build your custom questions ⬇️</p>
          <FieldBuilder
            fields={s.custom_fields || []}
            setFields={(f) => setS(prev => ({ ...prev, custom_fields: f }))}
            onTrade={(key) => { setS(prev => ({ ...prev, background: key, details_heading: '' })); setChosenTrade(key); }}
          />
        </div>

        <button className="refresh u-margin-top-16px u-width-100pct u-background-teal u-color-acc-ink" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : msg || '💾 Save form settings'}
        </button>
      </div>
    </div>
  );
}

/**
 * A hex code beside the colour swatch.
 *
 * Holds its own draft while typing, because a half-typed code is not a colour:
 * committing every keystroke would push "#1", "#12", "#123" upward and repaint
 * the form through three wrong shades on the way to the right one. The draft is
 * released on blur, so an abandoned or malformed entry reverts rather than
 * sitting there looking accepted.
 */
function HexField({ value, onChange }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value || '');

  function type(raw) {
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = '#' + v;         // pasting 'aabbcc' should work
    v = v.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7);
    setDraft(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
  }

  return (
    <input
      value={shown}
      onChange={e => type(e.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="#000000"
      spellCheck={false}
      aria-label="Brand colour hex code"
      style={{
        width: 100, height: 36, boxSizing: 'border-box',
        padding: '0 10px', borderRadius: 9,
        border: '1px solid var(--line)', background: 'var(--panel)',
        color: 'var(--text)', fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }} />
  );
}
