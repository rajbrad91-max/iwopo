/**
 * 📧 Send Packages — compose the email before it goes.
 *
 * Sending used to fire immediately on click, so a vendor had no say in what
 * their client received. This mirrors the modal PerfectPoses uses: pick a saved
 * template, adjust the subject and body, CC a second address, copy the client
 * link, then send.
 *
 * Merge tokens are stored, not resolved, so a template written for one client
 * works for the next: {{name}} and {{link}} are swapped in only when sending.
 */
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const DEFAULT_SUBJECT = 'Your packages are ready 🎉';
const DEFAULT_BODY =
`Hi {{name}},

Thank you for your enquiry — I've put together some options for you.

You can view them here:
{{link}}

Take your time, and let me know if you'd like anything adjusted.

Best wishes`;

/** Swap the tokens for real values — done at send time, never when saving. */
function fill(text, ctx) {
  return String(text || '')
    .split('{{name}}').join(ctx.name || '')
    .split('{{link}}').join(ctx.link || '');
}

/** Turn real values back into tokens, so an edited body saves as a template. */
function tokenise(text, ctx) {
  let out = String(text || '');
  if (ctx.link) out = out.split(ctx.link).join('{{link}}');
  if (ctx.name) out = out.split(ctx.name).join('{{name}}');
  return out;
}

export default function SendPackagesModal({ lead, link, onClose, onSent }) {
  const [tpls, setTpls] = useState([]);
  const [tplId, setTplId] = useState('');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [cc, setCc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const ctx = { name: lead.name || '', link };

  useEffect(() => {
    api.emailTemplates().then(d => setTpls(d.templates || [])).catch(() => {});
  }, []);

  function applyTpl(id) {
    setTplId(id);
    if (!id) { setSubject(DEFAULT_SUBJECT); setBody(DEFAULT_BODY); return; }
    const t = tpls.find(x => String(x.id) === String(id));
    if (t) { setSubject(t.subject); setBody(t.body); }
  }

  async function saveAsTemplate() {
    const name = prompt('Save this as a template — what should it be called?',
      tpls.find(x => String(x.id) === String(tplId))?.name || 'My package email');
    if (!name) return;
    setSaving(true);
    try {
      // store the tokenised version, so the template works for the next client
      const d = await api.addEmailTemplate({ name, subject, body: tokenise(body, ctx) });
      setTpls(ts => [...ts, d.template]);
      setTplId(String(d.template.id));
      setMsg('✅ Template saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg('⚠️ ' + e.message); setTimeout(() => setMsg(''), 3500); }
    finally { setSaving(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setMsg('⚠️ Could not copy — select the link and copy manually'); setTimeout(() => setMsg(''), 3500); }
  }

  async function send() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      // tokens are resolved here, so what the client receives has real values
      await api.emailLead(lead.id, fill(subject, ctx), fill(body, ctx), cc.trim() || undefined, 'packages');
      onSent?.();
      onClose();
    } catch (e) {
      // a held send is not a failure — say what to do about it
      setMsg(/not_released|release/i.test(e.message || '')
        ? '🔒 Preview and release the contract first — use 👁️ Preview Contract above'
        : '⚠️ ' + (e.message || 'Could not send'));
      setBusy(false);
    }
  }

  return (
    <div className="em-backdrop" onClick={onClose}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <div className="em-head">
          <h3>📧 Send Packages</h3>
          <span className="em-to">to {lead.email}</span>
          <button type="button" className="em-x" onClick={onClose}>✕</button>
        </div>

        <div className="em-body">
          <div className="em-row2">
            <div>
              <label className="fb-label">Template</label>
              <select className="fb-select" value={tplId} onChange={e => applyTpl(e.target.value)}>
                <option value="">Default message</option>
                {tpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="fb-label">CC a second address</label>
              <input className="fb-select" type="email" placeholder="partner@example.com"
                value={cc} onChange={e => setCc(e.target.value)} />
            </div>
          </div>

          <label className="fb-label">Subject</label>
          <input className="fb-select" value={subject} onChange={e => setSubject(e.target.value)} />

          <label className="fb-label">Message</label>
          <textarea className="fb-select em-ta" rows="11"
            value={body} onChange={e => setBody(e.target.value)} />
          <p className="fb-hint">
            <code>{'{{name}}'}</code> becomes the client&apos;s name · <code>{'{{link}}'}</code> becomes their packages link
          </p>

          <div className="em-link">
            <span>🔗 {link}</span>
          </div>

          {msg && <div className={`ld-msg ${msg[0] === '⚠' ? 'is-err' : 'is-ok'} ld-msg-mt`}>{msg}</div>}
        </div>

        <div className="em-foot">
          <button type="button" onClick={saveAsTemplate} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save as template'}
          </button>
          <button type="button" onClick={copyLink}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
          {/* opens the contract full-page in a new tab, so the half-finished
              send isn't lost by navigating away from it */}
          <button type="button" onClick={() => window.open(`/contract-preview/${lead.id}`, '_blank')}>
            👁️ Preview Contract
          </button>
          <button type="button" className="is-primary" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : '📤 Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
