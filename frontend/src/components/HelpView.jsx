import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import './helpView.css';
import { GETTING_STARTED } from '../lib/gettingStarted';

/* 🌐 The own-domain guide in 15 languages — one-page PDFs in /public/help-guides/own-domain (/guides is the SEO articles' path) (Raj, 2026-11-08).
   The browser's own language is picked first when there is a guide in it. */
const GUIDE_LANGS = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'],
  ['it', 'Italiano'], ['nl', 'Nederlands'], ['ru', 'Русский'], ['ar', 'العربية'], ['hi', 'हिन्दी'], ['pa', 'ਪੰਜਾਬੀ'],
  ['ur', 'اردو'], ['zh', '中文（简体）'], ['ja', '日本語'], ['ko', '한국어']];
const browserGuide = () => {
  const want = (typeof navigator !== 'undefined' ? navigator.language || '' : '').slice(0, 2).toLowerCase();
  return GUIDE_LANGS.some(([c]) => c === want) ? want : 'en';
};

/**
 * 🛟 Help & Support (2026-11-03; 2026-11-07): the getting-started guide (the same steps as the Welcome pop-up), video
 * guides added in Super Admin, quick answers that open the right screen, and a message — with a screenshot if it helps —
 * that reaches iwopo by email (routes/support.js) with the vendor's details attached.
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
  const [shot, setShot] = useState(null);          // 📎 { file, url } — one screenshot
  const [videos, setVideos] = useState(null);
  const fileRef = useRef(null);
  const [guide, setGuide] = useState(browserGuide);   // 🌐 the own-domain guide's language
  useEffect(() => { api.helpVideos().then(d => setVideos(d.videos || [])).catch(() => setVideos([])); }, []);
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  /* 📎 a screenshot: picked, or pasted straight into the message box (Ctrl+V) */
  function takeShot(file) {
    setErr('');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setErr('A screenshot should be a PNG, JPG, WebP or GIF image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setErr('That screenshot is over 5 MB — try a smaller one.'); return; }
    setShot({ file, url: URL.createObjectURL(file) });
  }
  function onPaste(e) {
    const img = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); takeShot(img.getAsFile()); }
  }

  async function send() {
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      Object.entries({ topic, subject, message, page: window.location.pathname }).forEach(([k, v]) => fd.append(k, v));
      if (shot) fd.append('screenshot', shot.file, shot.file.name || 'screenshot.png');
      const r = await api.supportMessage(fd);
      setSent(r.reply_to || user?.email || 'your email'); setSubject(''); setMessage(''); setShot(null);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="hv">
      <section className="table-wrap hv-card hv-wide">
        <h3 className="hv-h">🚀 Getting started</h3>
        <p className="hv-sub">Three steps get your business running on iwopo — the same ones from your welcome.</p>
        <ol className="hv-guide">
          {GETTING_STARTED.map((s, i) => (
            <li key={s.tab} className="hv-step">
              <span className="hv-step-n">{i + 1}</span>
              <div className="hv-step-body">
                <b>{s.icon} {s.title}</b>
                <ul>{s.points.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
              <button type="button" className="refresh hv-step-go" onClick={() => onGo(s.tab)}>Open</button>
            </li>
          ))}
        </ol>
      </section>

      <section className="table-wrap hv-card hv-wide">
        <h3 className="hv-h">🌐 Your own domain</h3>
        <p className="hv-sub">Show your galleries and inquiry form on your own web address — like <b>clients.yourstudio.com</b> — with no “iwopo” in it. You add one record where your domain is managed; iwopo checks it and adds the padlock for you.</p>
        <ol className="hv-dsteps">
          <li><b>Settings → Web address</b>: type your domain and press <b>Connect</b>.</li>
          <li>Add the one record it shows at your domain company (GoDaddy, Namecheap, Cloudflare…).</li>
          <li>Press <b>Check now</b> — it turns Active, usually within minutes.</li>
        </ol>
        <div className="hv-guide">
          <label className="hv-guide-lbl" htmlFor="hv-guide-lang">📄 Step-by-step guide (PDF)</label>
          <select id="hv-guide-lang" className="hv-guide-sel" value={guide} onChange={e => setGuide(e.target.value)}>
            {GUIDE_LANGS.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
          </select>
          <a className="refresh hv-guide-dl" href={`/help-guides/own-domain/${guide}.pdf`} target="_blank" rel="noreferrer">Download</a>
        </div>
      </section>

      <section className="table-wrap hv-card hv-wide">
        <h3 className="hv-h">🎬 Video guides</h3>
        {videos === null ? <p className="hv-sub">Loading…</p>
          : videos.length === 0 ? <p className="hv-sub">Short video walkthroughs are coming soon — they'll appear right here.</p>
          : (
            <div className="hv-videos">
              {videos.map(v => (
                <figure key={v.id} className="hv-video">
                  <div className="hv-frame">
                    <iframe src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0`} title={v.title} loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                  </div>
                  <figcaption>{v.title}</figcaption>
                </figure>
              ))}
            </div>
          )}
      </section>

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
            <textarea id="hv-msg" className="ac-kb-input hv-msg" value={message} maxLength={5000} onChange={e => setMessage(e.target.value)} onPaste={onPaste} disabled={busy}
              placeholder="Tell us what happened or what you need. If something isn’t working, which page and what you expected help us fix it fast." />
            <div className="hv-shot">
              <input ref={fileRef} id="hv-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hv-file" onChange={e => { takeShot(e.target.files?.[0]); e.target.value = ''; }} />
              {shot ? (
                <div className="hv-shot-on">
                  <img src={shot.url} alt="Your screenshot" />
                  <button type="button" className="refresh" onClick={() => setShot(null)} disabled={busy}>Remove</button>
                </div>
              ) : (
                <button type="button" className="refresh" onClick={() => fileRef.current?.click()} disabled={busy}>📎 Add a screenshot</button>
              )}
              <span className="hv-hint">Or paste one into the message box (Ctrl+V). PNG, JPG, WebP or GIF, up to 5 MB.</span>
            </div>
            {err && <p className="hv-err">⚠️ {err}</p>}
            <button type="button" className="hv-send" disabled={busy || message.trim().length < 10} onClick={send}>{busy ? 'Sending…' : 'Send message'}</button>
          </>
        )}
      </section>
    </div>
  );
}
