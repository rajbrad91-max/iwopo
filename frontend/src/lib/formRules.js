/**
 * 🔀 Form rules (2026-10-30) — what the inquiry form builder's optional extras mean, in one place.
 *
 *   • show_if  — "show this question only when…": { field, op: 'in' | 'not_in', values: [...] }
 *                field is another question's id, or '@heard' / '@role' (the built-in contact questions).
 *                A checkbox source uses values [true] = "ticked".
 *   • allow_other — a dropdown also offers "Other (type your own)"; the typed words ARE the answer.
 *                In a show_if, OTHER stands for "anything typed there".
 *
 * Every rule is optional: a question without one behaves exactly as before. The server applies the same rules
 * (backend/src/lib/formRules.js) so an answer to a hidden question never reaches a lead.
 */
export const OTHER = '__other__';

/** The answer a rule looks at: a built-in contact question or another question on the form. */
function sourceValue(src, answers, p) {
  if (src === '@heard') return p?.heard || '';
  if (src === '@role') return p?.role || '';
  return answers?.[src];
}

/** A dropdown answer the client typed themselves ("Other"). */
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

/**
 * The questions to show right now, in form order. A question whose source question is itself hidden is hidden
 * too (the builder only offers EARLIER questions as a source, so one pass in order is enough). An incomplete
 * rule — no source, no values, or a source question that was deleted — shows the question, never loses it.
 */
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

/** 🗓️ One pre-event as the lead stores it (the lead page's 🗓️ Pre-Events card uses the same shape). */
export const BLANK_PRE_EVENT = { name: '', date: '', from: '', to: '', location: '', guests: '', service: '' };
