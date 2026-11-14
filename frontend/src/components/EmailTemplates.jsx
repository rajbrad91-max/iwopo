/**
 * ✉️ Email templates — the words iwopo uses when it emails a vendor's clients (Raj, 2026-11-14).
 * Beside the mail settings on Settings → Setup Email. Every vendor has the same emails; each starts with the
 * wording iwopo always sent, and "Reset to default" brings that back. The server: routes/email.js /client-emails,
 * the list and defaults: backend/src/lib/emailTemplates.js.
 *
 * 🧑‍💻 HTML mode (Plain text | HTML) shows only when the server says this account may use it (`html_allowed`).
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fillTags, escHtml } from '../lib/emailTags';

const fromRow = (e) => ({ subject: e.subject, body: e.body, mode: e.mode || 'text', html: e.html || '' });

export default function EmailTemplates() {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('packages');
  const [draft, setDraft] = useState({ subject: '', body: '', mode: 'text', html: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const subjRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef('body');   // where a tag goes: the field the vendor was last in

  useEffect(() => {
    api.clientEmails().then(setData).catch(e => setMsg('⚠️ ' + e.message));
  }, []);

  const cur = data?.emails?.find(e => e.kind === kind);
  useEffect(() => {
    if (cur) setDraft(fromRow(cur));
    setMsg('');
  }, [kind, cur?.subject, cur?.body, cur?.mode, cur?.html]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) {
    return (
      <div className="table-wrap et">
        <h2 className="es-title">✉️ Email templates</h2>
        <p className="et-intro">{msg || 'Loading…'}</p>
      </div>
    );
  }

  const canHtml = !!data.html_allowed;
  const isHtml = canHtml && draft.mode === 'html';
  const saved = fromRow(cur);
  const dirty = draft.subject !== saved.subject || draft.body !== saved.body || (canHtml && (draft.mode !== saved.mode || draft.html !== saved.html));
  const vals = Object.fromEntries(cur.tags.map(t => [t, data.sample[t]]));   // the preview fills this email's tags only
  const field = (key) => (key === 'subject' ? 'subject' : isHtml ? 'html' : 'body');

  function insert(tag) {
    const key = field(lastField.current);
    const el = key === 'subject' ? subjRef.current : bodyRef.current;
    const text = `{${tag}}`;
    const v = draft[key];
    const a = el?.selectionStart ?? v.length;
    const b = el?.selectionEnd ?? v.length;
    setDraft(d => ({ ...d, [key]: v.slice(0, a) + text + v.slice(b) }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length); });
  }

  function setMode(mode) {
    // the first time HTML is picked, it starts from the simple design rather than an empty box
    setDraft(d => ({ ...d, mode, html: mode === 'html' && !d.html.trim() ? cur.starter_html : d.html }));
  }

  function took(r, note) {
    setData(d => ({ ...d, emails: d.emails.map(e => (e.kind === kind ? { ...e, ...r } : e)) }));
    setDraft(fromRow(r));
    setMsg(note);
  }
  async function save() {
    setBusy(true); setMsg('');
    try { took(await api.saveClientEmail(kind, draft.subject, draft.body, canHtml ? { mode: draft.mode, html: draft.html } : {}), '✓ Saved'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true); setMsg('');
    try { took(await api.resetClientEmail(kind), '✓ Back to the default wording'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="table-wrap et">
      <h2 className="es-title">✉️ Email templates</h2>
      <p className="et-intro">The words iwopo uses when it emails your clients. Change them here once and every email of that kind uses them.</p>

      <div className="et-list" role="tablist">
        {data.emails.map(e => (
          <button key={e.kind} type="button" role="tab" aria-selected={e.kind === kind}
            className={`et-item${e.kind === kind ? ' is-on' : ''}`} onClick={() => setKind(e.kind)}>
            {e.label}{e.edited && <span className="et-badge">{e.mode === 'html' ? 'HTML' : 'Edited'}</span>}
          </button>
        ))}
      </div>
      <p className="et-when">{cur.when}</p>

      {canHtml && (
        <div className="et-mode" role="radiogroup" aria-label="Send this email as">
          {[['text', 'Plain text'], ['html', 'HTML']].map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={draft.mode === m}
              className={`et-mode-btn${draft.mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
      )}

      <label className="fb-label" htmlFor="et-subject">Subject</label>
      <input id="et-subject" ref={subjRef} className="fb-input" maxLength={200} value={draft.subject}
        onFocus={() => { lastField.current = 'subject'; }} onChange={e => setDraft({ ...draft, subject: e.target.value })} />

      {isHtml ? (
        <>
          <div className="et-code-head">
            <label className="fb-label et-gap" htmlFor="et-html">HTML</label>
            <button type="button" className="et-link" onClick={() => setDraft({ ...draft, html: cur.starter_html })}>Start again from the simple design</button>
          </div>
          <textarea id="et-html" ref={bodyRef} className="fb-input et-body et-code" rows={16} spellCheck={false} value={draft.html}
            onFocus={() => { lastField.current = 'body'; }} onChange={e => setDraft({ ...draft, html: e.target.value })} />
          <p className="et-hint">Paste your own design here, or edit this one. Scripts and forms are removed when it is saved. A plain-text copy goes with it for email apps that can't show HTML.</p>
        </>
      ) : (
        <>
          <label className="fb-label et-gap" htmlFor="et-body">Message</label>
          <textarea id="et-body" ref={bodyRef} className="fb-input et-body" rows={10} maxLength={5000} value={draft.body}
            onFocus={() => { lastField.current = 'body'; }} onChange={e => setDraft({ ...draft, body: e.target.value })} />
        </>
      )}

      <div className="et-tags">
        <span className="et-tags-l">Insert:</span>
        {cur.tags.map(t => (
          <button key={t} type="button" className="et-tag" onMouseDown={e => e.preventDefault()} onClick={() => insert(t)}>
            {data.tag_labels[t] || t}
          </button>
        ))}
      </div>

      <div className="et-actions">
        <button type="button" className="refresh set-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : '💾 Save'}</button>
        {dirty && <button type="button" className="refresh" disabled={busy} onClick={() => setDraft(saved)}>Undo changes</button>}
        {cur.edited && !dirty && <button type="button" className="refresh" disabled={busy} onClick={reset}>Reset to default</button>}
        {msg && <span className={`et-msg ${msg[0] === '⚠' ? 'u-color-red' : 'u-color-green'}`}>{msg}</span>}
      </div>

      <div className="et-preview">
        <div className="et-preview-h">Preview · what your client sees</div>
        <div className="et-preview-subj">{fillTags(draft.subject, vals)}</div>
        {isHtml
          /* sandbox with nothing allowed: the design shows, nothing in it can run */
          ? <iframe className="et-frame" title="Email preview" sandbox="" srcDoc={fillTags(draft.html, vals, escHtml)} />
          : <div className="et-preview-body">{fillTags(draft.body, vals)}</div>}
        {kind === 'signed_contract' && <div className="et-attach">📎 contract-Priya_Sharma.pdf</div>}
      </div>
    </div>
  );
}
