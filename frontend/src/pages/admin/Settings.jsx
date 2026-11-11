/**
 * ⚙️ Settings: face engine, storage keys, voices, and the admins.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';

const GEMINI_VOICES = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Umbriel', 'Algenib', 'Alnilam', 'Achird', 'Sadaltager', 'Enceladus', 'Rasalgethi'];
function GeminiVoiceSettings({ s, setS, editing }) {
  const [msg, setMsg] = useState('');
  async function pick(v) {
    try { await api.savePlatformSettings({ gemini_voice: v }); setS(x => ({ ...x, gemini_voice: v })); setMsg(`✅ Tornado now speaks as ${v}`); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  return (
    <div className="av">
      <div className="av-hd">🌪️ Tornado's voice (Google Gemini Live)</div>
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

/* 🔑 The clients' AI chatbot key, kept masked. The AI Agent (the owner's
   private assistant) has its own key in Settings, so Anthropic's bill keeps
   the two apart (Raj, 2026-10-10). */
/** 🔒 Settings that are keys or passwords — write-only: never read back, only replaced. */
const SECRET_FIELDS = ['aws_secret_key', 'r2_secret_access_key', 'r2_private_secret_access_key', 'r2_public_secret_access_key', 'smtp_pass', 'stripe_connect_webhook_secret'];

function FaceEngineSettings() {
  const dialog = useDialog();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [reMsg, setReMsg] = useState('');
  const [qstat, setQstat] = useState(null);
  const [credOpen, setCredOpen] = useState(false);
  /* R2 is a long block of eight fields that is set once and then never looked
     at again. Folded away by default, like the AWS credentials above it. */
  const [r2Open, setR2Open] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMsg, setAiMsg] = useState(null);

  /** Removing a credential is its own act — see the comment on the button. */
  async function clearAiKey() {
    if (!await dialog.confirm(
      'Your AI Agent will stop answering until a new key is added.',
      { title: 'Remove the AI Agent key?', okLabel: 'Remove' })) return;
    try {
      await api.clearPlatformKeys(['agent_api_key']);
      setS(v => ({ ...v, agent_api_key: '' }));
      setAiMsg({ ok: true, text: 'Key removed.' });
    } catch (e) { setAiMsg({ ok: false, text: '⚠️ ' + e.message }); }
  }

  /** One token back is the cheapest proof a key works. */
  async function testAi() {
    setAiTesting(true); setAiMsg(null);
    try {
      const r = await api.testAi('agent');
      setAiMsg({ ok: true, text: `✅ The AI Agent replied "${r.said}" using ${r.model || 'the default model'}` });
    } catch (e) {
      setAiMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not reach the AI Agent') });
    } finally { setAiTesting(false); }
  }

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  /** Actually send one, and say what the mail server said. */
  async function sendTest() {
    setTesting(true); setTestMsg(null);
    try {
      const r = await api.testPlatformEmail(testTo.trim());
      setTestMsg({ ok: true, text: `✅ Sent to ${r.to} from ${r.from}. If it does not arrive, check the spam folder — that usually means the domain's SPF or DKIM records are missing.` });
    } catch (e) {
      setTestMsg({ ok: false, text: '⚠️ ' + (e.message || 'Could not send') });
    } finally { setTesting(false); }
  }

  useEffect(() => { api.platformSettings().then(d => setS(d.settings || {})).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    const tick = () => api.faceQueueStatus().then(d => { if (alive) setQstat(d); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 5000); // live refresh every 5s
    return () => { alive = false; clearInterval(iv); };
  }, []);
  if (!s) return null;

  async function save(next) {
    setS(next);
    /* "Every number" is an empty number id, and the server skips empty values
       so a blank box never wipes a key — so emptying it is asked for by name. */
    const payload = { ...next };
    try { await api.savePlatformSettings(payload); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function startEdit() {
    // 🔒 write-only keys: the secret boxes open empty — paste a new one, or leave empty to keep the current one
    setS(v => ({ ...v, ...Object.fromEntries(SECRET_FIELDS.map(k => [k, ''])) }));
    setEditing(true); setShow(false);
  }
  function stopEdit() {
    setEditing(false); setShow(false);
    // re-mask by reloading masked view
    api.platformSettings().then(d => setS(d.settings || {})).catch(() => {});
  }
  async function reindex() {
    if (!await dialog.confirm('Every photo will be re-processed with the current engine. All existing face data is cleared first, and this cannot be undone.', { title: 'Re-index all photos?', okLabel: 'Re-index everything' })) return;
    setReMsg('🔄 Resetting…');
    try { const r = await api.reindexAll(); setReMsg(`✅ Reset ${r.reset} photos — open each album and click Index Faces`); }
    catch (e) { setReMsg('⚠️ ' + e.message); }
    setTimeout(() => setReMsg(''), 6000);
  }
  const awsMode = s.aws_mode || 'aws_off';
  const awsUsed = awsMode === 'aws_on' || awsMode === 'aws_safety_net';
  const MODES = [
    { k: 'aws_off', icon: '🖥️', title: 'Local only', desc: 'Free. Runs on your server. Adapts to traffic (1–2 photos at a time).' },
    { k: 'aws_safety_net', icon: '🛟', title: 'Safety net', desc: 'Local normally — overflows to AWS only when photos pile up. Recommended.' },
    { k: 'aws_on', icon: '☁️', title: 'AWS always', desc: 'Every album on AWS Rekognition. Fastest, ~$1 per 1000 photos.' },
  ];
  // display value: masked unless editing+show
  const val = (k) => {
    // 🔒 always masked when just viewing — real values only appear in edit mode + Show
    if (!editing) return s[k] ? '••••••••••••' : '';
    if (show) return s[k] || '';
    return s[k] ? '••••••••••••' : '';
  };

  return (
    <>
      <div className="sa-section-title u-margin-top-22px">🧠 Face Recognition Engine</div>
      <div className="sa-box u-padding-18px">

        {/* 3-mode picker */}
        <div className="fr-modes">
          {MODES.map(m => (
            <button key={m.k} className={`fr-mode ${awsMode === m.k ? 'on' : ''}`} onClick={() => save({ ...s, aws_mode: m.k })}>
              <div className="fr-mode-top">{m.icon} {m.title}</div>
              <div className="fr-mode-desc">{m.desc}</div>
            </button>
          ))}
        </div>

        {/* live queue status */}
        {qstat && (
          <div className="fr-status">
            <span>📊 Backlog: <b>{qstat.backlog}</b></span>
            <span>⚙️ CPU load: <b>{qstat.load}</b>/{qstat.cores}</span>
            <span>🧵 Indexing: <b>{qstat.concurrency}</b> at a time</span>
            <span>{qstat.overflowing ? '🛟 Overflowing to AWS' : (qstat.aws_mode === 'aws_on' ? '☁️ AWS' : '🖥️ Local')}</span>
          </div>
        )}

        <div className="u-margin-14px-0">
          <button className="sa-btn-teal u-padding-7px-14px u-font-size-12_5px" onClick={reindex}>🔄 Re-index all photos</button>
          {reMsg && <span className="u-margin-left-10px u-font-size-12_5px u-color-muted">{reMsg}</span>}
        </div>

        {/* AWS credentials — collapsible, always masked until you choose to edit/show */}
        {awsUsed && (
          <div className="fr-cred">
            <button className="fr-cred-head" onClick={() => setCredOpen(o => !o)}>
              <span>🔑 AWS Credentials</span>
              <span className="fr-cred-chev">{credOpen ? '▲' : '▼'}</span>
            </button>

            {credOpen && (
              <div className="fr-cred-body">
                <div className="u-display-flex u-justify-content-flex-end u-margin-bottom-10px">
                  {!editing ? (
                    <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={startEdit}>✏️ Edit</button>
                  ) : (
                    <div className="u-display-flex u-gap-8px">
                      <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={() => setShow(v => !v)}>{show ? '🙈 Hide' : '👁️ Show'}</button>
                      <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                      <button className="u-padding-5px-12px u-font-size-12px u-background-panel-2 u-border-1px-solid-line u-border-radius-7px u-color-text u-cursor-pointer" onClick={stopEdit}>✕</button>
                    </div>
                  )}
                </div>
                <div className="u-display-grid u-grid-template-columns-1fr-1fr u-gap-12px">
                  <div><label className="lbl">AWS Access Key</label><input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} value={val('aws_access_key')} onChange={e => setS({ ...s, aws_access_key: e.target.value })} /></div>
                  <div><label className="lbl">AWS Secret Key</label><input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} value={val('aws_secret_key')} onChange={e => setS({ ...s, aws_secret_key: e.target.value })} /></div>
                  <div><label className="lbl">AWS Region</label><input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} value={val('aws_region')} onChange={e => setS({ ...s, aws_region: e.target.value })} /></div>
                </div>
              </div>
            )}
            {awsMode === 'aws_safety_net' && <div className="u-margin-top-8px u-font-size-12px u-color-muted">💡 AWS only kicks in when the local backlog gets deep, then hands back automatically.</div>}
          </div>
        )}

        {/* R2 is object storage and has nothing to do with the face engine. It
            was nested inside the AWS branch above, so on any account whose face
            mode is "Local only" — which is the default, and what live runs —
            the entire storage section simply did not exist. Two panels running
            identical code looked different, and the settings were unreachable
            on the one that mattered. */}
        <div className="fr-cred">
              <button type="button" className="fr-cred-head u-margin-top-26px"
                onClick={() => setR2Open(o => !o)} aria-expanded={r2Open}>
                <span>🪣 Cloudflare R2 storage</span>
                <span className="fr-cred-chev">{r2Open ? '▲' : '▼'}</span>
              </button>

              {r2Open && (
              <div className="fr-cred-body">
                {/* Its own Edit control. These fields share the read-only lock
                    with the AWS block above, but that block's Edit button only
                    renders when AWS mode is on — so with AWS off there was no
                    way to type in any of this at all. */}
                <div className="u-display-flex u-justify-content-flex-end u-margin-bottom-10px">
                  {!editing ? (
                    <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={startEdit}>✏️ Edit</button>
                  ) : (
                    <div className="u-display-flex u-gap-8px">
                      <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                      <button className="u-padding-5px-12px u-font-size-12px u-background-panel-2 u-border-1px-solid-line u-border-radius-7px u-color-text u-cursor-pointer" onClick={stopEdit}>✕</button>
                    </div>
                  )}
                </div>

              <div><label className="lbl">Account ID</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  value={s.r2_account_id || ''}
                  onChange={e => setS({ ...s, r2_account_id: e.target.value })} /></div>

              <div><label className="lbl">Shared Access Key ID</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  placeholder="used by either bucket with no key of its own"
                  value={s.r2_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Shared Secret Access Key</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  value={s.r2_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_secret_access_key: e.target.value })} /></div>

              {/* ── 🔒 private ─────────────────────────────────────────── */}
              <div className="sa-sec-hd u-margin-top-22px">🔒 Private bucket — client galleries &amp; File Flyer</div>
              <div className="u-font-size-12px u-color-muted u-margin-bottom-8px">
                Reached only by album password or share token. Public access must stay OFF on this bucket.
              </div>

              <div><label className="lbl">Bucket name</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} placeholder="iwopo-private"
                  value={s.r2_bucket_private || ''}
                  onChange={e => setS({ ...s, r2_bucket_private: e.target.value })} /></div>

              <div><label className="lbl">Access Key ID <span className="u-color-muted">— optional</span></label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_private_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_private_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Secret Access Key <span className="u-color-muted">— optional</span></label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                 
                  value={s.r2_private_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_private_secret_access_key: e.target.value })} /></div>

              {/* ── 🌐 public ──────────────────────────────────────────── */}
              <div className="sa-sec-hd u-margin-top-22px">🌐 Public bucket — website images &amp; logos</div>
              <div className="u-font-size-12px u-color-muted u-margin-bottom-8px">
                Deliberately world-readable. Nothing private should ever be written here.
              </div>

              <div><label className="lbl">Bucket name</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} placeholder="iwopo-public"
                  value={s.r2_bucket_public || ''}
                  onChange={e => setS({ ...s, r2_bucket_public: e.target.value })} /></div>

              <div><label className="lbl">Access Key ID <span className="u-color-muted">— optional</span></label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  placeholder="leave blank to use the shared key"
                  value={s.r2_public_access_key_id || ''}
                  onChange={e => setS({ ...s, r2_public_access_key_id: e.target.value })} /></div>

              <div><label className="lbl">Secret Access Key <span className="u-color-muted">— optional</span></label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                 
                  value={s.r2_public_secret_access_key || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                  onChange={e => setS({ ...s, r2_public_secret_access_key: e.target.value })} /></div>

              <div><label className="lbl">Public URL</label>
                <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                  placeholder="https://cdn.yourdomain.com"
                  value={s.r2_public_url || ''}
                  onChange={e => setS({ ...s, r2_public_url: e.target.value })} /></div>

              <div className="cb-warn u-margin-top-10px">
                🔒 The two buckets must be different. Galleries and File Flyer files are reached
                by password or share token — putting them in the public bucket lets anyone with
                the file&rsquo;s URL walk past both. Saving the same name for both is refused.
              </div>
              </div>
              )}
        </div>

        {/* 💳 Stripe Connect — vendors connect their OWN Stripe for client card payments (lib/stripeConnect.js) */}
        <div className="fr-cred">
          <div className="fr-cred-head sa-connect-head"><span>💳 Stripe Connect — client card payments</span></div>
          <div className="fr-cred-body">
            {/* its own Edit — the shared one sits inside folded sections, so these keys were otherwise read-only */}
            <div className="sa-connect-actions">
              {!editing
                ? <button type="button" className="sa-btn-teal sa-connect-btn" onClick={startEdit}>✏️ Edit</button>
                : <>
                    <button type="button" className="sa-btn-teal sa-connect-btn" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                    <button type="button" className="sa-connect-x" onClick={stopEdit}>✕</button>
                  </>}
            </div>
            <div><label className="lbl">Connect client ID (ca_…)</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} autoComplete="off" placeholder="ca_…"
                value={s.stripe_connect_client_id || ''} onChange={e => setS({ ...s, stripe_connect_client_id: e.target.value })} /></div>
            <div><label className="lbl">Connected-accounts webhook secret (whsec_…)</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing} autoComplete="off"
                placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''}
                value={s.stripe_connect_webhook_secret || ''} onChange={e => setS({ ...s, stripe_connect_webhook_secret: e.target.value })} /></div>
            <p className="sa-connect-note">From the Stripe dashboard → Connect settings (client ID) and Developers → Webhooks (the endpoint listening to connected accounts). Money from clients goes to each vendor&rsquo;s own Stripe — never through iwopo.</p>
          </div>
        </div>

        {/* 📧 Platform email.
            These were environment variables, which meant the one person who
            could set them had to edit a file on the server — so they never were,
            and nothing in the product could send anything at all. */}
        <div className="fr-cred">
          <button type="button" className="fr-cred-head u-margin-top-26px"
            onClick={() => setMailOpen(o => !o)} aria-expanded={mailOpen}>
            <span>📧 Platform email</span>
            <span className="fr-cred-chev">{mailOpen ? '▲' : '▼'}</span>
          </button>

          {mailOpen && (
          <div className="fr-cred-body">
            <div className="u-display-flex u-justify-content-flex-end u-margin-bottom-10px">
              {!editing ? (
                <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={startEdit}>✏️ Edit</button>
              ) : (
                <div className="u-display-flex u-gap-8px">
                  <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                  <button className="u-padding-5px-12px u-font-size-12px u-background-panel-2 u-border-1px-solid-line u-border-radius-7px u-color-text u-cursor-pointer" onClick={stopEdit}>✕</button>
                </div>
              )}
            </div>

            <p className="u-font-size-12_5px u-color-muted u-margin-0-0-14px u-line-height-1_55">
              Used for everything iwopo sends. A vendor who sets their own mail
              account under Setup Email uses that instead, so their clients see
              their address rather than ours.
            </p>

            <div><label className="lbl">Host</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                placeholder="smtp.resend.com"
                value={s.smtp_host || ''}
                onChange={e => setS({ ...s, smtp_host: e.target.value })} /></div>

            <div><label className="lbl">Port</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                placeholder="587"
                value={s.smtp_port || ''}
                onChange={e => setS({ ...s, smtp_port: e.target.value })} /></div>

            <div><label className="lbl">Username</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                value={s.smtp_user || ''}
                onChange={e => setS({ ...s, smtp_user: e.target.value })} /></div>

            <div><label className="lbl">Password</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} type="password" readOnly={!editing}
                value={s.smtp_pass || ''} placeholder={editing ? 'Paste a new one (empty keeps the current)' : ''} autoComplete="off"
                onChange={e => setS({ ...s, smtp_pass: e.target.value })} /></div>

            <div><label className="lbl">From address</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                placeholder="noreply@iwopo.com"
                value={s.smtp_from || ''}
                onChange={e => setS({ ...s, smtp_from: e.target.value })} /></div>

            <div><label className="lbl">From name</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} readOnly={!editing}
                placeholder="iwopo"
                value={s.smtp_from_name || ''}
                onChange={e => setS({ ...s, smtp_from_name: e.target.value })} /></div>

            {/* Mail fails quietly — a wrong port or a rejected password looks
                exactly like a saved form and silence. This actually sends one. */}
            <div className="sa-sec-hd u-margin-top-22px">Send a test</div>
            <div className="u-display-flex u-gap-8px u-align-items-center u-margin-top-8px">
              <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" placeholder="your@email.com"
                value={testTo} onChange={e => setTestTo(e.target.value)} />
              <button className="sa-btn-teal u-padding-7px-14px u-font-size-12_5px u-white-space-nowrap"
                disabled={testing} onClick={sendTest}>
                {testing ? 'Sending…' : 'Send test'}
              </button>
            </div>
            {testMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: testMsg.ok ? 'var(--green)' : 'var(--red)' }}>
                {testMsg.text}
              </div>
            )}
          </div>
          )}
        </div>

        {/* 🤖 The AI Agent — the platform owner's private assistant (Raj,
            2026-10-10). Its own key: the clients' chatbot keeps its key under
            AI Chat → API Key, so the two never share a bill. */}
        <div className="fr-cred">
          <button type="button" className="fr-cred-head u-margin-top-26px"
            onClick={() => setAiOpen(o => !o)} aria-expanded={aiOpen}>
            <span>🤖 AI Agent</span>
            <span className="fr-cred-chev">{aiOpen ? '▲' : '▼'}</span>
          </button>

          {aiOpen && (
          <div className="fr-cred-body">
            <div className="u-display-flex u-justify-content-flex-end u-margin-bottom-10px">
              {!editing ? (
                <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={startEdit}>✏️ Edit</button>
              ) : (
                <div className="u-display-flex u-gap-8px">
                  <button className="sa-btn-teal u-padding-5px-12px u-font-size-12px" onClick={() => { save(s); stopEdit(); }}>💾 Save</button>
                  <button className="u-padding-5px-12px u-font-size-12px u-background-panel-2 u-border-1px-solid-line u-border-radius-7px u-color-text u-cursor-pointer" onClick={stopEdit}>✕</button>
                </div>
              )}
            </div>

            <p className="u-font-size-12_5px u-color-muted u-margin-0-0-14px u-line-height-1_55">
              Your private AI Agent (panel → 🤖 AI Agent) — only you use it.
              The clients' chatbot has its own key under AI Chat → API Key. Get a
              key at console.anthropic.com — charged per use, a fraction of a
              cent per question.
            </p>

            <div><label className="lbl">API key</label>
              <input className={editing ? 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct' : 'u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct u-opacity-0_7 u-cursor-not-allowed'} type="password" readOnly={!editing}
                placeholder="sk-ant-…"
                value={s.agent_api_key || ''}
                onChange={e => setS({ ...s, agent_api_key: e.target.value })} /></div>

            <div className="sa-sec-hd u-margin-top-22px">Check the key</div>
            <div className="u-display-flex u-gap-8px u-align-items-center u-margin-top-8px">
              <button className="sa-btn-teal u-padding-7px-14px u-font-size-12_5px"
                disabled={aiTesting} onClick={testAi}>
                {aiTesting ? 'Checking…' : 'Say hello to the AI Agent'}
              </button>
              {/* 🗑️ Emptying the box and saving deliberately does NOT remove a
                  key — the form sends every field on every save, so that would
                  wipe working credentials by accident. Removing one is its own
                  act, which is also the only way to revoke a key that leaked. */}
              {s.agent_api_key && (
                <button style={{ padding: '7px 14px', fontSize: 12.5, background: 'var(--panel-2)',
                  border: '1px solid var(--line)', borderRadius: 7, color: 'var(--red)', cursor: 'pointer' }}
                  onClick={clearAiKey}>
                  🗑️ Remove key
                </button>
              )}
            </div>
            {aiMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: aiMsg.ok ? 'var(--green)' : 'var(--red)' }}>
                {aiMsg.text}
              </div>
            )}
            <GeminiVoiceSettings s={s} setS={setS} editing={editing} />
          </div>
          )}
        </div>

        {/* 📞 Calls & texts (Quo) are now each vendor's own: Calls & Messages → Calls & Texts → ⚙️ (2026-10-23) */}
        <p className="sa-hint">📞 Calls &amp; texts (Quo) are set up by each vendor in Calls &amp; Messages → ⚙️.</p>
        {msg && <div className="u-margin-top-10px u-font-size-12_5px u-color-green">{msg}</div>}
      </div>
    </>
  );
}

export function SettingsView({ saTheme, setSaTheme, user }) {
  return (
    <>
    <div className="sa-compact-row">
      <span className="sa-compact-lbl">🌗 Panel theme</span>
      <span className="sa-compact-seg">
        {['dark', 'light'].map(t => (
          <button key={t} type="button" onClick={() => setSaTheme(t)}
            className={`sa-seg-btn ${saTheme === t ? 'is-on' : ''}`}>
            {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
        ))}
      </span>
    </div>
    <AdminsView user={user} />
    <FaceEngineSettings />
    </>
  );
}


/* ---------- ADMINS ---------- */
/**
 * 🔐 The super admin's own account.
 *
 * The Edit button here did nothing, and it was the only place this was ever
 * meant to live — the super panel had no way to change its own name, email or
 * password, so the only route to a new password was editing the database by
 * hand. That is a bad position to be in on the day you need to rotate one.
 *
 * Email and password each demand the current password. Anyone sitting at an
 * unlocked laptop should not be able to take the account over in two clicks.
 */
function AdminsView({ user }) {
  const [open, setOpen] = useState(false);
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
      {/* One line rather than a four-column table with a header row above a
          single entry. If a second admin is ever added, this becomes a list of
          the same rows — the table can come back when it earns its header. */}
      <div className="sa-compact-row">
        <span className="sa-compact-lbl">🔐 {user?.name} <span className="sa-compact-dim">· {user?.email || 'raj@iwopo.com'}</span></span>
        <span className="sa-compact-seg">
          <span className="sa-badge active">super_admin</span>
          <button type="button" className={`sa-view-btn ${open ? 'active-btn' : ''}`} onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Edit'}
          </button>
        </span>
      </div>

      {open && (
        <div className="sa-box sa-acct">
          <div className="sa-acct-row">
            <label className="sa-acct-lbl">Display name</label>
            <input className="sa-set-input" value={name} onChange={e => setName(e.target.value)} />
            <button className="sa-view-btn" disabled={busy === 'name'} onClick={saveName}>
              {busy === 'name' ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="sa-acct-row">
            <label className="sa-acct-lbl">Sign-in email</label>
            <input className="sa-set-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="sa-view-btn" disabled={busy === 'email'} onClick={saveEmail}>
              {busy === 'email' ? 'Saving…' : 'Save'}
            </button>
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
            <button className="sa-view-btn" disabled={busy === 'pw'} onClick={savePassword}>
              {busy === 'pw' ? 'Saving…' : 'Change'}
            </button>
          </div>

          {msg && <div className="sa-acct-msg">{msg}</div>}
        </div>
      )}
    </>
  );
}
