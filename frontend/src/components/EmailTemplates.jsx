/**
 * ✉️ Email templates — the words iwopo uses when it emails a vendor's clients (Raj, 2026-11-14).
 * First on Settings → Setup Email: the editor on the left, its preview beside it on the right, so every change is
 * seen as it is typed; the mail settings sit below (Raj, 2026-11-17). Every vendor has the same emails; each starts with the
 * wording iwopo always sent, and "Reset to default" brings that back. The server: routes/email.js /client-emails,
 * the list and defaults: backend/src/lib/emailTemplates.js.
 *
 * 🧑‍💻 HTML mode (Plain text | HTML) shows only when the server says this account may use it (`html_allowed`).
 * One switch for every email (Raj, 2026-11-17); each email keeps its words and its design either way.
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fillTags, escHtml } from '../lib/emailTags';

/* an email with no design of its own shows the simple starter design while HTML is on (and is saved as "none",
   so the starter keeps following its words) */
const fromRow = (e, html) => ({ subject: e.subject, body: e.body, html: e.html || (html ? e.starter_html : '') || '' });

export default function EmailTemplates({ startKind = null }) {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState(startKind || 'packages');
  const [draft, setDraft] = useState({ subject: '', body: '', html: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const subjRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef('body');   // where a tag goes: the field the vendor was last in
  const [reviewUrl, setReviewUrl] = useState('');   // ⭐ where the Review request's link goes

  useEffect(() => {
    api.clientEmails().then(d => { setData(d); setReviewUrl(d.review_url || ''); }).catch(e => setMsg('⚠️ ' + e.message));
  }, []);

  const cur = data?.emails?.find(e => e.kind === kind);
  const isHtml = !!data?.html_allowed && data?.mode === 'html';
  useEffect(() => {
    if (cur) setDraft(fromRow(cur, isHtml));
    setMsg('');
  }, [kind, cur?.subject, cur?.body, cur?.html]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) {
    // both cards from the start, so the mail settings below never jump into the right-hand column while this loads
    return (
      <>
        <div className="table-wrap et">
          <h2 className="es-title">✉️ Email templates</h2>
          <p className="et-intro">{msg || 'Loading…'}</p>
        </div>
        <div className="table-wrap et-preview"><div className="et-preview-h">Preview · what your client sees</div></div>
      </>
    );
  }

  const canHtml = !!data.html_allowed;
  const saved = fromRow(cur, isHtml);
  const dirty = draft.subject !== saved.subject || draft.body !== saved.body || (isHtml && draft.html !== saved.html);
  const vals = Object.fromEntries(cur.tags.map(t => [t, data.sample[t]]));   // the preview fills this email's tags only
  if (kind === 'review_request' && data.review_url) vals.link = data.review_url;   // ⭐ their own review page
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

  /** 🔘 every email at once — unsaved typing in the open one stays, and nothing saved is touched */
  async function setMode(mode) {
    if (mode === data.mode) return;
    setBusy(true); setMsg('');
    try {
      const d = await api.setClientEmailMode(mode);
      setData(d);
      if (mode === 'html') setDraft(x => ({ ...x, html: x.html || cur.starter_html }));
      setMsg(mode === 'html' ? '✓ Every email now goes in its HTML design' : '✓ Every email now goes as plain text');
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  function took(r, note) {
    setData(d => ({ ...d, emails: d.emails.map(e => (e.kind === kind ? { ...e, ...r } : e)) }));
    setDraft(fromRow(r, isHtml));
    setMsg(note);
  }
  async function save() {
    setBusy(true); setMsg('');
    // the starter design untouched is saved as "none", so it keeps following the words
    const html = draft.html === cur.starter_html ? '' : draft.html;
    try { took(await api.saveClientEmail(kind, draft.subject, draft.body, canHtml ? { html } : {}), '✓ Saved'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function saveReview() {
    setBusy(true); setMsg('');
    try {
      const r = await api.setReviewLink(reviewUrl);
      setData(d => ({ ...d, review_url: r.review_url }));
      setReviewUrl(r.review_url);
      setMsg(r.review_url ? '✓ Review link saved' : '✓ Review link removed');
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true); setMsg('');
    try { took(await api.resetClientEmail(kind), '✓ Back to the default wording'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="table-wrap et">
        {/* the title, and — for an account allowed HTML — how every email is sent, in the card's top corner */}
        <div className="et-top">
          <h2 className="es-title">✉️ Email templates</h2>
          {canHtml && (
            <div className="et-mode" role="radiogroup" aria-label="Send my emails as">
              {[['text', 'Plain text'], ['html', 'HTML']].map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={data.mode === m} disabled={busy}
                  className={`et-mode-btn${data.mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <p className="et-intro">The words iwopo uses when it emails your clients. Change them here once and every email of that kind uses them.</p>

        {/* the emails, two to a row; an odd last one takes the whole row rather than sitting alone in half of it */}
        <div className="et-list" role="tablist">
          {data.emails.map(e => (
            <button key={e.kind} type="button" role="tab" aria-selected={e.kind === kind}
              className={`refresh et-item${e.kind === kind ? ' is-on' : ''}`} onClick={() => setKind(e.kind)}>
              {e.label}{e.edited && <span className="et-badge">Edited</span>}
            </button>
          ))}
        </div>
        <p className="et-when">{cur.when}</p>

        {/* ⭐ the page "Ask for a review" sends the client to — the {link} in this email */}
        {kind === 'review_request' && (
          <div className="et-review">
            <label className="fb-label" htmlFor="et-review">Your review link</label>
            <div className="et-review-row">
              <input id="et-review" className="fb-input" maxLength={500} placeholder="g.page/r/…/review" value={reviewUrl}
                onChange={e => setReviewUrl(e.target.value)} />
              <button type="button" className="refresh" disabled={busy || reviewUrl === (data.review_url || '')} onClick={saveReview}>Save link</button>
            </div>
          </div>
        )}

        <label className="fb-label" htmlFor="et-subject">Subject</label>
        <input id="et-subject" ref={subjRef} className="fb-input" maxLength={200} value={draft.subject}
          onFocus={() => { lastField.current = 'subject'; }} onChange={e => setDraft({ ...draft, subject: e.target.value })} />

        {isHtml ? (
          <>
            <div className="et-code-head">
              <label className="fb-label et-gap" htmlFor="et-html">HTML</label>
              <button type="button" className="refresh et-small" onClick={() => setDraft({ ...draft, html: cur.starter_html })}>Start again from the simple design</button>
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
            <button key={t} type="button" className="refresh et-tag" onMouseDown={e => e.preventDefault()} onClick={() => insert(t)}>
              {data.tag_labels[t] || t}
            </button>
          ))}
        </div>

        <div className="et-actions">
          <button type="button" className="refresh" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          {dirty && <button type="button" className="refresh" disabled={busy} onClick={() => setDraft(saved)}>Undo changes</button>}
          {cur.edited && !dirty && <button type="button" className="refresh" disabled={busy} onClick={reset}>Reset to default</button>}
          {msg && <span className={`et-msg ${msg[0] === '⚠' ? 'u-color-red' : 'u-color-green'}`}>{msg}</span>}
        </div>
      </div>

      {/* the preview, its own card on the right, level with the editor */}
      <div className="table-wrap et-preview">
        <div className="et-preview-h">Preview · what your client sees</div>
        <div className="et-preview-subj">{fillTags(draft.subject, vals)}</div>
        {isHtml
          /* sandbox with nothing allowed: the design shows, nothing in it can run */
          ? <iframe className="et-frame" title="Email preview" sandbox="" srcDoc={fillTags(draft.html, vals, escHtml)} />
          : <div className="et-preview-body">{fillTags(draft.body, vals)}</div>}
        {kind === 'signed_contract' && <div className="et-attach">📎 contract-Priya_Sharma.pdf</div>}
      </div>
    </>
  );
}
