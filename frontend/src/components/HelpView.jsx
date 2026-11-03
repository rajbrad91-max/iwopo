import { useState } from 'react';
import { api } from '../lib/api';
import './helpView.css';

/**
 * 🛟 Help & Support (2026-11-03): quick answers that open the right screen, and a message that reaches iwopo by
 * email (routes/support.js) with the vendor's details attached, so a reply is one click on our side.
 */
const ANSWERS = [
  { q: 'How do couples send me an inquiry?', a: 'Share your inquiry form link. You’ll find it under Inquiry Form, and your web address under Settings → Web address.', go: 'inqform', btn: 'Open Inquiry Form' },
  { q: 'How do I send packages and a contract?', a: 'Open a lead, choose a package folder and press Send. The couple picks a package, signs the contract and pays the deposit in their portal.', go: 'leads', btn: 'Open Leads' },
  { q: 'How do I deliver photos?', a: 'Create a gallery, upload the photos and share its link. Guests can find their own photos by face.', go: 'galleries', btn: 'Open Galleries' },
  { q: 'How do I change or cancel my plan?', a: 'Open Plans and press Manage billing: change card, switch monthly/yearly, change plan or cancel. You keep your plan until the end of the period.', go: 'plans', btn: 'Open Plans' },
  { q: 'Can I use my own domain?', a: 'Yes, on our top plan. Settings → Web address shows the one record to add; iwopo does the rest and emails you when it’s live.', link: '/guides/connect-your-own-domain', btn: 'Read the guide' },
  { q: 'A client says they didn’t get my email', a: 'Ask them to check spam or promotions first. You can always copy the link from the lead and send it by text or WhatsApp.', go: 'leads', btn: 'Open Leads' },
];
const TOPICS = [['question', 'Question'], ['problem', 'Something isn’t working'], ['billing', 'Billing'], ['idea', 'Feature idea']];

export default function HelpView({ user, onGo }) {
  const [topic, setTopic] = useState('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState('');

  async function send() {
    setBusy(true); setErr('');
    try {
      const r = await api.supportMessage({ topic, subject, message, page: window.location.pathname });
      setSent(r.reply_to || user?.email || 'your email'); setSubject(''); setMessage('');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="hv">
      <section className="table-wrap hv-card">
        <h3 className="hv-h">📚 Quick answers</h3>
        {ANSWERS.map(x => (
          <details key={x.q} className="hv-qa">
            <summary>{x.q}</summary>
            <p>{x.a}</p>
            {x.go && <button type="button" className="refresh" onClick={() => onGo(x.go)}>{x.btn}</button>}
            {x.link && <a className="refresh hv-link" href={x.link} target="_blank" rel="noreferrer">{x.btn}</a>}
          </details>
        ))}
      </section>

      <section className="table-wrap hv-card">
        <h3 className="hv-h">💬 Send us a message</h3>
        <p className="hv-sub">We reply by email{user?.email ? <> to <b>{user.email}</b></> : null}. You can also write to <a href="mailto:sales@iwopo.com">sales@iwopo.com</a>.</p>
        {sent ? (
          <div className="hv-done">✅ Thanks — your message is on its way. We’ll reply to <b>{sent}</b>.
            <button type="button" className="refresh" onClick={() => setSent(null)}>Send another</button></div>
        ) : (
          <>
            <label className="hv-lbl" htmlFor="hv-topic">What is it about?</label>
            <select id="hv-topic" className="ac-kb-input" value={topic} onChange={e => setTopic(e.target.value)} disabled={busy}>
              {TOPICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="hv-lbl" htmlFor="hv-subject">Subject (optional)</label>
            <input id="hv-subject" className="ac-kb-input" value={subject} maxLength={140} onChange={e => setSubject(e.target.value)} disabled={busy} placeholder="e.g. Contract not showing for a couple" />
            <label className="hv-lbl" htmlFor="hv-msg">Your message</label>
            <textarea id="hv-msg" className="ac-kb-input hv-msg" value={message} maxLength={5000} onChange={e => setMessage(e.target.value)} disabled={busy}
              placeholder="Tell us what happened or what you need. If something isn’t working, which page and what you expected help us fix it fast." />
            {err && <p className="hv-err">⚠️ {err}</p>}
            <button type="button" className="hv-send" disabled={busy || message.trim().length < 10} onClick={send}>{busy ? 'Sending…' : 'Send message'}</button>
          </>
        )}
      </section>
    </div>
  );
}
