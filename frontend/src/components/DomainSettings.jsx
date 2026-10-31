import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { setClientBase } from '../lib/clientBase';
import './domainSettings.css';

/**
 * 🌐 Settings → Web address (2026-10-31).
 *
 * Where a vendor's clients go: the free address every vendor gets (<slug>.iwopo.com) and, on the top plan, their own
 * domain. Connecting a domain only records it — scripts/domainProvisioner.js checks DNS every couple of minutes, fits
 * the padlock and switches it on by itself, so this screen just shows where that is up to (and re-asks while it moves).
 */
const STATUS = {
  none: ['Not connected', 'dm-chip-none'],
  pending: ['Waiting for your DNS', 'dm-chip-wait'],
  issuing: ['Setting up the padlock', 'dm-chip-wait'],
  live: ['Live', 'dm-chip-live'],
  error: ['We’ll retry automatically', 'dm-chip-err'],
};

function problem(own) {
  if (own.status === 'pending' && own.error === 'no_record') return 'We can’t see the record yet. New DNS records can take from a few minutes to a few hours to appear — we keep checking.';
  if (own.status === 'pending' && own.error === 'points_elsewhere') return 'Your domain answers, but it points somewhere else. Check the value of the record below.';
  if (own.status === 'error') return 'Setting up the padlock didn’t work this time. We try again automatically; if it keeps failing, check the record below.';
  return '';
}

export default function DomainSettings() {
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState('');
  const poll = useRef(null);

  const apply = (x) => { setD(x); setClientBase(x.client_base_url); };

  useEffect(() => {
    api.domainInfo().then(x => { apply(x); setDraft(x.own.domain || ''); }).catch(e => setNote('⚠️ ' + e.message));
  }, []);

  // while a domain is on its way, ask again every 30 seconds — the provisioner moves it on by itself
  useEffect(() => {
    clearInterval(poll.current);
    if (d && ['pending', 'issuing'].includes(d.own.status)) poll.current = setInterval(() => api.domainInfo().then(apply).catch(() => {}), 30_000);
    return () => clearInterval(poll.current);
  }, [d?.own.status]);

  if (!d) return note ? <p className="dm-note">{note}</p> : null;
  const own = d.own;
  const [label, chip] = STATUS[own.status] || STATUS.none;

  async function save(value) {
    setBusy(true); setNote('');
    try {
      const x = await api.saveDomain(value);
      apply(x); setDraft(x.own.domain || '');
      setNote(value ? '✅ Saved. Add the record below at your domain company — we’ll do the rest and email you when it’s live.' : '✅ Domain disconnected.');
    } catch (e) { setNote('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function checkNow() {
    setBusy(true); setNote('');
    try { const x = await api.checkDomain(); apply(x); setNote(x.ok ? '✅ Your domain points at us — it switches on within a few minutes.' : ''); }
    catch (e) { setNote('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function copy(v) {
    try { await navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(''), 1400); }
    catch { setNote('⚠️ Copying was blocked — select the text and copy it by hand.'); }
  }

  return (
    <div className="table-wrap dm">
      <h3 className="dm-h">🌐 Your web address</h3>
      <p className="dm-lead">Where your clients go: your inquiry form, packages, contracts, invoices and galleries.</p>
      <div className="dm-now">
        <span>Client links use</span>
        <b>{d.client_base_url.replace(/^https:\/\//, '')}</b>
        <button type="button" className="dm-copy" onClick={() => copy(d.client_base_url)}>{copied === d.client_base_url ? '✅' : '📋'}</button>
      </div>

      <section className="dm-card">
        <h4 className="dm-h4">🙂 Your free address</h4>
        {!d.subdomain.address && <p className="dm-text">Your studio name can’t be used as a web address. Ask us and we’ll sort it out.</p>}
        {d.subdomain.address && d.subdomain.live && <p className="dm-text"><b>https://{d.subdomain.address}</b> <span className="dm-chip dm-chip-live">Active</span></p>}
        {d.subdomain.address && !d.subdomain.live && (
          <p className="dm-text"><b>{d.subdomain.address}</b> is being switched on. Until then your links keep working on iwopo — nothing to do.</p>
        )}
      </section>

      <section className="dm-card">
        <h4 className="dm-h4">💎 Your own domain {own.allowed && <span className={`dm-chip ${chip}`}>{label}</span>}</h4>
        {!own.allowed ? (
          <p className="dm-text dm-locked">Part of our top plan: your clients see only your own domain (like <b>clients.yourstudio.com</b>) and your name — never iwopo.</p>
        ) : (
          <>
            <p className="dm-text">Use a domain you already own, e.g. <b>clients.yourstudio.com</b>. Add one record at your domain company; we check it, fit the padlock and switch it on — then email you.</p>
            <div className="dm-row">
              <input className="ac-kb-input dm-input" value={draft} placeholder="clients.yourstudio.com" disabled={busy}
                onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && save(draft.trim())} />
              {draft.trim() !== (own.domain || '') && <button type="button" className="refresh" disabled={busy || !draft.trim()} onClick={() => save(draft.trim())}>Connect</button>}
              {own.domain && own.status !== 'live' && <button type="button" className="refresh" disabled={busy} onClick={checkNow}>{busy ? 'Checking…' : 'Check now'}</button>}
              {own.domain && <button type="button" className="refresh dm-remove" disabled={busy} onClick={() => save('')}>Disconnect</button>}
            </div>
            {problem(own) && <p className="dm-problem">{problem(own)}</p>}
            {own.domain && own.status !== 'live' && own.instructions.length > 0 && (
              <>
                <p className="dm-text">Add {own.instructions.length === 1 ? 'this record' : 'these records'} in your domain’s DNS settings:</p>
                <div className="dm-dns">
                  <div className="dm-dns-r dm-dns-head"><span>Type</span><span>Name / Host</span><span>Value / Points to</span><span /></div>
                  {own.instructions.map(r => (
                    <div className="dm-dns-r" key={r.name}>
                      <span className="dm-dns-t">{r.type}</span>
                      <span>{r.name}</span>
                      <span className="dm-dns-v">{r.value || '—'}</span>
                      <button type="button" className="dm-copy" onClick={() => copy(r.value)} aria-label={`Copy the value for ${r.name}`}>{copied === r.value ? '✅' : '📋'}</button>
                    </div>
                  ))}
                </div>
                <p className="dm-text dm-small">Step-by-step for GoDaddy, Namecheap, Hostinger, Squarespace, Cloudflare and others: <a href="/guides/connect-your-own-domain" target="_blank" rel="noreferrer">How to connect your own domain</a></p>
              </>
            )}
            {own.status === 'live' && <p className="dm-text">✅ <b>https://{own.domain}</b> is live — every client link uses it.</p>}
          </>
        )}
      </section>
      {note && <p className="dm-note">{note}</p>}
    </div>
  );
}
