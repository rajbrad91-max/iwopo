/**
 * 📝 The contract template editor: sections, placeholders, look and preview.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import AutoReleaseToggle from '../../components/AutoReleaseToggle';
import { useAutoRelease } from '../../lib/useAutoRelease';
import { contractSampleFor } from '../../lib/contractSamples';
import { useDialog } from '../../lib/dialog.jsx';
import { api, fmtMoney } from '../../lib/api';
import { professionLabel } from '../../lib/professions';

/**
 * ⚠️ Set by the contract editor while it holds unsaved work, and read by the
 * sidebar before it navigates away. The two live in different components and
 * the parent cannot reach the child's state; this is the narrowest bridge
 * that solves it.
 * Returns true to allow the navigation, false to stay put.
 */
export let csLeaveGuard = null;

/**
 * 📐 Blocks the system builds from the booking itself — a details table, the
 * running order of the day, what the package includes. A vendor cannot type
 * these into a template because they differ per client; they drop the name in
 * and it is filled at send time. A block with nothing to show removes its own
 * heading rather than leaving one standing over a gap.
 */
const CT_BLOCKS = [
  '{{booking_details}}', '{{coverage_schedule}}', '{{deliverables}}',
  '{{services_summary}}', '{{crew}}',
];

const CT_PLACEHOLDERS = ['{{client_name}}', '{{client_email}}', '{{client_phone}}', '{{deposit_percent}}', '{{event_type}}', '{{event_date}}', '{{location}}', '{{hours}}', '{{guests}}', '{{package_name}}', '{{total_cost}}', '{{deposit}}', '{{balance}}', '{{today_date}}', '{{company_name}}'];

// 👁️ Stand-in values so a template can be previewed before any client exists.
// Deliberately obvious rather than realistic, so nothing here is mistaken for a
// real booking, while still showing the shape and length of a filled contract.
/**
 * ⚠️ Every placeholder the system knows. Anything else a vendor types is a
 * typo — {{clinet_name}} saves happily and reaches the client as raw text.
 * Checked at save time, not blocked: a vendor may have a reason, and
 * refusing the save would be worse than warning about it.
 */
const CT_KNOWN = new Set([...CT_PLACEHOLDERS, ...CT_BLOCKS].map(p => p.slice(2, -2)));

export function unknownPlaceholders(text) {
  const t = String(text || '');
  const found = t.match(/\{\{(\w+)\}\}/g) || [];
  const bad = found.map(f => f.slice(2, -2)).filter(k => !CT_KNOWN.has(k));

  /* ⚠️ An UNCLOSED one — {{client_name with no closing braces — matches
     nothing above and reaches the client as raw text just as a typo does.
     Counting braces finds it: more {{ than }} means one was left open. */
  const opens = (t.match(/\{\{/g) || []).length;
  const closes = (t.match(/\}\}/g) || []).length;
  if (opens > closes) bad.push('… one is missing its closing }}');

  return [...new Set(bad)];
}

const CT_SAMPLE = {
  client_name: 'Priya & Arjun', client_email: 'priya@example.com',
  event_type: 'Wedding', event_date: '29 October 2028',
  location: 'Abbotsford, BC', hours: '8', guests: '150',
  package_name: 'Standard Package', deposit_percent: '30%',
  /* ⚠️ en-GB, to match the event_date sample above. Leaving this to the
     browser's locale meant a contract showed "29 October 2028" and
     "October 7, 2026" in the same breath. */
  today_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  company_name: 'Your Studio',
  /* ⚠️ The five BLOCKS. Built from the real booking when a contract is sent,
     so there is nothing to show here — but showing the raw placeholder makes
     the preview look broken. A plain description of what will appear is
     honest and does not pretend to be data. */
  booking_details: '[ the booking table — filled from their booking ]',
  coverage_schedule: '[ the running order of the day — filled from the booking ]',
  deliverables: '[ what they receive — filled from the package ]',
  services_summary: '[ what the package includes — filled from the package ]',
  crew: '[ the crew assigned — filled from the booking ]',
};

function fillSample(text, overrides) {
  /* ⚠️ The template's OWN settings win over the sample. CT_SAMPLE stands in
     for a client's details — it must not contradict what this template says
     it is for, which is how a Reception template previewed as a Wedding. */
  // 💱 example amounts in the vendor's own currency (fmtMoney), as a real contract shows them
  const values = { ...CT_SAMPLE, total_cost: fmtMoney(4200), deposit: fmtMoney(1260), balance: fmtMoney(2940), ...(overrides || {}) };
  // {{deposit_percent}} reads "30%" — as on a real contract, a "%" written after it is not printed twice (Muse F-11)
  return String(text || '').replace(/\{\{deposit_percent\}\}\s*%/g, '{{deposit_percent}}').replace(/\{\{(\w+)\}\}/g, (m, k) =>
    values[k] !== undefined && values[k] !== '' ? values[k] : m);
}

/**
 * A rough preview of a template that has not been saved and has no lead yet.
 *
 * This deliberately does NOT go through the server's builder: the vendor is
 * editing wording that hasn't been saved, for no particular booking, so there
 * is nothing real to build from. It approximates the same HTML shape with
 * sample values instead.
 *
 * It is an approximation, and the label above it says so. The generated
 * blocks — the booking table, the schedule, the deliverables — cannot appear
 * here because they come from a lead; they show as a placeholder line rather
 * than silently rendering as nothing, which would read as though the section
 * were empty. The real thing is the Preview Contract button on a lead.
 */
function esc(x) {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* 🎨 a contract template's look — the same choices the server accepts (contracts.js) */
const CT_ACCENTS = [['gold', 'Gold'], ['navy', 'Navy'], ['black', 'Black'], ['rose', 'Rose'], ['emerald', 'Emerald'], ['plum', 'Plum']];
const CT_FONTS = [['classic', 'Classic — Lora + Open Sans'], ['modern', 'Modern — Inter'], ['traditional', 'Traditional — Georgia']];
function templateAssembled(t) {
  const head = (t.header || '').trim();
  const headHtml = head
    ? `<table class="ct-headband"><tbody><tr><td class="ct-hb-info"><p>${esc(head).split('\n').join('<br>')}</p></td></tr></tbody></table>`
    : '';
  const secs = Array.isArray(t.sections) ? t.sections : [];
  const title = `<h1 class="ct-doc-title">${esc(t.name || 'Service Agreement')}</h1>`;

  const middle = secs
    .filter(x => (x.title || '').trim() || (x.text || '').trim())
    .map(x => {
      const raw = (x.text || '').trim();
      const isBlock = /^\{\{\w+\}\}$/.test(raw);
      const bodyHtml = isBlock
        ? `<p class="cs-preview-blocknote">— ${esc(raw)} fills in from the booking —</p>`
        : esc(raw).split(/\n\s*\n+/).filter(Boolean).map(par => `<p>${par.split('\n').join('<br>')}</p>`).join('');
      const init = x.initial
        ? '<table class="ct-init"><tbody><tr><td class="ct-init-label">Client Initials</td>'
          + '<td class="ct-init-line"><span class="cs-preview-init">Tap to initial</span></td></tr></tbody></table>'
        : '';
      const h = (x.title || '').trim();
      return `<div class="ct-sec">${h ? `<h2>${esc(h)}</h2>` : ''}${bodyHtml}${init}</div>`;
    }).join('');

  const legal = (t.legal_terms || '').trim();
  const legalHtml = legal
    ? `<div class="ct-sec"><h2>Terms &amp; Conditions</h2>${esc(legal).split(/\n\s*\n+/).filter(Boolean).map(par => `<p>${par.split('\n').join('<br>')}</p>`).join('')}</div>`
    : '';

  return [headHtml, title, middle, legalHtml].filter(Boolean).join('');
}

/**
 * The contract a vendor starts from.
 *
 * Eight sections that cover what actually goes wrong between a vendor and a
 * client — what was booked, what it costs, what happens if it changes, who owns
 * the result — written to suit a florist or a makeup artist as much as a
 * photographer. A vendor edits wording; they should not have to invent the shape
 * of an agreement from an empty box.
 */
function DEFAULT_SECTIONS() {
  return [
    { id: 's1', title: 'WHAT IS BEING BOOKED', initial: true,
      text: '{{company_name}} ("the Provider") agrees to provide {{package_name}} for {{client_name}} on {{event_date}} at {{location}}.\n\nThe inclusions listed in that package form part of this Agreement. The Provider will arrive at the agreed time and carry out the work with reasonable skill and care.' },
    { id: 's2', title: 'COST AND PAYMENT', initial: true,
      text: 'The total cost of the services is {{total_cost}}.\n\nA non-refundable deposit of {{deposit}} confirms the booking. The remaining balance of {{balance}} is due on or before the event day unless agreed otherwise in writing.\n\nThe date is not held until the deposit is received.' },
    { id: 's3', title: 'CHANGES AND EXTRA TIME', initial: true,
      text: 'Any change to the date, time, location or scope must be agreed in writing. A change of date depends on the Provider being free, and may be treated as a cancellation if the new date cannot be met.\n\nTime beyond the booked hours is charged at the Provider\u2019s overtime rate and must be agreed on the day.' },
    { id: 's4', title: 'CANCELLATION', initial: true,
      text: 'If the Client cancels, the deposit is forfeited and cannot be moved to another booking.\n\nIf the Client cancels within 30 days of the event, or does not cancel and the Provider attends as agreed, the full balance remains payable.' },
    { id: 's5', title: 'USE OF THE WORK', initial: true,
      text: 'The Provider may use the work created for this booking to promote their business \u2014 a portfolio, a website, or social media \u2014 unless the Client asks in writing for it not to be used. That permission can be withdrawn at any time in writing.' },
    { id: 's6', title: 'DELIVERY', initial: true,
      text: 'The Provider will deliver the completed work within the timeframe stated in the package.\n\nDelivery timeframes are working estimates and may extend during busy periods; the Provider will keep the Client informed.' },
    { id: 's7', title: 'ON THE DAY', initial: false,
      text: 'The Client is responsible for access to the venue and for any permission the location requires.\n\nThe Provider is not responsible for hazards at the location, and may end the engagement without refund if any member of their team is subjected to abuse or harassment.' },
    { id: 's8', title: 'IF SOMETHING GOES WRONG', initial: false,
      text: 'If the Provider cannot attend because of illness, accident or anything outside their reasonable control, they will make reasonable efforts to arrange a qualified substitute.\n\nIf no substitute can be arranged, the Provider\u2019s liability is limited to refunding the fees paid.' },
  ];
}

/**
 * 🎨 Which placeholders are which, so a draft can be read at a glance.
 *
 * Colour is for DRAFTING ONLY — it exists in the editor and the placeholder view
 * of the preview, never in what a client receives. A vendor writing a clause
 * needs to see where a name or a figure will land; a client reading the finished
 * agreement should just see their own details.
 */
const PH_KIND = {
  '{{client_name}}': 'who', '{{company_name}}': 'who',
  '{{event_date}}': 'when', '{{today_date}}': 'when',
  '{{location}}': 'where', '{{event_type}}': 'what', '{{package_name}}': 'what',
  '{{total_cost}}': 'money', '{{deposit}}': 'money', '{{balance}}': 'money',
};

/** Split a string on {{placeholders}} and wrap each in its own colour. */
/**
 * Wrap each {{placeholder}} in its colour, as markup.
 *
 * The old version returned React elements, which suited splitting a plain
 * string into an array of nodes. The preview is one HTML string now, so the
 * colouring has to be part of that string — same colours, same meaning.
 */
function paintPlaceholdersHtml(html) {
  return String(html || '').replace(/\{\{(\w+)\}\}/g, (m) => {
    const kind = PH_KIND[m] || 'other';
    return `<span class="ph ph-${kind}">${m}</span>`;
  });
}


/**
 * leadId (optional): ✏️ one client's own version of the contract, opened from "Edit this contract" on their preview
 * (Raj, 2026-11-12). The same editor, without the template list; Back returns to the preview, and "Use my template
 * again" removes the client's version.
 */
export function ContractSetup({ leadId = null } = {}) {
  const [studio, setStudio] = useState('');   // the vendor's own name for the sample preview
  const [trade, setTrade] = useState('other');   // 🧑‍💼 their trade — which sample contract they see
  useEffect(() => { api.myProfile().then(d => { setStudio(d.profile?.business_name || ''); setTrade(d.profile?.profession || 'other'); }).catch(() => {}); }, []);
  const dialog = useDialog();
  const [tpls, setTpls] = useState([]);
  /* ⚠️ TRUE to begin with: "No templates yet" must not appear before the
     first fetch has even been attempted, which is what caused the flash. */
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  /* ⚠️ A snapshot taken when a template opens, so "has this changed" is a
     comparison rather than a flag somebody has to remember to set. */
  const [selClean, setSelClean] = useState(null);
  const [saving, setSaving] = useState(false);
  /* the id of a template created this session and not yet saved */
  const [justCreated, setJustCreated] = useState(null);
  const csDirty = sel && selClean && JSON.stringify(sel) !== selClean;

  /* ⚠️ The sidebar does not ask — the tester clicked Bookings mid-edit and
     lost the draft. This is the browser's own guard, which covers closing
     the tab, Back, and a reload. It cannot carry a custom message any more;
     every browser shows its own wording. */
  useEffect(() => {
    if (!csDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [csDirty]);

  /* ⚠️ Registered for the SIDEBAR, which navigates in-app and so never
     triggers beforeunload. Cleared on unmount, or a stale editor would keep
     blocking navigation after it has gone. */
  useEffect(() => {
    csLeaveGuard = async () => {
      if (csDirty && !(await dialog.confirm('You have changes that are not saved. Leave them?',
        { title: 'Unsaved changes', okLabel: 'Leave' }))) return false;
      /* an untouched new template is removed rather than left as a blank card */
      if (justCreated && justCreated === sel?.id && !csDirty) {
        api.deleteCtTemplate(justCreated).catch(() => {});
      }
      return true;
    };
    return () => { csLeaveGuard = null; };
  }, [csDirty, justCreated, sel, dialog]);
  const [msg, setMsg] = useState('');
  const [showRaw, setShowRaw] = useState(false);   // preview: placeholders vs sample values
  // which section the cursor was last in, so the shared palette knows where to
  // insert. One palette that follows you beats a copy of it in every card.
  const [focused, setFocused] = useState(0);
  // 🔓 account-wide (lib/useAutoRelease — the contract preview shares it)
  const autoRelease = useAutoRelease();

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on open: the template list, or this client's own version
  useEffect(() => { if (leadId) openOwnVersion(); else load(); }, []);
  /* ✏️ this client's own version — made on first use; left untouched, it is removed again on the way out */
  async function openOwnVersion() {
    try {
      const d = await api.ownContract(leadId);
      setSel(d.template);
      setSelClean(JSON.stringify(d.template));
      if (d.created) setJustCreated(d.template.id);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    setLoading(false);
  }
  /* back to the client's contract preview, once the page has stopped guarding unsaved changes */
  function backToPreview() {
    setSelClean(JSON.stringify(sel));
    setTimeout(() => window.location.assign(`/contract-preview/${leadId}`), 0);
  }
  async function useTemplateAgain() {
    if (!await dialog.confirm('This client’s contract goes back to your template, and the changes made here are removed.',
      { title: 'Use your template again?', okLabel: 'Use my template' })) return;
    try { await api.deleteCtTemplate(sel.id); backToPreview(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }
  async function load() {
    try { const d = await api.ctTemplates(); setTpls(d.templates || []); } catch { /* list stays */ }
    setLoading(false);
  }
  async function saveAutoRelease(on) {
    try {
      await autoRelease.save(on);
      setMsg(on ? '🔓 Contracts will send without review' : '🔒 Contracts need releasing first');
      setTimeout(() => setMsg(''), 2200);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  const sections = sel?.sections?.length ? sel.sections : [];

  /** 📝 a complete, ready-made wedding agreement — the vendor's own copy, fully editable */
  /* 📖 the sample contract for the vendor's trade — read-only; "Make my own copy" turns it into their template */
  const [viewSample, setViewSample] = useState(false);
  async function copySample() {
    try {
      const d = await api.addCtTemplate(contractSampleFor(trade));
      setViewSample(false);
      setSel(d.template);
      setSelClean(JSON.stringify(d.template));
      load();
    } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  async function add() {
    try {
      const d = await api.addCtTemplate({ name: 'New Contract', sections: DEFAULT_SECTIONS() });
      setSel(d.template);
      setSelClean(JSON.stringify(d.template));
      /* ⚠️ Remembered so that leaving it untouched can remove it again. An
         empty record the vendor never asked to keep is clutter, and the list
         was filling with identical "New Contract" cards. */
      setJustCreated(d.template.id);
      load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function save() {
    if (!sel) return;
    /* ⚠️ 2 · A second click while the first is in flight sent two saves. They
       were harmless, but a button that stays live during its own work is one
       people press twice. */
    if (saving) return;

    /* ⚠️ 4 · An unnamed template saved happily and left a card with no title,
       which is indistinguishable from a bug in the list. */
    if (!String(sel.name || '').trim()) {
      setMsg('⚠️ Give the template a name first');
      return;
    }

    /* ⚠️ 3 · A misspelt placeholder saved silently and reached the CLIENT as
       raw braces. Warned, not blocked — a vendor may have a reason, and
       refusing the save outright would be worse than telling them. */
    const text = [sel.header, sel.legal_terms, ...(sel.sections || []).flatMap(x => [x.title, x.text])].join('\n');
    const unknown = unknownPlaceholders(text);
    if (unknown.length) {
      const ok = await dialog.confirm(
        'These do not match anything the system fills:\n\n' +
        unknown.map(u => u.startsWith('…') ? '  ' + u : '  {{' + u + '}}').join('\n') +
        '\n\nThey will appear in the client\'s contract exactly as written. Save anyway?',
        { title: 'Unknown placeholders', okLabel: 'Save anyway', danger: false });
      if (!ok) return;
    }

    setSaving(true);
    setMsg('');
    try {
      await api.updateCtTemplate(sel.id, sel);
      /* ⚠️ The tick lasted 1.8s and a tester missed it entirely. Four seconds
         is long enough to notice without becoming furniture. */
      setMsg('✅ Saved');
      setSelClean(JSON.stringify(sel));
      setJustCreated(null);
      setTimeout(() => setMsg(m => (m === '✅ Saved' ? '' : m)), 4000);
      load();
    }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!await dialog.confirm('This contract template will be deleted.', { title: 'Delete template?', okLabel: 'Delete' })) return;
    try { await api.deleteCtTemplate(id); setSel(null); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  const setSection = (i, patch) => setSel(t => {
    const list = [...(t.sections || [])];
    list[i] = { ...list[i], ...patch };
    return { ...t, sections: list };
  });
  const addSection = () => setSel(t => ({
    ...t, sections: [...(t.sections || []), { id: 's' + Date.now(), title: '', text: '', initial: false }],
  }));
  const removeSection = async (i) => {
    if (!await dialog.confirm('Remove this section from the contract?', { title: 'Remove section', okLabel: 'Remove' })) return;
    setSel(t => ({ ...t, sections: (t.sections || []).filter((_, x) => x !== i) }));
  };
  const moveSection = (i, d) => setSel(t => {
    const list = [...(t.sections || [])];
    const j = i + d;
    if (j < 0 || j >= list.length) return t;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...t, sections: list };
  });
  const insertPlaceholder = (p) => {
    const i = Math.min(focused, sections.length - 1);
    if (i < 0) return;
    /* ⚠️ Only add a space where there is not one already — appending ' ' to
       text that already ends in a space is what produced "Crew:  {{crew}}". */
    const cur = sections[i].text || '';
    const joiner = (!cur || /\s$/.test(cur)) ? '' : ' ';
    setSection(i, { text: cur + joiner + p });
  };

  const assembled = sel ? templateAssembled(sel) : '';
  const previewHtml = showRaw ? paintPlaceholdersHtml(assembled) : fillSample(assembled, { event_type: sel?.event_type, ...(studio ? { company_name: studio } : {}) });
  const initialCount = (sel?.sections || []).filter(x => x.initial).length;

  if (viewSample) {
    const smp = contractSampleFor(trade);
    return (
      <div className="cs-wide">
        <div className="cs-bar">
          <button className="refresh" onClick={() => setViewSample(false)}>← Back</button>
          <div className="cs-bar-right">
            <button className="refresh cs-copy-cta" onClick={copySample}>📋 Make my own copy</button>
          </div>
        </div>
        <p className="cs-sample-note">📖 A sample {professionLabel(trade)} contract — an example to read, not legal advice. Make your own copy to edit it, and have it reviewed by a lawyer before you use it.</p>
        <div className="cs-preview-doc ct-doc">
          <div className={`ct-theme ct-accent-${smp.accent} ct-fonts-${smp.font_style}`}
            dangerouslySetInnerHTML={{ __html: fillSample(templateAssembled(smp), { event_type: smp.event_type, ...(studio ? { company_name: studio } : {}) }) }} />
        </div>
      </div>
    );
  }

  /* ✏️ this client's contract could not open (signed, or no template yet): say so, and the way back */
  if (leadId && !sel) return (
    <div className="cs-wide">
      <button className="refresh" onClick={() => window.location.assign(`/contract-preview/${leadId}`)}>← Back to the contract</button>
      <p className="cs-hint">{msg || 'Opening this client’s contract…'}</p>
    </div>
  );

  if (sel) return (
    <div className="cs-wide">
      <div className="cs-bar">
        <button className="refresh" onClick={async () => {
          /* ⚠️ Only asks when something actually changed — a confirm on every
             exit is one people learn to dismiss without reading. */
          if (csDirty && !(await dialog.confirm('You have changes that are not saved. Leave them?',
            { title: 'Unsaved changes', okLabel: 'Leave' }))) return;
          /* ⚠️ A brand-new template the vendor never touched is removed rather
             than left as a blank card. Only when it is BOTH newly created and
             unchanged — never one that already existed. */
          if (justCreated && justCreated === sel?.id && !csDirty) {
            await api.deleteCtTemplate(justCreated).catch(() => {});
          }
          if (leadId) { backToPreview(); return; }
          setSel(null); setSelClean(null); setJustCreated(null); load();
        }}>{leadId ? '← Back to the contract' : '← All templates'}</button>
        <div className="cs-bar-right">
          {msg && <span className={`cs-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</span>}
          {leadId
            ? <button className="refresh" onClick={useTemplateAgain}>↩️ Use my template again</button>
            : <>
              {/* 🔓 Account-wide, not per template: it answers "do I want to read my
                  contracts before they go out", which is a habit rather than a
                  property of one document. */}
              <AutoReleaseToggle className="refresh cs-auto" on={autoRelease.on} disabled={!autoRelease.ready} onChange={saveAutoRelease} />
              <button className="refresh" onClick={() => del(sel.id)}>🗑️</button>
            </>}
          <button className="refresh" onClick={save} disabled={saving}>
            {saving ? '⏳ Saving…' : '💾 Save contract'}
          </button>
        </div>
      </div>

      {leadId && <p className="cs-hint">✏️ This client’s own contract. Changes here are for them only; your template stays as it is.</p>}
      <div className="cs-split">
        <div className="cs-edit">
          {/* ── the template's own settings, one compact row ── */}
          <div className="table-wrap cs-block">
            <div className="cs-row3">
              <div>
                <label className="cs-label" htmlFor="cs-name">Template name</label>
                <input id="cs-name" className="cs-input" maxLength={120} value={sel.name || ''}
                  onChange={e => {
                    setSel({ ...sel, name: e.target.value });
                    /* ⚠️ clear the complaint as soon as it stops being true */
                    if (e.target.value.trim()) setMsg(m => (m === '⚠️ Give the template a name first' ? '' : m));
                  }} />
              </div>
              <div>
                <label className="cs-label" htmlFor="cs-ev">Event type</label>
                <input id="cs-ev" className="cs-input" placeholder="Any event" value={sel.event_type || ''}
                  onChange={e => setSel({ ...sel, event_type: e.target.value })} />
              </div>
              <div>
                <label className="cs-label" htmlFor="cs-hd">Header</label>
                <input id="cs-hd" className="cs-input" placeholder="Your business name and contact"
                  value={(sel.header || '').replace(/\n/g, ' · ')}
                  onChange={e => setSel({ ...sel, header: e.target.value.split(' · ').join('\n') })} />
              </div>
              <div>
                <label className="cs-label" htmlFor="cs-accent">Accent colour</label>
                <select id="cs-accent" className="cs-input" value={sel.accent || 'gold'} onChange={e => setSel({ ...sel, accent: e.target.value })}>
                  {CT_ACCENTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="cs-label" htmlFor="cs-fonts">Font style</label>
                <select id="cs-fonts" className="cs-input" value={sel.font_style || 'classic'} onChange={e => setSel({ ...sel, font_style: e.target.value })}>
                  {CT_FONTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── 🎨 one palette, not one per card. Clicking drops the placeholder
                 into whichever section you were last typing in. ── */}
          <div className="table-wrap cs-palette">
            <div className="cs-palette-head">
              <span className="cs-palette-title">🎨 Placeholders</span>
              <span className="cs-palette-hint">
                click to insert into {sections[focused]?.title || 'the section you last edited'}
              </span>
            </div>
            <div className="cs-chips">
              {CT_PLACEHOLDERS.map(p => (
                <button type="button" key={p} className={`cs-chip ph-${PH_KIND[p] || 'other'}`}
                  onClick={() => insertPlaceholder(p)}>{p}</button>
              ))}
              {CT_BLOCKS.map(p => (
                <button type="button" key={p} className="cs-chip ph-block"
                  title="A block built from this booking — a table or a list"
                  onClick={() => insertPlaceholder(p)}>{p}</button>
              ))}
            </div>
          </div>

          {/* ── clauses, two across, like a form rather than a scroll ── */}
          <div className="cs-group">
            <div className="cs-group-head">
              <span className="cs-group-title">📝 Contract sections</span>
              <span className="cs-group-sub">each becomes a heading in the signed agreement</span>
            </div>
            <div className="cs-secs">
              {sections.map((sc, i) => (
                <div className={`table-wrap cs-sec ${focused === i ? 'is-focus' : ''}`} key={sc.id}>
                  <div className="cs-sec-top">
                    <input className="cs-sec-title" placeholder="SECTION TITLE" value={sc.title || ''}
                      onFocus={() => setFocused(i)}
                      onChange={e => setSection(i, { title: e.target.value })} />
                    <div className="cs-sec-acts">
                      <button type="button" className="cs-sec-btn" onClick={() => moveSection(i, -1)} disabled={i === 0} title="Move up">↑</button>
                      <button type="button" className="cs-sec-btn" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} title="Move down">↓</button>
                      <button type="button" className="cs-sec-btn is-del" onClick={() => removeSection(i)} title="Remove">🗑️</button>
                    </div>
                  </div>
                  <textarea className="cs-sec-text" rows={6} value={sc.text || ''}
                    placeholder="What this term says…"
                    onFocus={() => setFocused(i)}
                    onChange={e => setSection(i, { text: e.target.value })} />
                  <label className="cs-sec-init">
                    <input type="checkbox" checked={!!sc.initial}
                      onChange={e => setSection(i, { initial: e.target.checked })} />
                    ✍️ Client initials this section
                  </label>
                  {/* 🎯 Printing a drone policy to a client who never booked a
                      drone is worse than noise — it invites them to expect one. */}
                  <input className="cs-sec-if"
                    placeholder="Only show if the package mentions… (blank = always)"
                    value={sc.show_if || ''}
                    onFocus={() => setFocused(i)}
                    onChange={e => setSection(i, { show_if: e.target.value })} />
                </div>
              ))}
              <button type="button" className="cs-add-sec" onClick={addSection}>＋ Add a section</button>
            </div>
          </div>

          <div className="cs-group">
            <div className="cs-group-head">
              <span className="cs-group-title">⚖️ Terms &amp; conditions</span>
              <span className="cs-group-sub">printed once, after every section — no initials</span>
            </div>
            <div className="table-wrap cs-block">
              <textarea className="cs-input cs-ta-lg" value={sel.legal_terms || ''}
                placeholder="Your full terms…"
                onChange={e => setSel({ ...sel, legal_terms: e.target.value })} />
            </div>
          </div>
        </div>

        {/* live preview, alongside the editor rather than behind a button */}
        <aside className="cs-preview">
          <div className="cs-preview-head">
            <span className="cs-preview-title">{showRaw ? 'Placeholders' : "Client's view"}</span>
            <span className="cs-preview-count">
              {initialCount} initial box{initialCount === 1 ? '' : 'es'}
            </span>
          </div>
          <div className="cs-preview-toggle">
            <button type="button" className={`refresh ${!showRaw ? 'is-on' : ''}`} onClick={() => setShowRaw(false)}>Sample details</button>
            <button type="button" className={`refresh ${showRaw ? 'is-on' : ''}`} onClick={() => setShowRaw(true)}>🎨 Placeholders</button>
          </div>
          <p className="cs-preview-note">
            {showRaw
              ? 'Colours show where each detail will land. Clients never see these.'
              : 'Sample details — real bookings fill their own.'}
          </p>
          <div className="cs-preview-doc ct-doc">
            <div className={`ct-theme ct-accent-${sel.accent || 'gold'} ct-fonts-${sel.font_style || 'classic'}`} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </aside>
      </div>
    </div>
  );

  return (
    <div>
      <div className="cs-head">
        <div className="cs-hint">🛠️ Build your own contracts — each term gets its own card, placeholders auto-fill</div>
        <button className="refresh cs-new" onClick={add}>+ New template</button>
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div className="cs-grid">
        {loading && <div className="cs-empty">Loading…</div>}
        {!loading && tpls.length === 0 && <div className="cs-empty">No templates yet — create one 👆</div>}
        {/* 📖 the sample for their trade, first — to read, and copy if they like it */}
        <div className="table-wrap cs-card is-sample" onClick={() => setViewSample(true)}>
          <div className="cs-card-ic">📖</div>
          <div className="cs-card-name">Sample: {contractSampleFor(trade).name}</div>
          <div className="cs-card-meta">{professionLabel(trade)} · read-only · make your own copy</div>
        </div>
        {tpls.map(t => {
          const n = (t.sections || []).filter(x => x.initial).length
            || (t.body?.match(/\[INITIAL\]/g) || []).length;
          return (
            <div key={t.id} className={`table-wrap cs-card ${t.is_default ? 'is-default' : ''}`}
              onClick={() => { setSel(t); setSelClean(JSON.stringify(t)); }}>
              {/* ⚠️ One per vendor. Without it the system used whichever
                  template had the lowest id — a guess on a legal document. */}
              <button type="button" className={t.is_default ? 'cs-default is-on' : 'cs-default'}
                title={t.is_default ? 'This is your default contract' : 'Use this one by default'}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (t.is_default) return;
                  try { await api.setDefaultCtTemplate(t.id); load(); }
                  catch (err) { setMsg('⚠️ ' + err.message); }
                }}>
                {t.is_default ? '📌 Default' : 'Make default'}
              </button>
              <div className="cs-card-ic">📑</div>
              <div className="cs-card-name">{t.name}</div>
              <div className="cs-card-meta">
                {t.event_type || 'Any event'} · {(t.sections || []).length || 1} sections · {n} initials
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
