import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';

/**
 * ✉️ "＋ New text" — start a conversation with anyone (Muse review 2026-10-20, Raj's wording).
 *
 * Write → Confirm → Send: only the confirm step sends, because this is a real text from the business
 * number. The recipient box is a search (leads, contacts, people already on this page) AND a number
 * field: letters search, digits make a number. Nothing typed is ever wiped; a problem gets words.
 */
const digitsOf = (s) => String(s || '').replace(/\D/g, '');
const keyOf = (n) => digitsOf(n).slice(-10);
const COUNTRIES = [['+1', 'US / Canada'], ['+44', 'UK'], ['+61', 'Australia'], ['+91', 'India'], ['+92', 'Pakistan'], ['+971', 'UAE']];

/** "6045550123" → "604 555 0123" for +1; other countries in groups of three. */
function formatNumber(d, cc) {
  if (cc === '+1') return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ') + (d.length > 10 ? ' ' + d.slice(10) : '');
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}
function numberProblem(d, cc) {
  if (!d) return 'Enter a phone number, or search for a name.';
  if (cc === '+1') return d.length === 10 || (d.length === 11 && d[0] === '1') ? '' : 'Enter a 10-digit number, like 604 555 0123.';
  return d.length >= 7 && d.length <= 13 ? '' : 'That number looks too short or too long.';
}
export function prettyNumber(n) {
  const d = digitsOf(n);
  if (d.length === 11 && d[0] === '1') return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return n || '';
}

/** SMS length: 160 per text in the plain alphabet (153 when split), 70 (67) once an emoji or accent appears. */
const GSM = /^[\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/;
export function smsCount(text) {
  const len = [...String(text || '')].length;
  const plain = GSM.test(text || '');
  const one = plain ? 160 : 70, part = plain ? 153 : 67;
  const segments = len === 0 ? 0 : len <= one ? 1 : Math.ceil(len / part);
  return { len, segments, limit: segments <= 1 ? one : part * segments, plain };
}

const QUICK_KEY = 'cm_quick_replies';
const readQuick = () => { try { return JSON.parse(localStorage.getItem(QUICK_KEY) || '[]'); } catch { return []; } };

export default function CommsNewText({ status, people, onSent, onClose }) {
  const dialog = useDialog();
  const [step, setStep] = useState('write');
  const [find, setFind] = useState('');          // what is typed in "To" — a name to search, or a number
  const [cc, setCc] = useState('+1');
  const [pick, setPick] = useState(null);        // { name, number, lead_id, source }
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [leads, setLeads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [quick, setQuick] = useState(readQuick);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!status?.connected) return;
    api.leads().then(d => setLeads((d.leads || d || []).filter(l => l.phone))).catch(() => {});
    api.contacts().then(d => setContacts((d.contacts || []).filter(c => c.phone))).catch(() => {});
  }, [status?.connected]);

  const isSearch = /[a-z]/i.test(find) && !pick;
  const typedDigits = digitsOf(find);
  const suggestions = useMemo(() => {
    const term = find.trim().toLowerCase();
    if (pick || term.length < 2) return [];
    const td = digitsOf(term);
    const seen = new Set(); const out = [];
    const add = (name, number, extra) => {
      const k = keyOf(number); if (!k || seen.has(k)) return;
      const hit = (name && name.toLowerCase().includes(term)) || (td.length >= 3 && digitsOf(number).includes(td));
      if (!hit) return;
      seen.add(k); out.push({ name: name || '', number, ...extra });
    };
    for (const l of leads) add(l.name, l.phone, { lead_id: l.id, source: l.status === 'booked' ? 'Booking' : 'Lead' });
    for (const p of people || []) add(p.name, p.number, { source: 'Conversation' });
    for (const c of contacts) add(c.name, c.phone, { source: 'Contact' });
    return out.slice(0, 6);
  }, [find, pick, leads, contacts, people]);

  const toNumber = pick ? pick.number : (cc === '+1' ? `+1${typedDigits.slice(-10)}` : `${cc}${typedDigits}`);
  const problem = pick ? '' : isSearch ? 'Choose someone from the list, or type a phone number.' : numberProblem(typedDigits, cc);
  const count = smsCount(text);
  const typedSomething = !!(find.trim() || text.trim() || first.trim());

  async function close() {
    if (typedSomething && !await dialog.confirm('Your text has not been sent. Discard it?', { title: 'Discard draft?', okLabel: 'Discard', danger: true })) return;
    onClose();
  }
  function next() {
    setTouched(true);
    if (problem || !text.trim()) return;
    setFailure(''); setStep('confirm');
  }
  async function send() {
    setBusy(true); setFailure('');
    try {
      const r = await api.commsSendText(toNumber, text.trim(), true);
      let ev = r.event;
      if (!pick && first.trim()) {
        const c = await api.commsSaveContact({ number: toNumber, first_name: first.trim(), last_name: last.trim(), email: '' }).catch(() => null);
        if (c && ev) ev = { ...ev, contact_name: c.name };
      }
      onSent(ev, keyOf(toNumber));
    } catch (e) { setFailure(e.message || 'The text could not be sent.'); }
    finally { setBusy(false); }
  }
  function saveQuick() {
    const t = text.trim(); if (!t || quick.includes(t)) return;
    const list = [t, ...quick].slice(0, 20); setQuick(list); localStorage.setItem(QUICK_KEY, JSON.stringify(list));
  }

  const head = (
    <div className="cm-sheet-top">
      <h3 className="cm-sheet-t">New text</h3>
      <button type="button" className="cm-x" onClick={close} aria-label="Close">✕</button>
    </div>
  );

  if (!status?.connected) {
    return (
      <div className="cm-modal" onClick={onClose}>
        <div className="cm-sheet" role="dialog" aria-label="New text" onClick={ev => ev.stopPropagation()}>
          {head}
          <p className="cm-sheet-p">Texting isn&apos;t connected yet. Once your business phone line is linked to iwopo, you can text anyone from here, and the conversation shows on this page.</p>
          <div className="cm-sheet-f"><button className="cm-f is-on" onClick={onClose}>OK</button></div>
        </div>
      </div>
    );
  }

  const toLabel = pick ? `${pick.name ? pick.name + ' · ' : ''}${prettyNumber(pick.number)}` : `${first.trim() ? `${first.trim()} ${last.trim()} · `.replace(/\s+·/, ' ·') : ''}${cc} ${formatNumber(typedDigits, cc)}`;

  return (
    <div className="cm-modal" onClick={close}>
      <div className="cm-sheet" role="dialog" aria-label="New text" onClick={ev => ev.stopPropagation()}>
        {head}
        {status.sandbox && <p className="cm-practice">🧪 Practice mode (test site): everything works, but no text is ever sent.</p>}
        <p className="cm-from">From: <b>{status.from ? prettyNumber(status.from) : 'your business line'}</b></p>

        {step === 'write' ? (<>
          <label className="lbl">To</label>
          {pick ? (
            <div className="cm-picked">
              <span><b>{pick.name || prettyNumber(pick.number)}</b>{pick.name ? ` · ${prettyNumber(pick.number)}` : ''}{pick.source ? <span className="cm-src">{pick.source}</span> : null}</span>
              <button type="button" className="cm-f" onClick={() => { setPick(null); setFind(''); }}>Change</button>
            </div>
          ) : (
            <div className="cm-to">
              <select className="cm-input cm-cc" value={cc} onChange={e => setCc(e.target.value)} aria-label="Country code">
                {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{v} {l}</option>)}
              </select>
              <input className="cm-input" autoFocus autoComplete="off" inputMode="text"
                placeholder="Name, or a number like 604 555 0123"
                value={isSearch ? find : (typedDigits ? formatNumber(typedDigits, cc) : find)}
                onChange={e => setFind(e.target.value)} onBlur={() => setTouched(true)} aria-label="Recipient" />
            </div>
          )}
          {suggestions.length > 0 && (
            <ul className="cm-sugg">
              {suggestions.map(s => (
                <li key={keyOf(s.number)}>
                  <button type="button" onClick={() => { setPick(s); setFind(''); }}>
                    <b>{s.name || prettyNumber(s.number)}</b> <span>{prettyNumber(s.number)}</span> <span className="cm-src">{s.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {touched && problem && <p className="cm-field-err" role="alert">{problem}</p>}

          {!pick && !isSearch && typedDigits.length >= 7 && (
            <div className="cm-grid">
              <div><label className="lbl">First name (optional)</label><input className="cm-input" value={first} onChange={e => setFirst(e.target.value)} /></div>
              <div><label className="lbl">Last name (optional)</label><input className="cm-input" value={last} onChange={e => setLast(e.target.value)} /></div>
            </div>
          )}

          <div className="cm-msg-h">
            <label className="lbl">Message</label>
            {quick.length > 0 && (
              <select className="cm-input cm-quick" value="" onChange={e => { if (e.target.value) setText(t => (t ? `${t}\n${e.target.value}` : e.target.value)); }} aria-label="Quick replies">
                <option value="">Quick replies…</option>
                {quick.map(t => <option key={t} value={t}>{t.length > 60 ? t.slice(0, 60) + '…' : t}</option>)}
              </select>
            )}
          </div>
          <textarea className="cm-input cm-newtext" rows={4} maxLength={1600} placeholder="Hi, it's Raj from Perfect Poses…"
            value={text} onChange={e => setText(e.target.value)} />
          <div className="cm-count-row">
            <span className={`cm-seg ${count.segments > 1 ? 'is-warn' : ''}`}>
              {count.len} / {count.limit} · {count.segments} segment{count.segments === 1 ? '' : 's'}
              {count.segments > 1 && ' — this goes as several texts'}
              {!count.plain && count.len > 0 && ' (emoji or accents shorten each text)'}
            </span>
            <button type="button" className="cm-linkbtn" onClick={saveQuick} disabled={!text.trim() || quick.includes(text.trim())}>Save as quick reply</button>
          </div>
          {touched && !text.trim() && <p className="cm-field-err" role="alert">Write the message first.</p>}

          <div className="cm-sheet-f">
            <button className="cm-f" onClick={close}>Cancel</button>
            <button className="cm-f is-on" onClick={next}>Review</button>
          </div>
        </>) : (<>
          <div className="cm-review">
            <div><span className="lbl">To</span><b>{toLabel}</b></div>
            <div><span className="lbl">From</span><b>{status.from ? prettyNumber(status.from) : 'your business line'}</b></div>
            <div className="cm-review-msg">{text.trim()}</div>
            <p className="cm-real">{status.sandbox ? 'Practice mode: this is NOT sent to anyone.' : `This sends a real text message${count.segments > 1 ? ` (${count.segments} parts)` : ''}.`}</p>
          </div>
          {failure && (
            <div className="cm-fail" role="alert">
              ⚠️ Not sent: {failure} Your text is kept: press Send text to try again.
            </div>
          )}
          <div className="cm-sheet-f">
            <button className="cm-f" disabled={busy} onClick={() => setStep('write')}>‹ Edit</button>
            <button className="cm-f is-on" disabled={busy} onClick={send}>{busy ? 'Sending…' : failure ? 'Try again' : 'Send text'}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
