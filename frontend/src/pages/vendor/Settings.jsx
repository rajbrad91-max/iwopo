/**
 * ⚙️ Settings: account, look, email, devices and more.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useCallback } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api, fmtDateTime, fmtMoney, applyVendorClock } from '../../lib/api';
import EmailSetup from '../../components/EmailSetup';
import EmailTemplates from '../../components/EmailTemplates';
import DomainSettings from '../../components/DomainSettings';
import StripeConnectCard from '../../components/StripeConnect';
import ClientLinksSettings from '../../components/ClientLinksSettings';
import { AccountSettings } from './AccountSettings';
import { applyTheme } from '../../lib/theme';


/**
 * 🔑 Devices — the machines allowed to upload on this vendor's behalf.
 *
 * The live-shoot watcher needs credentials that do not expire, and a login
 * token lasts seven days. This is where those are made and, more importantly,
 * KILLED: a laptop that goes missing at a wedding should be switched off by
 * the person who lost it, not by waiting for somebody else to do it.
 */
function DevicesSetup() {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState(null);      // the token, shown once
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.devices().then(d => setRows(d.devices || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim()) return dialog.alert('Give it a name, so you know which machine it is.', { error: true });
    setBusy(true);
    try {
      const d = await api.addDevice(name.trim());
      /* Held in state rather than refetched, because it cannot be fetched —
         only the hash is stored. This is the one moment it exists in readable
         form anywhere. */
      setFresh(d.token);
      setName('');
      load();
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setBusy(false); }
  }

  async function revoke(d) {
    if (!await dialog.confirm(
      `"${d.name}" will stop being able to upload immediately. This cannot be undone — you would make a new one.`,
      { title: 'Switch off this device?', okLabel: 'Switch off' })) return;
    try { await api.deleteDevice(d.id); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }
  }

  return (
    <div className="table-wrap u-padding-22px">
      <h2 className="u-margin-top-0">🔑 Devices</h2>
      <p className="u-font-size-13px u-color-muted u-line-height-1_6 u-margin-top-0">
        A device is a computer allowed to upload photos on its own — the live
        shoot watcher on your editing machine. A device can only upload: it
        cannot read your leads, delete a gallery, or change anything.
      </p>

      <div className="u-display-flex u-gap-8px u-margin-18px-0">
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-10px u-width-100pct u-margin-0" placeholder="Editing desktop"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="refresh u-white-space-nowrap" disabled={busy} onClick={add}>
          {busy ? 'Making…' : '+ Add device'}
        </button>
      </div>

      {/* Shown once and never again — there is no route that can reveal it,
          because a list that can show its own credentials is a list of keys. */}
      {fresh && (
        <div className="dev-fresh">
          <div className="u-font-size-13px u-font-weight-700 u-margin-bottom-8px">
            Copy this now — it cannot be shown again
          </div>
          <code className="dev-token">{fresh}</code>
          <div className="u-display-flex u-gap-8px u-margin-top-10px">
            <button className="refresh u-font-size-12px"
              onClick={() => { navigator.clipboard?.writeText(fresh); }}>📋 Copy</button>
            <button className="refresh u-font-size-12px" onClick={() => setFresh(null)}>Done</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="u-font-size-13px u-color-muted">No devices yet.</p>
      ) : (
        <table className="tbl"><thead><tr>
          <th>Name</th><th>Last used</th><th>Added</th><th></th>
        </tr></thead><tbody>
          {rows.map(d => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td className="dev-date">{d.last_used ? fmtDateTime(d.last_used) : 'never'}</td>
              <td className="dev-date">{fmtDateTime(d.created_at)}</td>
              <td><button className="refresh dev-off" onClick={() => revoke(d)}>Switch off</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}

export function SettingsView({ user, onProfileChange, emailFocus = null, onFocusUsed }) {
  const [s, setS] = useState(null);
  /* ✉️ Another page can open Setup Email on one template. Kept here: the panel clears its request at once, and the
     template list only mounts after the settings have loaded. */
  const [startKind] = useState(emailFocus);
  const [sub, setSub] = useState(emailFocus ? 'email' : 'prefs');
  useEffect(() => { if (emailFocus) onFocusUsed?.(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  const [saved, setSaved] = useState('');
  // 💱 the choices come from the server so the country-to-currency rules live in
  // one place; `chosen` being null means they're following their country
  const [currencies, setCurrencies] = useState([]);
  const [chosenCurrency, setChosenCurrency] = useState(null);
  const [zones, setZones] = useState([]);

  useEffect(() => {
    api.mySettings().then(async d => {
      const settings = await applyVendorClock(d);
      setS(settings || { time_format: '12h', theme: 'system', timezone: '' });
      setZones(d.zones || []);
      setChosenCurrency(d.chosen_currency || '');
    }).catch(() => setS({ time_format: '12h', theme: 'system', timezone: '' }));
    api.myCurrencies().then(d => setCurrencies(d.currencies || [])).catch(() => {});
  }, []);

  /* the country on the profile decides the timezone and currency, so they are read again after it is saved */
  async function refreshSettings() {
    const d = await api.mySettings();
    setS(await applyVendorClock(d));
    setZones(d.zones || []);
  }
  async function savePrefs(next) {
    setS(next); setSaved('');
    // 🌗 apply theme live + persist
    applyTheme(next.theme || 'system');
    localStorage.setItem('vf_time_format', next.time_format || '12h');
    localStorage.setItem('vf_timezone', next.timezone || '');
    if (next.currency) localStorage.setItem('vf_currency', next.currency);
    try { await api.saveSettings(next); setSaved('✅ Saved'); setTimeout(() => setSaved(''), 1500); }
    catch (e) { setSaved('⚠️ ' + e.message); }
  }
  if (!s) return <div className="loading">Loading…</div>;

  return (
    <div className="set-page">
      {/* tabs across the top, the page below; Setup Email uses the width for the templates (Raj, 2026-11-14) */}
      <div className="set-tabbar" role="tablist">
        {[['prefs', 'Preferences'], ['account', 'Account'], ['email', 'Setup Email'], ['devices', 'Devices'], ['address', 'Web address'], ['links', 'Client page links']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} className={`set-tab${sub === k ? ' is-on' : ''}`} onClick={() => setSub(k)}>{label}</button>
        ))}
      </div>
      <div className={sub === 'email' || sub === 'account' ? 'set-split' : 'set-body'}>

      {/* Preferences */}
      {sub === 'prefs' && (
      <div className="table-wrap u-padding-22px">
        <h2 className="u-margin-top-0">🕐 Preferences {saved && <span className="u-font-size-13px u-color-green">{saved}</span>}</h2>

        <label className="u-font-size-13px u-color-muted">Time format</label>
        <div className="u-display-flex u-gap-8px u-margin-top-6px">
          {['12h', '24h'].map(t => (
            <button key={t} onClick={() => savePrefs({ ...s, time_format: t })}
              className={`refresh set-pick${s.time_format === t ? ' is-on' : ''}`}>
              {t === '12h' ? '12-hour (2:30 PM)' : '24-hour (14:30)'}
            </button>
          ))}
        </div>

        <label className="set-theme-label">Theme</label>
        <div className="set-theme-row">
          {[['system', '🖥️ Match my device'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => savePrefs({ ...s, theme: t })}
              className={`refresh set-theme-btn${(s.theme || 'system') === t ? ' is-on' : ''}`}>{label}</button>
          ))}
        </div>

        <label className="u-font-size-13px u-color-muted u-display-block u-margin-top-14px">Timezone</label>
        {zones.length > 1 ? (
          <select className="pref-static" value={s.timezone || ''} onChange={e => savePrefs({ ...s, timezone: e.target.value })}>
            {zones.map(z => <option key={z.tz} value={z.tz}>{z.city}</option>)}
          </select>
        ) : (
          <div className="pref-static">{zones[0]?.city || s.timezone || 'Set your country under Account'}</div>
        )}
        <div className="pref-hint">
          🌍 The largest city in your timezone, from the country on your profile.
        </div>

        {/* 💱 What this vendor charges in. iwopo is used in more than one
            country, so a bare number on an invoice tells a client in London the
            wrong thing. It follows the country on their profile unless they say
            otherwise — a preference, not a question they have to answer. */}
        <label className="u-font-size-13px u-color-muted u-display-block u-margin-top-14px" htmlFor="pf-cur">Currency</label>
        <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-10px u-width-100pct u-margin-top-6px" id="pf-cur" value={chosenCurrency || ''}
          onChange={e => { setChosenCurrency(e.target.value); savePrefs({ ...s, currency: e.target.value }); }}>
          <option value="">Follow my country{s.currency ? ` (${s.currency})` : ''}</option>
          {currencies.map(c => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
        <div className="u-font-size-11px u-color-muted u-margin-top-4px">
          💰 Your packages, invoices and what clients see are all shown in {s.currency || 'USD'}.
          {' '}Example: {fmtMoney(1250, { currency: s.currency })}
        </div>

        <StripeConnectCard />

        {/* 🔒 Payment privacy (Raj, 2026-10-23): off = amounts always visible; on = hidden in a booking until 👁 is tapped */}
        <label className="pref-toggle">
          <input type="checkbox" checked={!!s.hide_payments} onChange={e => savePrefs({ ...s, hide_payments: e.target.checked })} />
          <span>🔒 Payment privacy</span>
        </label>
        <div className="pref-hint">
          {s.hide_payments
            ? 'On: payment amounts in a booking stay hidden until you tap 👁️ beside "Payments".'
            : 'Off: payment amounts are always shown. Turn on to keep them hidden until you tap 👁️.'}
        </div>
      </div>
      )}

      {sub === 'account' && <AccountSettings user={user} onProfileChange={onProfileChange} onProfileSaved={refreshSettings} />}

      {sub === 'email' && <><EmailSetup /><EmailTemplates startKind={startKind} /></>}
      {sub === 'devices' && <DevicesSetup />}
      {sub === 'address' && <DomainSettings />}
      {sub === 'links' && <ClientLinksSettings />}
      </div>
    </div>
  );
}
