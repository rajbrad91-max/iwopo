/**
 * 🔀 Form rules on the server (2026-10-30) — the SAME rules as frontend/src/lib/formRules.js, so what a lead
 * keeps never depends on what a browser chose to send:
 *   • show_if      — an answer to a question that was hidden is dropped, never saved;
 *   • heading      — a section title asks nothing, so it has no answer;
 *   • pre_events   — the "Add pre-event" block's list goes to the lead's own pre_events (the 🗓️ card, the
 *                    contract's schedule), not into the answers bag.
 * A form that uses none of these comes out exactly as it went in.
 */
export const OTHER = '__other__';

function sourceValue(src, answers, p) {
  if (src === '@heard') return p?.heard || '';
  if (src === '@role') return p?.role || '';
  return answers?.[src];
}

export function isOtherAnswer(fld, v) {
  return !!fld?.allow_other && v !== undefined && v !== null && v !== '' && !(fld.options || []).includes(v);
}

function ruleHolds(rule, fields, answers, p) {
  const v = sourceValue(rule.field, answers, p);
  const src = fields.find(x => x.id === rule.field);
  const values = rule.values || [];
  const hit = src?.type === 'checkbox'
    ? v === true
    : values.includes(v) || (values.includes(OTHER) && isOtherAnswer(src, v));
  return rule.op === 'not_in' ? !hit : hit;
}

/** The questions shown for these answers, in form order (see the frontend copy for the reasoning). */
export function shownFields(fields, answers, p) {
  const list = Array.isArray(fields) ? fields : [];
  const shown = new Set();
  for (const [at, f] of list.entries()) {
    const r = f.show_if;
    const complete = r && r.field && Array.isArray(r.values) && r.values.length;
    if (!complete) { shown.add(f.id); continue; }
    if (!String(r.field).startsWith('@')) {
      const src = list.find(x => x.id === r.field);
      // a source that was deleted, or moved BELOW this question, can't decide it — the question shows
      if (!src || list.indexOf(src) > at) { shown.add(f.id); continue; }
      if (!shown.has(src.id)) continue;
    }
    if (ruleHolds(r, list, answers, p)) shown.add(f.id);
  }
  return list.filter(f => shown.has(f.id));
}

/**
 * The answers a lead keeps, and the pre-events it gets, for this vendor's form definition.
 * `p` holds the built-in contact answers ({ heard, role }) a rule may look at.
 */
export function applyFormRules(fields, customData, p) {
  const cd = customData && typeof customData === 'object' && !Array.isArray(customData) ? { ...customData } : {};
  const list = Array.isArray(fields) ? fields : [];
  const shown = new Set(shownFields(list, cd, p).map(f => f.id));
  const preEvents = [];
  for (const f of list) {
    if (!shown.has(f.id) || f.type === 'heading') { delete cd[f.id]; continue; }
    if (f.type === 'pre_events') {
      if (Array.isArray(cd[f.id])) preEvents.push(...cd[f.id]);
      delete cd[f.id];
    }
  }
  return { custom_data: cd, pre_events: preEvents };
}
