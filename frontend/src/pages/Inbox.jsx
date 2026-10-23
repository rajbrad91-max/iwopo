import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import { useInboxCounts, inboxChanged } from '../lib/inboxCounts.js';
import { SiInstagram, SiWhatsapp } from 'react-icons/si';   // the real brand icons (Simple Icons, CC0)
import './inbox.css';

const CommsView = lazy(() => import('./CommsView.jsx'));

/**
 * 📥 The owner's private inbox (Raj, 2026-10-22): one page, four tabs — Calls & Texts (Quo), Email (Gmail),
 * Instagram, WhatsApp. It lives inside the private Calls & Messages feature, so no other vendor can see it.
 */
const TABS = [['calls', '📞', 'Calls & Texts'], ['email', '📧', 'Email'],
  ['instagram', <SiInstagram key="ig" className="ib-brand ib-brand-ig" />, 'Instagram'], ['whatsapp', <SiWhatsapp key="wa" className="ib-brand ib-brand-wa" />, 'WhatsApp']];

export default function Inbox() {
  const [tab, setTab] = useState(() => {
    const q = new URLSearchParams(location.search).get('tab');
    return TABS.some(t => t[0] === q) ? q : (localStorage.getItem('inbox_tab') || 'calls');
  });
  const counts = useInboxCounts();
  const [gear, setGear] = useState(false);       // ⚙️ this tab's settings instead of its content
  const tabName = TABS.find(t => t[0] === tab)[2];
  const choose = (t) => { setGear(false); setTab(t); localStorage.setItem('inbox_tab', t); history.replaceState(null, '', t === 'calls' ? location.pathname : `${location.pathname}?tab=${t}`); };
  return (
    <div className={`ib ib-on-${tab}`}>
      <div className="ib-tabs" role="tablist">
        {TABS.map(([k, ic, name]) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-label={name} title={name} className={`ib-tab ${tab === k ? 'is-on' : ''}`} onClick={() => choose(k)}>
            <span className="ib-tab-ic" aria-hidden="true">{ic}</span><span className="ib-tab-txt"> {name}</span>
            {counts[k === 'calls' ? 'calls' : k] > 0 && <span className="ib-count" title={`${counts[k === 'calls' ? 'calls' : k]} unread`}>{counts[k === 'calls' ? 'calls' : k] > 99 ? '99+' : counts[k === 'calls' ? 'calls' : k]}</span>}
          </button>
        ))}
      </div>
      <div className="ib-head">
        <span className="ib-head-t">{tabName}{gear ? ' · Settings' : ''}</span>
        <button type="button" className={`ib-gear ${gear ? 'is-on' : ''}`} aria-pressed={gear} onClick={() => setGear(g => !g)}
          aria-label={gear ? 'Close settings' : `${tabName} settings`} title={gear ? 'Close settings' : 'Settings'}>{gear ? '✕' : '⚙️'}</button>
      </div>
      {gear ? <ChannelSettings tab={tab} /> : (<>
        {tab === 'calls' && <Suspense fallback={<p className="ib-quiet">Loading…</p>}><CommsView /></Suspense>}
        {tab === 'email' && <EmailTab />}
        {tab === 'instagram' && <Soon icon={<SiInstagram className="ib-brand ib-brand-ig" />} name="Instagram" what="Direct messages from your business Instagram, with replies from here." />}
        {tab === 'whatsapp' && <Soon icon={<SiWhatsapp className="ib-brand ib-brand-wa" />} name="WhatsApp" what="Chats from your WhatsApp Business number, with replies from here." />}
      </>)}
    </div>
  );
}

/** 🏷️ Filters, Gmail-style: From, To, Subject, Has the words, Doesn't have, Gmail label. Each shows as a chip in the Email tab. */
const BLANK_FILTER = { name: '', from: '', to: '', subject: '', has: '', not: '', label: '', ai: false };
function EmailFilters() {
  const dialog = useDialog();
  const [list, setList] = useState(null);
  const [labels, setLabels] = useState([]);
  const [edit, setEdit] = useState(null);     // the filter being created/edited
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.inboxEmailFilters().then(d => setList(d.filters || [])).catch(() => setList([]));
    api.inboxEmailLabels().then(d => setLabels(d.labels || [])).catch(() => {});
  }, []);
  async function persist(next, done) {
    setMsg('');
    try { const d = await api.inboxEmailSaveFilters(next); setList(d.filters); setEdit(null); setMsg(done); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  const saveEdit = () => persist(edit.id ? list.map(f => (f.id === edit.id ? edit : f)) : [...list, edit], `✅ "${edit.name}" saved — refresh the Email tab to see its chip.`);
  async function remove(f) {
    if (!await dialog.confirm(`The "${f.name}" chip goes away. Nothing in Gmail changes.`, { title: 'Delete this filter?', okLabel: 'Delete', danger: true })) return;
    persist(list.filter(x => x.id !== f.id), `🗑️ "${f.name}" deleted.`);
  }
  if (!list) return null;
  const field = (k, label, hint, ph) => (
    <>
      <label className="ib-keys-l" htmlFor={`ef-${k}`}>{label}{hint && <span>{hint}</span>}</label>
      <input id={`ef-${k}`} className="ib-input" autoComplete="off" spellCheck={false} placeholder={ph} value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} />
    </>
  );
  return (
    <div className="ib-keys">
      <p className="ib-keys-t">🏷️ Filters</p>
      {list.length === 0 && !edit && <p className="ib-quiet">No filters yet. Each filter becomes a chip at the top of your Email tab.</p>}
      {!edit && list.map(f => (
        <div key={f.id} className="ib-frow">
          <span className="ib-frow-n">🏷️ {f.name}{f.ai && <span className="ib-ai-tag">🧠 AI</span>}</span>
          <span className="ib-frow-r">{[f.from && `from ${f.from}`, f.to && `to ${f.to}`, f.subject && `subject "${f.subject}"`, f.has && `has "${f.has}"`, f.not && `not "${f.not}"`, f.label && `label ${f.label}`].filter(Boolean).join(' · ')}</span>
          <button className="ib-link" onClick={() => setEdit({ ...f })}>Edit</button>
          <button className="ib-link" onClick={() => remove(f)}>Delete</button>
        </div>
      ))}
      {edit ? (
        <div className="ib-fedit">
          {field('name', 'Name', 'shown on the chip', 'Inquiries')}
          {field('from', 'From', '', 'booking@perfectposes.ca')}
          {field('to', 'To', '', '')}
          {field('subject', 'Subject', '', 'New Inquiry from')}
          {field('has', 'Has the words', '', '')}
          {field('not', "Doesn't have", '', '')}
          <label className="ib-keys-l" htmlFor="ef-label">Gmail label <span>optional</span></label>
          <select id="ef-label" className="ib-input" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })}>
            <option value="">— any —</option>
            {[...new Set([...labels, edit.label].filter(Boolean))].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <label className="ib-check"><input type="checkbox" checked={!!edit.ai} onChange={e => setEdit({ ...edit, ai: e.target.checked })} /> 🧠 AI inquiry detector — also catch emails the AI recognises as client inquiries (checks every new email once)</label>
          <div className="ib-keys-row">
            <button className="ib-btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="ib-btn is-on" disabled={!edit.name.trim()} onClick={saveEdit}>Save filter</button>
          </div>
        </div>
      ) : <button className="ib-btn ib-fnew" onClick={() => setEdit({ ...BLANK_FILTER })}>＋ New filter</button>}
      {msg && <p className="ib-msg">{msg}</p>}
    </div>
  );
}

/** 📞 The vendor's own Quo connection — API key and webhook secrets are write-only; the number is picked from Quo's list. */
function QuoKeys({ onSaved }) {
  const dialog = useDialog();
  const [info, setInfo] = useState(null);
  const [key, setKey] = useState('');
  const [secrets, setSecrets] = useState('');
  const [numbers, setNumbers] = useState(null);
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api.quoSettings().then(d => { setInfo(d); setNum(d.phone_number_id || ''); }).catch(() => setInfo({ has_key: false }));
  useEffect(() => { load(); }, []);
  async function list() {
    setMsg('');
    try { const d = await api.quoNumbers(key.trim()); setNumbers(d.numbers || []); setMsg(`✅ ${(d.numbers || []).length} number(s) found — pick one, or every number.`); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function save() {
    setBusy(true); setMsg('');
    try { await api.saveQuoSettings({ api_key: key.trim(), webhook_secrets: secrets.trim(), phone_number_id: num }); setKey(''); setSecrets(''); setMsg('✅ Saved'); load(); onSaved && onSaved(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!await dialog.confirm('Calls and texts will stop arriving here. Everything already here stays.', { title: 'Remove the Quo connection?', okLabel: 'Remove', danger: true })) return;
    await api.removeQuoSettings().catch(() => {}); setNumbers(null); load(); onSaved && onSaved();
  }
  if (!info) return null;
  const named = numbers?.find(n => n.id === num);
  return (
    <div className="ib-keys">
      <p className="ib-keys-t">🔑 Quo connection</p>
      {info.has_key && <p className="ib-quiet">Saved: API key <b>{info.key_hint}</b> · {info.secrets} webhook secret{info.secrets === 1 ? '' : 's'}. Fill a box only to replace it.</p>}
      <label className="ib-keys-l" htmlFor="quo-key">Quo API key</label>
      <input id="quo-key" name="quo-key" className="ib-input ib-secret" autoComplete="off" data-1p-ignore data-lpignore="true" spellCheck={false}
        placeholder={info.has_key ? 'Empty keeps the saved one' : 'Paste your Quo API key'} value={key} onChange={e => setKey(e.target.value)} />
      <div className="ib-keys-row ib-keys-left">
        <button className="ib-btn" onClick={list} disabled={!key.trim() && !info.has_key}>List my numbers</button>
        <select className="ib-input ib-num" value={num} onChange={e => setNum(e.target.value)} aria-label="Phone number">
          <option value="">Every number on the account</option>
          {(numbers || []).map(n => <option key={n.id} value={n.id}>{n.name ? `${n.name} · ` : ''}{n.number}</option>)}
          {num && !named && <option value={num}>{num} (press "List my numbers" to name it)</option>}
        </select>
      </div>
      <textarea className="ib-input" rows={3} spellCheck={false} autoComplete="off" value={secrets} onChange={e => setSecrets(e.target.value)}
        placeholder={info.has_key ? 'Webhook signing secrets, one per line (empty keeps the saved ones)' : 'Webhook signing secrets from Quo, one per line'} />
      <p className="ib-quiet">In Quo, point the webhooks to:</p>
      <code className="ib-keys-code">{info.webhook_url}</code>
      {msg && <p className="ib-msg">{msg}</p>}
      <div className="ib-keys-row">
        {info.has_key && <button className="ib-btn" onClick={remove}>Remove connection</button>}
        <button className="ib-btn is-on" disabled={busy || (!info.has_key && !key.trim())} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <p className="ib-quiet ib-keys-note">🔒 Stored encrypted for your account only. The key and secrets can't be viewed again.</p>
    </div>
  );
}

/** ⚙️ One channel's settings (Raj, 2026-10-23): what it's connected to, and how to change it. */
function ChannelSettings({ tab }) {
  const dialog = useDialog();
  const [st, setSt] = useState(null);
  const load = useCallback(() => {
    if (tab === 'calls') api.commsStatus().then(setSt).catch(() => setSt({ connected: false }));
    else if (tab === 'email') api.inboxEmailStatus().then(setSt).catch(() => setSt({ connected: false }));
    else setSt({ connected: false });
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  async function disconnect() {
    if (!await dialog.confirm('iwopo will stop reading and sending from this mailbox. Your emails stay in Gmail.', { title: 'Disconnect email?', okLabel: 'Disconnect', danger: true })) return;
    await api.inboxEmailDisconnect().catch(() => {}); load();
  }
  if (!st) return <p className="ib-quiet">Loading…</p>;
  if (tab === 'calls') return (
    <div className="ib-set">
      <p className="ib-set-row"><b>Business phone line</b><span>{st.sandbox ? '🧪 Practice mode (test site)' : st.connected ? `● Connected${st.from ? ` · ${st.from}` : ''}` : '○ Not connected yet'}</span></p>
      <p className="ib-quiet">Calls and texts on this line appear in this tab by themselves.</p>
      <QuoKeys onSaved={load} />
    </div>
  );
  if (tab === 'email') return (
    <div className="ib-set">
      <p className="ib-set-row"><b>Mailbox</b><span>{st.sandbox ? '🧪 Practice mode (test site)' : st.connected ? `● ${st.email}` : '○ Not connected yet'}</span></p>
      {st.connected && !st.sandbox && <button type="button" className="ib-btn" onClick={disconnect}>Disconnect this mailbox</button>}
      <EmailFilters />
      <EmailKeys onSaved={load} />
    </div>
  );
  return (
    <div className="ib-set">
      <p className="ib-set-row"><b>{tab === 'instagram' ? 'Instagram account' : 'WhatsApp number'}</b><span>○ Not connected yet</span></p>
      <p className="ib-quiet">Its connection settings will appear here once {tab === 'instagram' ? 'Instagram' : 'WhatsApp'} is supported.</p>
    </div>
  );
}

function Soon({ icon, name, what }) {
  return (
    <div className="ib-empty">
      <div className="ib-empty-art" aria-hidden="true">{icon}</div>
      <p className="ib-empty-t">{name} isn&apos;t connected yet</p>
      <p className="ib-quiet">{what}</p>
    </div>
  );
}

const when = (d) => { const t = new Date(d); return Date.now() - t < 86400e3 ? t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const nameOf = (from) => String(from || '').replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from;
const addrOf = (from) => { const m = String(from || '').match(/<([^>]+)>/); return m ? m[1] : from; };

/** 🔑 The vendor's own Google keys — made in THEIR Google account, pasted here, stored encrypted; the secret is never shown again. */
function EmailKeys({ onSaved, onCancel }) {
  const [info, setInfo] = useState(null);
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.inboxEmailApp().then(setInfo).catch(() => setInfo({ has_app: false })); }, []);
  const redirect = `${location.origin}/api/inbox/gmail/callback`;
  async function save() {
    setErr(''); setBusy(true);
    try { await api.inboxEmailSaveApp({ client_id: id, client_secret: secret }); setId(''); setSecret(''); onSaved(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="ib-keys">
      <p className="ib-keys-t">🔑 Your email keys</p>
      <p className="ib-quiet">Created in <b>your own</b> Google account (Google Cloud → Credentials → OAuth client, type Web application). Its redirect address must be:</p>
      <code className="ib-keys-code">{redirect}</code>
      {info?.has_app && <p className="ib-quiet">Saved now: <b>{info.client_id_hint}</b>. Paste new keys only to replace them.</p>}
      <label className="ib-keys-l" htmlFor="gm-client-id">Client ID <span>ends in .apps.googleusercontent.com</span></label>
      <input id="gm-client-id" name="gm-client-id" className="ib-input" placeholder="1234567890-abc123.apps.googleusercontent.com" value={id}
        onChange={e => setId(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" spellCheck={false} />
      <label className="ib-keys-l" htmlFor="gm-client-secret">Client secret <span>starts with GOCSPX-</span></label>
      <input id="gm-client-secret" name="gm-client-secret" className="ib-input ib-secret" placeholder={info?.has_app ? 'Empty keeps the saved one' : 'GOCSPX-…'} value={secret}
        onChange={e => setSecret(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" spellCheck={false} />
      {err && <p className="ib-msg" role="alert">⚠️ {err}</p>}
      <div className="ib-keys-row">
        {onCancel && <button className="ib-btn" onClick={onCancel}>Cancel</button>}
        <button className="ib-btn is-on" disabled={busy || !id.trim() || (!secret.trim() && !info?.has_app)} onClick={save}>{busy ? 'Saving…' : 'Save keys'}</button>
      </div>
      <p className="ib-quiet ib-keys-note">🔒 Stored encrypted for your account only. The secret can't be viewed again, here or by anyone at iwopo.</p>
    </div>
  );
}

function EmailTab() {
  const dialog = useDialog();
  const [status, setStatus] = useState(null);
  const [threads, setThreads] = useState(null);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [open, setOpen] = useState(null);       // a thread being read
  const [drafts, setDrafts] = useState(() => { try { return JSON.parse(sessionStorage.getItem('ib_drafts') || '{}'); } catch { return {}; } });
  useEffect(() => { try { sessionStorage.setItem('ib_drafts', JSON.stringify(drafts)); } catch { /* storage full: drafts stay in memory */ } }, [drafts]);
  const [compose, setCompose] = useState(null); // { to, subject, body }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => new URLSearchParams(location.search).get('email_error') || '');

  useEffect(() => { api.inboxEmailStatus().then(setStatus).catch(e => setStatus({ connected: false, error: e.message })); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qLive.trim()), 350); return () => clearTimeout(t); }, [qLive]);
  const [filters, setFilters] = useState([]);                                         // 🏷️ the vendor's own filters
  const [view, setView] = useState(() => localStorage.getItem('ib_filter') || 'all');   // 'all' or a filter's id
  const pickView = (x) => { setView(x); localStorage.setItem('ib_filter', x); setThreads(null); };
  useEffect(() => { if (status?.connected) api.inboxEmailFilters().then(d => setFilters(d.filters || [])).catch(() => {}); }, [status?.connected]);
  const [next, setNext] = useState(null);         // the next page's token ("Load more")
  const [more, setMore] = useState(false);
  const load = useCallback(() => { api.inboxEmailThreads(q, view).then(d => { setThreads(d.threads || []); setNext(d.next || null); }).catch(e => { setThreads([]); setNext(null); setMsg(e.message); }); }, [q, view]);
  async function notInquiry() {
    const id = open.id;
    try {
      const r = await api.inboxNotInquiry(id);
      setThreads(t => (t || []).filter(x => x.id !== id)); setOpen(null);
      setMsg(r.sender ? `🚫 Removed — emails from ${r.sender} won't show as inquiries again.` : '🚫 Removed.');
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function loadMore() {
    setMore(true);
    try { const d = await api.inboxEmailThreads(q, view, next); setThreads(t => [...(t || []), ...(d.threads || []).filter(x => !(t || []).some(y => y.id === x.id))]); setNext(d.next || null); }
    catch (e) { setMsg(e.message); }
    finally { setMore(false); }
  }
  useEffect(() => { if (status?.connected) load(); }, [status?.connected, load]);

  async function connect() {
    try { const d = await api.inboxEmailConnect(); location.href = d.url; } catch (e) { setMsg(e.message); }
  }
  async function read(id) {
    setOpen({ id, loading: true });
    try { setOpen(await api.inboxEmailThread(id)); setThreads(t => (t || []).map(x => (x.id === id ? { ...x, unread: false } : x))); inboxChanged(); }
    catch (e) { setOpen(null); setMsg(e.message); }
  }
  async function send(payload, after) {
    setBusy(true); setMsg('');
    try { const r = await api.inboxEmailSend(payload); setMsg(r.sandbox ? '🧪 Practice mode: not really sent.' : '✅ Sent'); after(); load(); }
    catch (e) { setMsg(`⚠️ Not sent: ${e.message} Your text is kept.`); }
    finally { setBusy(false); }
  }
  const reply = open?.id ? (drafts[open.id] || '') : '';
  const setReply = (t) => { if (open?.id) setDrafts(d => { const n = { ...d }; if (t) n[open.id] = t; else delete n[open.id]; return n; }); };

  function sendReply() {
    const last = open.messages[open.messages.length - 1];
    const to = addrOf(last.from === status.email ? last.to : last.from);
    send({ to, subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, body: reply, threadId: open.id, replyTo: { messageId: last.messageId, references: last.references } },
      () => { setReply(''); read(open.id); });
  }
  async function closeCompose() {
    if ((compose.body || compose.to).trim() && !await dialog.confirm('Your email has not been sent. Discard it?', { title: 'Discard draft?', okLabel: 'Discard', danger: true })) return;
    setCompose(null);
  }

  if (!status) return <p className="ib-quiet">Loading…</p>;
  if (!status.connected) {
    return (
      <div className="ib-empty">
        <div className="ib-empty-art" aria-hidden="true">📧</div>
        <p className="ib-empty-t">Email isn&apos;t connected yet</p>
        <p className="ib-quiet">Connect your business Gmail to read and answer client emails here, next to their calls and texts.</p>
        {status.configured
          ? <button className="ib-btn is-on" onClick={connect}>Connect Gmail</button>
          : <EmailKeys onSaved={() => api.inboxEmailStatus().then(setStatus).catch(() => {})} />}
        {msg && <p className="ib-msg">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="ib-mail">
      <div className="ib-bar">
        <input className="ib-search" type="search" placeholder="Search email" value={qLive} onChange={e => setQLive(e.target.value)} aria-label="Search email" />
        <button className="ib-btn is-on" onClick={() => setCompose({ to: '', subject: '', body: '' })}>＋ New email</button>
        <span className={`ib-pill ${status.sandbox ? 'is-practice' : 'is-on'}`} title={status.sandbox ? 'Test site only: nothing is really sent' : 'Connected'}>
          {status.sandbox ? '● Practice mode' : `● ${status.email}`}
        </span>
      </div>
      {msg && <p className="ib-msg">{msg}</p>}
      <div className="ib-fchips" role="tablist" aria-label="Filters">
        <button type="button" role="tab" aria-selected={view === 'all'} className={`ib-fchip ${view === 'all' ? 'is-on' : ''}`} onClick={() => pickView('all')}>📥 All</button>
        {filters.map(f => (
          <button key={f.id} type="button" role="tab" aria-selected={view === f.id} className={`ib-fchip ${view === f.id ? 'is-on' : ''}`} onClick={() => pickView(f.id)}>🏷️ {f.name}</button>
        ))}
      </div>

      <div className={`ib-cols ${open ? 'has-open' : ''}`}>
        <ul className="ib-list">
          {threads === null ? <li className="ib-quiet">Loading…</li>
            : threads.length === 0 ? <li className="ib-quiet">{q ? `No results for "${q}".` : view !== 'all' ? 'No emails match this filter. Edit it in ⚙️ → Filters.' : 'No emails yet.'}</li>
            : threads.map(t => (
              <li key={t.id}>
                <button className={`ib-row ${t.unread ? 'is-unread' : ''} ${open?.id === t.id ? 'is-on' : ''}`} onClick={() => read(t.id)}>
                  <span className="ib-row-top"><b>{nameOf(t.from)}</b><span className="ib-when">{when(t.date)}</span></span>
                  <span className="ib-row-sub">{t.subject}</span>
                  <span className="ib-row-snip">{t.snippet}</span>
                </button>
              </li>
            ))}
          {next && threads?.length > 0 && <li className="ib-more"><button type="button" className="ib-btn" disabled={more} onClick={loadMore}>{more ? 'Loading…' : 'Load more'}</button></li>}
        </ul>

        {open && (
          <div className="ib-thread">
            <div className="ib-thread-h">
              <button className="ib-link" onClick={() => setOpen(null)}>‹ Back</button>
              <h3 className="ib-thread-t">{open.subject || '…'}</h3>
              {filters.find(f => f.id === view)?.ai && <button type="button" className="ib-link ib-notinq" onClick={notInquiry} title="Remove it, and skip this sender from now on">🚫 Not an inquiry</button>}
            </div>
            {open.loading ? <p className="ib-quiet">Loading…</p> : (<>
              {open.messages.map(m => (
                <div key={m.id} className={`ib-m ${addrOf(m.from) === status.email ? 'is-out' : ''}`}>
                  <div className="ib-m-h"><b>{nameOf(m.from)}</b><span className="ib-when">{new Date(m.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                  <div className="ib-m-body">{m.body || '(no text)'}</div>
                </div>
              ))}
              <div className="ib-reply">
                <textarea className="ib-input" rows={4} placeholder="Write a reply…" value={reply} onChange={e => setReply(e.target.value)} />
                <button className="ib-btn is-on" disabled={busy || !reply.trim()} onClick={sendReply}>{busy ? 'Sending…' : 'Send reply'}</button>
              </div>
            </>)}
          </div>
        )}
      </div>

      {compose && (
        <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeCompose(); }}>
          <div className="dlg-panel ib-compose" role="dialog" aria-label="New email">
            <h3 className="dlg-title">New email</h3>
            {status.sandbox && <p className="ib-practice">🧪 Practice mode (test site): nothing is ever sent.</p>}
            <p className="dlg-msg">From: <b>{status.email}</b></p>
            <input className="dlg-input" type="email" placeholder="To: client@example.com" value={compose.to} onChange={e => setCompose({ ...compose, to: e.target.value })} />
            <input className="dlg-input" placeholder="Subject" value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} />
            <textarea className="dlg-input" rows={7} placeholder="Message" value={compose.body} onChange={e => setCompose({ ...compose, body: e.target.value })} />
            <div className="dlg-actions">
              <button className="dlg-btn" onClick={closeCompose}>Cancel</button>
              <button className="dlg-btn is-primary" disabled={busy} onClick={() => send(compose, () => setCompose(null))}>{busy ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
