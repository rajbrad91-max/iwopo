/**
 * ⚙️ Super Admin → Settings, one tab per subject (Raj, 2026-11-16: "the settings page is not organized") — each tab has
 * its own address, /admin/settings/<tab>:
 *   Account · Email · Payments · Storage · Face recognition · AI
 * Every tab that holds keys has one Edit / Save / Cancel; keys and passwords are write-only (never read back, only
 * replaced). Moved out of pages/Dashboard.jsx unchanged (code audit #2, Raj 2026-11-11), reorganised 2026-11-16.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';
import { adminPath } from '../../lib/adminRoute';

export const SETTINGS_TABS = [
  { id: 'account', label: 'Account' },
  { id: 'email', label: 'Email' },
  { id: 'payments', label: 'Payments' },
  { id: 'storage', label: 'Storage' },
  { id: 'faces', label: 'Face recognition' },
  { id: 'ai', label: 'AI' },
];

/** 🔒 Settings that are keys or passwords — write-only: never read back, only replaced. */
const SECRET_FIELDS = ['aws_secret_key', 'r2_secret_access_key', 'r2_private_secret_access_key', 'r2_public_secret_access_key', 'smtp_pass', 'stripe_connect_webhook_secret'];

/** The platform settings, and the one Edit / Save / Cancel every tab shares. */
function useSettingsForm() {
  const [s, setS] = useState(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const reload = useCallback(() => api.platformSettings().then(d => setS(d.settings || {})).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  async function save(next) {
    setS(next);
    try { await api.savePlatformSettings({ ...next }); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  // 🔒 the secret boxes open empty — paste a new one, or leave empty to keep the current one
  const startEdit = () => { setS(v => ({ ...v, ...Object.fromEntries(SECRET_FIELDS.map(k => [k, ''])) })); setEditing(true); };
  const stopEdit = () => { setEditing(false); reload(); };
  const set = (k) => (e) => setS(v => ({ ...v, [k]: e.target.value }));
  return { s, setS, editing, msg, save, startEdit, stopEdit, set };
}

/** A tab's card: its title, what it is for, and (when it holds settings) Edit / Save / Cancel. */
function Card({ title, desc, f, children }) {
  return (
    <section className="sa-set-card">
      <div className="sa-set-hd">
        <div><h3>{title}</h3>{desc && <p>{desc}</p>}</div>
        {f && (
          <div className="sa-set-actions">
            {!f.editing
              ? <button type="button" className="sa-btn-teal" onClick={f.startEdit}>Edit</button>
              : <>
                  <button type="button" className="sa-btn-teal" onClick={async () => { await f.save(f.s); f.stopEdit(); }}>Save</button>
                  <button type="button" className="sa-set-cancel" onClick={f.stopEdit}>Cancel</button>
                </>}
          </div>
        )}
      </div>
      {children}
      {f?.msg && <div className="sa-set-msg">{f.msg}</div>}
    </section>
  );
}

/** One setting: read-only until Edit; a key or password opens empty and is only ever replaced. */
function Field({ f, k, label, note, placeholder, type = 'text', secret, wide }) {
  return (
    <label className={`sa-field ${wide ? 'wide' : ''}`}>
      <span className="sa-lbl">{label}{note && <span className="sa-lbl-note"> — {note}</span>}</span>
      <input className={`sa-in ${f.editing ? '' : 'is-ro'}`} type={secret ? 'password' : type} readOnly={!f.editing} autoComplete="off"
        placeholder={secret && f.editing ? 'Paste a new one (empty keeps the current)' : placeholder}
        value={f.s[k] || ''} onChange={f.set(k)} />
    </label>
  );
}

const GEMINI_VOICES = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Umbriel', 'Algenib', 'Alnilam', 'Achird', 'Sadaltager', 'Enceladus', 'Rasalgethi'];
function GeminiVoiceSettings({ s, setS, editing }) {
  const [msg, setMsg] = useState('');
  async function pick(v) {
    try { await api.savePlatformSettings({ gemini_voice: v }); setS(x => ({ ...x, gemini_voice: v })); setMsg(`✅ Tornado now speaks as ${v}`); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  return (
    <div className="av">
      <div className="av-hd">Tornado's voice (Google Gemini Live)</div>
      <p className="av-sub">Real-time voice for the Tornado app. Create a key at aistudio.google.com → Get API key. It stays on the server; the app only ever gets a single-use, 30-minute token.</p>
      <label className="lbl">Gemini API key</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="AIza…"
        value={s.gemini_api_key || ''} onChange={e => setS({ ...s, gemini_api_key: e.target.value })} />
      <label className="lbl av-gap">Deepgram API key (Tornado's ear, optional)</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="Deepgram key"
        value={s.deepgram_api_key || ''} onChange={e => setS({ ...s, deepgram_api_key: e.target.value })} />
      <label className="lbl av-gap">PC voice address (Tornado's voice when your PC is on)</label>
      <input className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="http://100.73.28.96:8880"
        value={s.local_voice_url || ''} onChange={e => setS({ ...s, local_voice_url: e.target.value })} />
      <label className="lbl av-gap">PC voice password</label>
      <input type="password" className={`av-input ${editing ? '' : 'is-ro'}`} readOnly={!editing} placeholder="from ~/tts/voice_token on the PC"
        value={s.local_voice_token || ''} onChange={e => setS({ ...s, local_voice_token: e.target.value })} />
      <label className="lbl av-gap">Voice (Google's male voices)</label>
      <div className="av-chips">
        {GEMINI_VOICES.map(v => (
          <button key={v} type="button" className={`av-chip ${(s.gemini_voice || 'Charon') === v ? 'is-on' : ''}`} onClick={() => pick(v)}>{v}</button>
        ))}
      </div>
      <p className="av-sub av-gap">Hear them at aistudio.google.com → Stream → Voice.</p>
      {msg && <div className="av-msg">{msg}</div>}
    </div>
  );
}

/* ---------- Account: the panel's theme and the super admin's own sign-in ---------- */
/**
 * 🔐 Email and password each demand the current password. Anyone sitting at an unlocked laptop should not be able to
 * take the account over in two clicks.
 */
function AccountTab({ user, saTheme, setSaTheme }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  async function saveName() {
    if (!name.trim() || name === user?.name) return;
    setBusy('name');
    try { await api.updateMyName(name.trim()); say('✅ Name saved — it updates everywhere next time you sign in'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }
  async function saveEmail() {
    if (!email.trim() || !curPw) return say('⚠️ Enter your current password to change the email');
    setBusy('email');
    try { await api.changeEmail(email.trim(), curPw); setCurPw(''); say('✅ Email changed — sign in with it next time'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }
  async function savePassword() {
    if (!curPw || !newPw) return say('⚠️ Both passwords are needed');
    setBusy('pw');
    try { await api.changePassword(curPw, newPw); setCurPw(''); setNewPw(''); say('✅ Password changed'); }
    catch (e) { say('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }

  return (
    <>
      <Card title="Panel theme" desc="How this Super Admin panel looks. It never changes the vendors' panels.">
        <span className="sa-set-seg">
          {['dark', 'light'].map(t => (
            <button key={t} type="button" onClick={() => setSaTheme(t)} className={`sa-seg-btn ${saTheme === t ? 'is-on' : ''}`}>
              {t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </span>
      </Card>
      <Card title="Your sign-in" desc={`${user?.email || ''} · super admin. Changing the email or password needs your current password.`}>
        <div className="sa-acct-row">
          <label className="sa-acct-lbl">Display name</label>
          <input className="sa-set-input" value={name} onChange={e => setName(e.target.value)} />
          <button className="sa-view-btn" disabled={busy === 'name'} onClick={saveName}>{busy === 'name' ? 'Saving…' : 'Save'}</button>
        </div>
        <div className="sa-acct-row">
          <label className="sa-acct-lbl">Sign-in email</label>
          <input className="sa-set-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="sa-view-btn" disabled={busy === 'email'} onClick={saveEmail}>{busy === 'email' ? 'Saving…' : 'Save'}</button>
        </div>
        <div className="sa-acct-row">
          <label className="sa-acct-lbl">Current password</label>
          <input className="sa-set-input" type="password" value={curPw} autoComplete="current-password"
            placeholder="Needed for email or password" onChange={e => setCurPw(e.target.value)} />
          <span />
        </div>
        <div className="sa-acct-row">
          <label className="sa-acct-lbl">New password</label>
          <input className="sa-set-input" type="password" value={newPw} autoComplete="new-password"
            placeholder="At least 6 characters" onChange={e => setNewPw(e.target.value)} />
          <button className="sa-view-btn" disabled={busy === 'pw'} onClick={savePassword}>{busy === 'pw' ? 'Saving…' : 'Change'}</button>
        </div>
        {msg && <div className="sa-acct-msg">{msg}</div>}
      </Card>
    </>
  );
}

/* ---------- Email: what iwopo sends (codes, notices, invitations) ---------- */
/* These were environment variables, which meant the one person who could set them had to edit a file on the
   server — so they never were, and nothing in the product could send anything at all. */
function EmailTab({ f }) {
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  /** Mail fails quietly — a wrong port or a rejected password looks exactly like a saved form and silence. This
   *  actually sends one, and says what the mail server said. */
  async function sendTest() {
    setTesting(true); setTestMsg(null);
    try {
      const r = await api.testPlatformEmail(testTo.trim());
      setTestMsg({ ok: true, text: `✅ Sent to ${r.to} from ${r.from}. If it does not arrive, check the spam folder — that usually means the domain's SPF or DKIM records are missing.` });
    } catch (e) { setTestMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not send') }); }
    finally { setTesting(false); }
  }
  return (
    <>
      <Card f={f} title="Platform email" desc="Used for everything iwopo sends. A vendor who sets their own mail account under Setup Email uses that instead, so their clients see their address rather than ours.">
        <div className="sa-set-grid">
          <Field f={f} k="smtp_host" label="Host" placeholder="smtp.resend.com" />
          <Field f={f} k="smtp_port" label="Port" placeholder="587" />
          <Field f={f} k="smtp_user" label="Username" />
          <Field f={f} k="smtp_pass" label="Password" secret />
          <Field f={f} k="smtp_from" label="From address" placeholder="noreply@iwopo.com" />
          <Field f={f} k="smtp_from_name" label="From name" placeholder="iwopo" />
        </div>
      </Card>
      <Card title="Send a test" desc="Sends one real email, to check the settings above work.">
        <div className="sa-set-row">
          <input className="sa-in" placeholder="your@email.com" value={testTo} onChange={e => setTestTo(e.target.value)} />
          <button type="button" className="sa-btn-teal" disabled={testing} onClick={sendTest}>{testing ? 'Sending…' : 'Send test'}</button>
        </div>
        {testMsg && <div className={`sa-test-msg ${testMsg.ok ? 'is-ok' : ''}`}>{testMsg.text}</div>}
      </Card>
      <p className="sa-hint">Calls &amp; texts (Quo) are set up by each vendor in Calls &amp; Messages.</p>
    </>
  );
}

/* ---------- Payments: vendors connect their OWN Stripe for client card payments (lib/stripeConnect.js) ---------- */
function PaymentsTab({ f }) {
  return (
    <Card f={f} title="Stripe Connect — client card payments" desc="Money from clients goes to each vendor's own Stripe — never through iwopo. From the Stripe dashboard: Connect settings (client ID) and Developers → Webhooks (the endpoint listening to connected accounts).">
      <div className="sa-set-grid">
        <Field f={f} k="stripe_connect_client_id" label="Connect client ID" placeholder="ca_…" />
        <Field f={f} k="stripe_connect_webhook_secret" label="Connected-accounts webhook secret" placeholder="whsec_…" secret />
      </div>
    </Card>
  );
}

/* ---------- Storage: Cloudflare R2 ---------- */
function StorageTab({ f }) {
  return (
    <Card f={f} title="Cloudflare R2 storage" desc="Where photos, videos, files, website images and logos are kept. Two buckets: a private one and a public one.">
      <div className="sa-set-grid">
        <Field f={f} k="r2_account_id" label="Account ID" wide />
        <Field f={f} k="r2_access_key_id" label="Shared Access Key ID" placeholder="used by either bucket with no key of its own" />
        <Field f={f} k="r2_secret_access_key" label="Shared Secret Access Key" secret />
      </div>
      <div className="sa-sec-hd sa-set-sub">Private bucket — client galleries &amp; File Flyer</div>
      <p className="sa-set-note">Reached only by album password or share token. Public access must stay OFF on this bucket.</p>
      <div className="sa-set-grid">
        <Field f={f} k="r2_bucket_private" label="Bucket name" placeholder="iwopo-private" wide />
        <Field f={f} k="r2_private_access_key_id" label="Access Key ID" note="optional" placeholder="leave blank to use the shared key" />
        <Field f={f} k="r2_private_secret_access_key" label="Secret Access Key" note="optional" secret />
      </div>
      <div className="sa-sec-hd sa-set-sub">Public bucket — website images &amp; logos</div>
      <p className="sa-set-note">Deliberately world-readable. Nothing private should ever be written here.</p>
      <div className="sa-set-grid">
        <Field f={f} k="r2_bucket_public" label="Bucket name" placeholder="iwopo-public" />
        <Field f={f} k="r2_public_url" label="Public URL" placeholder="https://cdn.yourdomain.com" />
        <Field f={f} k="r2_public_access_key_id" label="Access Key ID" note="optional" placeholder="leave blank to use the shared key" />
        <Field f={f} k="r2_public_secret_access_key" label="Secret Access Key" note="optional" secret />
      </div>
      <div className="cb-warn sa-set-sub">
        The two buckets must be different. Galleries and File Flyer files are reached by password or share token —
        putting them in the public bucket lets anyone with the file&rsquo;s URL walk past both. Saving the same name for
        both is refused.
      </div>
    </Card>
  );
}

/* ---------- Face recognition: the engine, its queue, and AWS for overflow ---------- */
const MODES = [
  { k: 'aws_off', title: 'Local only', desc: 'Free. Runs on your server. Adapts to traffic (1–2 photos at a time).' },
  { k: 'aws_safety_net', title: 'Safety net', desc: 'Local normally — overflows to AWS only when photos pile up. Recommended.' },
  { k: 'aws_on', title: 'AWS always', desc: 'Every album on AWS Rekognition. Fastest, ~$1 per 1000 photos.' },
];
function FacesTab({ f }) {
  const dialog = useDialog();
  const [qstat, setQstat] = useState(null);
  const [reMsg, setReMsg] = useState('');
  useEffect(() => {   // the queue, live every 5 seconds while this tab is open
    let alive = true;
    const tick = () => api.faceQueueStatus().then(d => { if (alive) setQstat(d); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  async function reindex() {
    if (!await dialog.confirm('Every photo will be re-processed with the current engine. All existing face data is cleared first, and this cannot be undone.', { title: 'Re-index all photos?', okLabel: 'Re-index everything' })) return;
    setReMsg('Resetting…');
    try { const r = await api.reindexAll(); setReMsg(`✅ Reset ${r.reset} photos — open each album and click Index Faces`); }
    catch (e) { setReMsg('⚠️ ' + e.message); }
    setTimeout(() => setReMsg(''), 6000);
  }
  const mode = f.s.aws_mode || 'aws_off';
  return (
    <>
      <Card title="Engine" desc="Which engine finds the faces in client galleries.">
        <div className="fr-modes">
          {MODES.map(m => (
            <button key={m.k} type="button" className={`fr-mode ${mode === m.k ? 'on' : ''}`} onClick={() => f.save({ ...f.s, aws_mode: m.k })}>
              <div className="fr-mode-top">{m.title}</div>
              <div className="fr-mode-desc">{m.desc}</div>
            </button>
          ))}
        </div>
        {qstat && (
          <div className="fr-status">
            <span>Backlog: <b>{qstat.backlog}</b></span>
            <span>CPU load: <b>{qstat.load}</b>/{qstat.cores}</span>
            <span>Indexing: <b>{qstat.concurrency}</b> at a time</span>
            <span>{qstat.overflowing ? 'Overflowing to AWS' : (qstat.aws_mode === 'aws_on' ? 'AWS' : 'Local')}</span>
          </div>
        )}
        <div className="sa-set-row">
          <button type="button" className="sa-btn-teal" onClick={reindex}>Re-index all photos</button>
          {reMsg && <span className="sa-set-note">{reMsg}</span>}
        </div>
      </Card>
      {mode !== 'aws_off' && (
        <Card f={f} title="AWS credentials" desc={mode === 'aws_safety_net' ? 'AWS only kicks in when the local backlog gets deep, then hands back automatically.' : 'Every album is indexed on AWS Rekognition.'}>
          <div className="sa-set-grid">
            <Field f={f} k="aws_access_key" label="AWS Access Key" />
            <Field f={f} k="aws_secret_key" label="AWS Secret Key" secret />
            <Field f={f} k="aws_region" label="AWS Region" placeholder="us-east-1" />
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------- AI: the owner's private AI Agent and Tornado's voice ---------- */
/* Its own key: the clients' chatbot keeps its key under AI Chat → API Key, so Anthropic's bill keeps the two apart
   (Raj, 2026-10-10). */
function AiTab({ f }) {
  const dialog = useDialog();
  const [testing, setTesting] = useState(false);
  const [aiMsg, setAiMsg] = useState(null);
  /** One token back is the cheapest proof a key works. */
  async function testAi() {
    setTesting(true); setAiMsg(null);
    try { const r = await api.testAi('agent'); setAiMsg({ ok: true, text: `✅ The AI Agent replied "${r.said}" using ${r.model || 'the default model'}` }); }
    catch (e) { setAiMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not reach the AI Agent') }); }
    finally { setTesting(false); }
  }
  /** 🗑️ Emptying the box and saving deliberately does NOT remove a key — the form sends every field on every save, so
   *  that would wipe working credentials by accident. Removing one is its own act, which is also the only way to
   *  revoke a key that leaked. */
  async function clearAiKey() {
    if (!await dialog.confirm('Your AI Agent will stop answering until a new key is added.', { title: 'Remove the AI Agent key?', okLabel: 'Remove' })) return;
    try { await api.clearPlatformKeys(['agent_api_key']); f.setS(v => ({ ...v, agent_api_key: '' })); setAiMsg({ ok: true, text: 'Key removed.' }); }
    catch (e) { setAiMsg({ ok: false, text: '⚠️ ' + e.message }); }
  }
  return (
    <Card f={f} title="AI Agent" desc="Your private AI Agent (panel → AI Agent) — only you use it. The clients' chatbot has its own key under AI Chat → API Key. Get a key at console.anthropic.com — charged per use, a fraction of a cent per question.">
      <div className="sa-set-grid">
        <Field f={f} k="agent_api_key" label="API key" type="password" placeholder="sk-ant-…" wide />
      </div>
      <div className="sa-set-row">
        <button type="button" className="sa-btn-teal" disabled={testing} onClick={testAi}>{testing ? 'Checking…' : 'Say hello to the AI Agent'}</button>
        {f.s.agent_api_key && <button type="button" className="sa-btn-remove" onClick={clearAiKey}>Remove key</button>}
      </div>
      {aiMsg && <div className={`sa-test-msg ${aiMsg.ok ? 'is-ok' : ''}`}>{aiMsg.text}</div>}
      <GeminiVoiceSettings s={f.s} setS={f.setS} editing={f.editing} />
    </Card>
  );
}

export function SettingsView({ saTheme, setSaTheme, user, section, onSection }) {
  const f = useSettingsForm();
  const tab = SETTINGS_TABS.some(t => t.id === section) ? section : 'account';
  /* a plain click stays in the panel (and leaves an unsaved edit); Ctrl/⌘/Shift/middle-click opens a new tab */
  const open = (id) => (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (f.editing) f.stopEdit();
    onSection(id);
  };
  return (
    <>
      <nav className="sa-set-tabs" aria-label="Settings">
        {SETTINGS_TABS.map(t => (
          <a key={t.id} href={adminPath('settings', t.id)} onClick={open(t.id)} className={`sa-set-tab ${tab === t.id ? 'is-on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
        ))}
      </nav>
      {tab === 'account' ? <AccountTab user={user} saTheme={saTheme} setSaTheme={setSaTheme} />
        : !f.s ? <div className="sa-loading">Loading…</div>
        : tab === 'email' ? <EmailTab f={f} />
        : tab === 'payments' ? <PaymentsTab f={f} />
        : tab === 'storage' ? <StorageTab f={f} />
        : tab === 'faces' ? <FacesTab f={f} />
        : <AiTab f={f} />}
    </>
  );
}
