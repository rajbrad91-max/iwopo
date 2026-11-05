import { leadQuestions, shownFields } from './formRules';
import { fmtTime, fmtDateTime } from './api';
import { phoneProblem } from './phone';

/** 🗓️ Answers the main event card shows on its first lines (LeadCards), so its details list doesn't repeat them. */
const IN_EVENT_CARD = new Set(['event_type', 'event_date', 'timing_from', 'timing_to', 'hours', 'location', 'guests']);

/**
 * 🗂️ What the lead and booking pages show about a lead (moved from the lead page, 2026-11-05 — the booking page shows
 * a lead the same way): the main event, every other answer the vendor's form asked about it, the answers that sit
 * with the contact, and the contact strip's own lines. `cfg` is the vendor's inquiry-form settings.
 */
export function leadOverview(lead, cfg) {
  /* 🗓️ The main event for the event cards — the lead's own columns, and the times from the form's
     Starting/Ending Time questions (they map to timing_from / timing_to and live in the answers). */
  const formFields = leadQuestions(lead.form_snapshot, cfg?.custom_fields, lead.custom_data);   // 🧾 the same questions Edit Details shows
  const answerFor = (key) => { const f = formFields.find(x => x.maps_to === key); return f ? (lead.custom_data || {})[f.id] : undefined; };
  const mainEvent = (lead.event_date || lead.event_type) ? {
    name: lead.event_type || 'Main event', date: lead.event_date,
    from: answerFor('timing_from') || '', to: answerFor('timing_to') || '',
    hours: answerFor('hours') || (lead.hours ? `${lead.hours} hrs` : ''),
    location: lead.location || '', guests: lead.guests || '',
  } : null;

  /* 🎉 The main event card's details — driven entirely by the vendor's own inquiry form.
  A fixed list of rows meant a DJ saw "Bride Getting Ready ❌ No" for a
  question their form never asked. Rows use the vendor's own wording.
  An empty text answer stays hidden. A checkbox is always shown,
  because leaving it unticked is an answer. */
  function answerRows() {
    const cd = lead.custom_data || {};
    const has = (v) => v !== '' && v !== null && v !== undefined && v !== false;

    // The calendar day and the clock the client typed. The date column
    // arrives as "2027-03-14T00:00:00.000Z" and a time column as "16:00"
    // or "16:00:00". The day is read off the string so no timezone can
    // move it. The time follows this vendor's 12h/24h preference and is
    // not shifted either.
    const ymd = (v) => {
      const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v);
    };

    const valueFor = (f) => {
      const col = f.maps_to && lead[f.maps_to];
      const raw = cd[f.id];
      // Unticked is "No". A mapped yes/no column is used only when the
      // form never stored the tick itself.
      if (f.type === 'checkbox') {
        const on = raw === true || raw === false ? raw : col === true;
        return on ? '✅ Yes' : '❌ No';
      }
      // Hours is stored twice: the sentence the client saw ("6 hrs",
      // "6 hrs 30 min") and a whole-number column for bookings. The
      // column drops the words and rounds the minutes away, so the lead
      // shows the sentence.
      if (f.type === 'hours') {
        if (has(raw)) return String(raw);
        if (has(col) || col === 0) {
          const n = Number(col);
          if (!n) return '0 min';
          return `${n} hr${n === 1 ? '' : 's'}`;
        }
        return null;
      }
      const v = has(col) ? col : raw;
      if (!has(v)) return null;
      if (v === true) return '✅ Yes';
      if (f.type === 'date') return ymd(v);
      if (f.type === 'time') return fmtTime(v);
      return String(v);
    };

    /* 🔀 only the questions this client was actually shown — the same rules the form used. A Birthday lead never
       had Getting Ready, so it shows no "Getting Ready ❌ No"; a wedding where the box was left unticked still says No. */
    return shownFields(formFields, cd, { heard: lead.heard, role: lead.role })
      .filter(f => !(mainEvent && IN_EVENT_CARD.has(f.maps_to)))   // shown on the main event card already
      .filter(f => f.type !== 'pre_events')   // the pre-events have their own card
      .map(f => ({ f, row: [f.label, valueFor(f)] }))
      .filter(({ row }) => row[1] !== null);
  }
  /* 👤 a question that follows on from how they found you or who they are (Friend → "Friend's name") sits with the
     contact; every other answer with the main event */
  const aboutContact = (f) => ['@heard', '@role'].includes(f.show_if?.field);
  const answered = answerRows();
  // 🤝 the question shown when they heard from a friend (or a referral) reads simply "Referred by"
  const referral = (f) => f.show_if?.field === '@heard' && (f.show_if.values || []).some(v => /friend|refer/i.test(String(v)));
  const contactAnswers = answered.filter(({ f }) => aboutContact(f)).map(({ f, row }) => [referral(f) ? 'Referred by' : row[0], row[1]]);
  // "Referred by …" already says how they found you, so "via Friend" is not repeated beside it
  const referredBy = answered.some(({ f }) => aboutContact(f) && referral(f));
  const eventDetails = answered.filter(({ f }) => !aboutContact(f)).map(({ row }) => row);
  const showMainCard = !!mainEvent || eventDetails.length > 0;

  return {
    mainEvent, eventDetails, contactAnswers, showMainCard,
    contactItems: [['1f4e7', lead.email],
      ['1f4de', lead.phone && phoneProblem(lead.phone) ? `${lead.phone}  ⚠️ not a valid number — please correct it` : lead.phone],
      ['1f4f7', lead.instagram]],
    contactMeta: [['1f50e', lead.heard && !referredBy && `via ${lead.heard}`], ['1f4e5', lead.created_at ? fmtDateTime(lead.created_at, { zone: true }) : null]],
  };
}
