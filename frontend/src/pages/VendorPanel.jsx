import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useInboxCounts } from '../lib/inboxCounts.js';
import FileFlyerView from './FileFlyerView';
import { useDialog } from '../lib/dialog.jsx';
import { applyBrandTone } from '../lib/brandTone.js';
import { api, getUser, logout, applyVendorClock } from '../lib/api';
import { useAppRoute } from '../lib/appRoute';
import { useActivityPing } from '../lib/activityPing';
import './inquiry.css';
import './contractdoc.css';
import PlansView from './PlansView.jsx';
import RequestsView from './RequestsView.jsx';
import './vendor.css';
import { setClientBase } from '../lib/clientBase';
import BillingBanner from '../components/BillingBanner';
import HelpView from '../components/HelpView';
import MyServicesView from '../components/MyServices';
import WelcomeSteps from '../components/WelcomeSteps';
import PpmBoard from '../components/PpmBoard';
import NavIcon from '../components/NavIcon';
import { applyTheme } from '../lib/theme';
// ✂️ each screen lives in its own file (pages/vendor/ — code audit #2, 2026-11-11)
import { NotifBell } from './vendor/NotifBell';
import { AiChatVendorView } from './vendor/AiChat';
import { GalleriesView } from './vendor/Galleries';
import { CrewView } from './vendor/Crew';
import { CalendarView } from './vendor/Calendar';
import { DashHome } from './vendor/DashHome';
import { LeadsView } from './vendor/Leads';
import { ContractsTab } from './vendor/Contracts';
import { csLeaveGuard } from './vendor/ContractSetup';
import { BookingsView } from './vendor/Bookings';
import { InqFormSettings } from './vendor/InquiryFormSettings';
import { PackagesView } from './vendor/Packages';
import { SettingsView } from './vendor/Settings';
import { ReferForm } from './vendor/ReferForm';
import { WebsiteView } from './vendor/Website';

/* 🔒 Loaded on demand, not bundled with everything else.
   These are private features. In one bundle their code is downloaded by every
   vendor who opens the panel — they cannot USE them, the data is behind
   gate(), but they can read the screens. Split out, the file is only fetched
   when somebody opens the page, which only a vendor holding the feature can
   do. It is not hidden from anybody; it is never sent to them.
   The rest of the panel loads faster as a side effect. */
const AnalyticsView = lazy(() => import('./AnalyticsView.jsx'));
const Inbox = lazy(() => import('./Inbox.jsx'));   // 📥 Calls & Texts + Email (+ Instagram, WhatsApp) — CommsView lives inside it
const RawSelectorView = lazy(() => import('./RawSelectorView.jsx'));
const AgentView = lazy(() => import('./AgentView.jsx'));
const ScreenPop = lazy(() => import('./ScreenPop.jsx'));      // 📞 private — part of Calls & messages
const OccasionsView = lazy(() => import('./OccasionsView.jsx'));

// 🗝️ tab → required feature (one map controls everything)
const TAB_FEATURE = {
  leads: 'leads', bookings: 'leads', packages: 'leads', inqform: 'leads',
  contracts: 'contracts', crew: 'crew', calendar: 'calendar', galleries: 'galleries',
  website: 'website', fileflyer: 'fileflyer', analytics: 'analytics', comms: 'comms', liveshoot: 'liveshoot', rawsel: 'rawsel', agent: 'agent',
  /* 🖨️ Rides on galleries, not its own key. It is a view of what clients sent
     from their galleries, so anybody with galleries should have it — mapping
     it to a feature nobody sells locked it behind a plan that will never
     include it. */
  requests: 'galleries',
  /* 🔒 Private to the platform owner — services.is_private keeps it out of
     every catalogue and plan, and only a super admin can grant it. */
  occasions: 'occasions', ppsite: 'ppsite',
};

function FeatureLocked({ goServices }) {
  return (
    <div className="table-wrap fl-box">
      <div className="fl-icon" aria-hidden="true">🔒</div>
      <h2 className="fl-h">This isn't in your plan</h2>
      <p className="fl-p">Choose a plan or an add-on that includes it.</p>
      <button type="button" className="svx-change" onClick={goServices}>See your plan & add-ons</button>
    </div>
  );
}

/**
 * 💾 How much room is left, at the foot of the sidebar.
 *
 * The same meter the upload path enforces, so the bar and the eventual refusal
 * agree. A vendor who fills up mid-wedding otherwise discovers it as a failed
 * upload with no warning that it was coming.
 *
 * The upgrade button appears only when there is somewhere to go — on the
 * largest package it would be an invitation to nothing. Below 60% it stays out
 * of the way entirely; nobody needs prompting to buy space they are not using.
 */
function StorageBar({ onUpgrade }) {
  const [s, setS] = useState(null);
  useEffect(() => { api.myStorage().then(setS).catch(() => {}); }, []);
  if (!s) return null;

  const pct = Math.min(100, s.percent ?? 0);
  const near = pct >= 80;
  const tone = pct >= 95 ? 'var(--red)' : near ? 'var(--amber)' : 'var(--brand, var(--teal))';

  /* Whole gigabytes, both sides (MB only below a gigabyte). A vendor thinks in weddings, not kilobytes —
     "0 KB of 5 GB" is precise and says nothing. Used rounds to the nearest GB;
     what is LEFT rounds down, so the number never promises room that is not
     there. */
  const GB = 1073741824;
  // under a gigabyte (a small override, a test) whole gigabytes read "0 GB / 1 GB" — so MB there
  const size = (bytes) => (bytes < GB ? `${Math.round(bytes / 1048576)} MB` : `${Math.round(bytes / GB)} GB`);
  const limitBytes = (s.limit_mb || 0) * 1048576;
  const leftBytes = Math.max(0, (s.limit_bytes || 0) - (s.used_bytes || 0));
  const leftGb = Math.floor(leftBytes / GB);
  /* Under a gigabyte, whole-gigabyte rounding says "0 GB left" while there is
     still room — which reads as full when it is not. Said in words instead, so
     the scale stays gigabytes without claiming the tank is empty. */
  const leftTxt = leftBytes === 0 ? 'Full'
    : leftGb === 0 ? (limitBytes < GB ? `${size(leftBytes)} left` : 'Under 1 GB left')
    : `${leftGb} GB left`;

  return (
    <div className="vp-storage" title={`${(s.used_bytes / 1048576).toFixed(0)} MB used — photos and File Flyer together`}>
      <div className="vp-storage-top">
        <span className="vp-storage-lbl">Storage</span>
        <span className="vp-storage-num" style={near ? { color: tone } : undefined}>
          {near ? leftTxt : `${size(s.used_bytes || 0)} / ${size(limitBytes)}`}
        </span>
      </div>
      <div className="vp-storage-bar"><span style={{ width: pct + '%', background: tone }} /></div>
      {/* Always there, no condition at all.

          It used to hide when no BIGGER package existed, which was right when
          the button led nowhere useful — but it now opens Plans & Upgrades,
          which is worth seeing whatever plan you are on: it shows what you
          have, what it costs and what it includes. A vendor on the largest
          plan losing the only link to their own plan details is worse than a
          button that sometimes says "you already have the best one". */}
      <button className="vp-storage-up" onClick={onUpgrade}>
        Upgrade
      </button>
    </div>
  );
}

/* 📐 the sidebar's two choices, remembered on this device (private mode simply forgets them) */
const navPref = (k) => { try { return localStorage.getItem(`iwopo_nav_${k}`) === '1'; } catch { return false; } };
const saveNavPref = (k, on) => { try { localStorage.setItem(`iwopo_nav_${k}`, on ? '1' : '0'); } catch { /* private mode */ } };

export default function VendorPanel({ onLogout }) {
  useActivityPing();                 // 👀 TEMPORARY — records pages only for the tracked tester
  // seeded from the last session so the sidebar and tab render immediately;
  // the network copy replaces it a moment later and the server decides regardless
  const [features, setFeatures] = useState(() => {
    // 🔒 per account: one key for everyone flashed the last account's sidebar after signing in as another (Muse re-test)
    try { const c = localStorage.getItem(`vf_features:${getUser()?.id}`); return c ? JSON.parse(c) : null; }
    catch { return null; }
  });   // 🗝️ entitlements (null = loading)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { route, navigate } = useAppRoute('dashboard');
  const tab = route.tab;
  const setTab = (t) => navigate({ tab: t });
  /* 📐 the sidebar (Raj, 2026-11-12): the handle on its edge collapses it to icons or opens it; "Auto-hide menu" keeps
     it as icons that open while the pointer is over them. Both are remembered on this device. A phone always starts
     with the drawer closed. */
  const [autoHide, setAutoHide] = useState(() => navPref('auto'));
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 820 || navPref('auto') || navPref('collapsed'));
  useEffect(() => { if (window.innerWidth > 820) saveNavPref('collapsed', collapsed && !autoHide); }, [collapsed, autoHide]);
  function toggleAutoHide() { const on = !autoHide; setAutoHide(on); setCollapsed(on); saveNavPref('auto', on); }
  const swipeX = useRef(0);   // 👆 where a swipe on the phone drawer started
  const [profile, setProfile] = useState(null);
  const user = getUser();
  const dialog = useDialog();

  useEffect(() => { api.myProfile().then(d => setProfile(d.profile)).catch(() => {}); }, []);

  // 🌗 instant paint from the last-known theme (avoids a flash); load() then applies the vendor's saved choice.
  //    'system' keeps following the device when it switches between light and dark.
  useEffect(() => {
    applyTheme(localStorage.getItem('vf_theme') || 'system');
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const follow = () => { if ((localStorage.getItem('vf_theme') || 'system') === 'system') applyTheme('system'); };
    mq?.addEventListener?.('change', follow);
    return () => mq?.removeEventListener?.('change', follow);
  }, []);

  // 🗝️ single access check used everywhere
  const has = (key) => !!features && (features.includes('*') || features.includes(key));
  // 🧹 a page the plan no longer includes but that still holds the vendor's galleries or files: open for clean-up only
  const [cleanup, setCleanup] = useState([]);
  const canOpen = (key) => has(key) || cleanup.includes(key);
  // 🔴 how many leads are still status='new' — drives the sidebar badge.
  // Polled rather than derived from the leads list, because the badge has to be
  // right on every tab, not just when Leads is open.
  const [newLeadCount, setNewLeadCount] = useState(0);
  const refreshLeadCount = () =>
    api.leadsUnreadCount().then(d => setNewLeadCount(d.count || 0)).catch(() => {});

  useEffect(() => {
    if (!has('leads')) return;
    refreshLeadCount();
    const t = setInterval(refreshLeadCount, 60000);   // a minute is plenty for an inbox badge
    // catch up immediately when the vendor returns to the tab
    const onVis = () => { if (!document.hidden) refreshLeadCount(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- has() is rebuilt on every render; features is what it reads
  }, [features]);

  // 📱 nav → also close sidebar on mobile.
  // The badge is NOT cleared here: it counts leads the vendor hasn't opened, and
  // wiping it just for landing on the list made it meaningless — you'd never see
  // which lead was actually new. Opening a lead clears that lead (see LeadsView).
  /* 🔗 sidebar links: a plain click stays inside the panel; Ctrl/⌘/Shift/middle-click opens a new tab as normal */
  const inbox = useInboxCounts(has('comms'));   // 🔴 unread calls, texts and emails
  const navHref = (t) => (t === 'dashboard' ? '/panel' : `/panel/${t}`);
  const [emailFocus, setEmailFocus] = useState(null);   // ✉️ a page asked Settings to open one email template
  const navClick = (t) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); go(t);
  };
  const go = async (t) => {
    /* ⚠️ Ask the contract editor first — it may be holding unsaved work.
       Awaited: the guard asks through the in-app dialog, which is async, and
       an un-awaited Promise is truthy — Cancel would have read as Leave. */
    if (csLeaveGuard && !(await csLeaveGuard())) return;
    setTab(t);
    if (window.innerWidth <= 820) setCollapsed(true);
    if (has('leads')) refreshLeadCount();
  };

  useEffect(() => { load(); }, []);

  /* 👋 The getting-started steps, once, after the first payment (Raj, 2026-11-07). Stripe sends the vendor back here
     a moment before its webhook records the payment, so on that return the check repeats for up to ~20 seconds. */
  const [welcome, setWelcome] = useState(null);
  useEffect(() => {
    let stop = false, tries = 0;
    const justPaid = new URLSearchParams(window.location.search).get('billing') === 'done';
    if (justPaid) window.history.replaceState(null, '', window.location.pathname);
    const check = async () => {
      try {
        const b = await api.billing();
        if (stop) return;
        if (b.welcome) setWelcome(b.welcome.plan);
        else if (justPaid && !b.subscription && ++tries < 10) setTimeout(check, 2000);
      } catch { /* the steps are a courtesy — never block the panel */ }
    };
    check();
    return () => { stop = true; };
  }, []);
  const closeWelcome = () => { setWelcome(null); api.billingWelcomeSeen().catch(() => {}); };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [f, st] = await Promise.all([api.myFeatures(), api.mySettings().catch(() => ({ settings: null }))]);
      api.domainInfo().then(x => setClientBase(x.client_base_url)).catch(() => {});   // 🌐 where client links point
      const list = f.features || [];
      setFeatures(list);
      setCleanup(f.cleanup || []);
      // seed the next load, so the tab renders without waiting for the network
      try { localStorage.setItem(`vf_features:${getUser()?.id}`, JSON.stringify(list)); } catch { /* private mode */ }
      // 🌗 apply this vendor's saved theme
      const settings = await applyVendorClock(st || {});
      applyTheme(settings.theme || 'system');
      if (!localStorage.getItem('vf_currency')) localStorage.setItem('vf_currency', 'USD');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 🔔 A notification knows what it's about, so send the vendor straight there
  // rather than dropping them on a list to go and find it themselves.
  function openNotification(n) {
    if (n.link_type === 'lead' && n.link_id) navigate({ tab: 'leads', lead: String(n.link_id) });
    else if (n.link_type === 'aichat') navigate({ tab: 'aichat' });
    /* 🖼️ A selection notification opens the gallery it is about. Without this
       the row renders but does nothing when pressed, which is worse than not
       being clickable — it reads as broken rather than as plain text. */
    else if (n.link_type === 'album' && n.link_id) navigate({ tab: 'galleries', album: String(n.link_id) });
    /* 🎉 An anniversary reminder opens the page that can act on it. A reminder
       that does not take you to the thing is half a reminder. */
    else if (n.link_type === 'occasion') navigate({ tab: 'occasions' });
    /* 📞 A text or missed call opens Calls & messages ON that person. The
       event id is handed over through sessionStorage (if the page is about
       to load) and an event (if it is already open). */
    else if (n.link_type === 'comms') {
      if (n.link_id) {
        sessionStorage.setItem('cm-open', String(n.link_id));
        window.dispatchEvent(new CustomEvent('cm-open'));
      }
      navigate({ tab: 'comms' });
    }
  }

  /* 📞 From the screen pop: open Calls & messages on the caller, by number —
     a first-time caller has no stored call to point at yet. */
  function openCaller(number) {
    sessionStorage.setItem('cm-open-number', String(number || ''));
    window.dispatchEvent(new CustomEvent('cm-open'));
    navigate({ tab: 'comms' });
  }

  function handleLogout() { logout(); onLogout(); }

  // the vendor's brand hue, tinting the panel's own tokens
  const dashRef = useRef(null);
  const [brandHex, setBrandHex] = useState(null);
  const [themeMode, setThemeMode] = useState(
    () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    const vid = user?.vendor_id || user?.vendor?.id;
    if (!vid) return;
    api.myInquirySettings(vid)
      .then(d => setBrandHex(d.settings?.brand_color || d.brand_color || null))
      .catch(() => { /* no brand set, or not permitted — stock theme stands */ });
  }, [user]);

  // the light/dark switch is made by writing an attribute on <html>, so that is
  // what has to be watched; a state flag here would miss a change made anywhere
  // else in the panel
  useEffect(() => {
    const read = () => setThemeMode(
      document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => { applyBrandTone(dashRef.current, brandHex, themeMode); }, [brandHex, themeMode]);

  return (
    <div ref={dashRef} className={`dash ${collapsed ? 'sidebar-collapsed' : ''} ${autoHide ? 'sidebar-auto' : ''}`}>
      <div className={`sidebar-backdrop ${collapsed ? '' : 'is-open'}`} onClick={() => setCollapsed(true)} />
      <aside className="sidebar"
        onTouchStart={e => { swipeX.current = e.touches[0].clientX; }}
        onTouchEnd={e => { if (window.innerWidth <= 820 && swipeX.current - e.changedTouches[0].clientX > 60) setCollapsed(true); }}>
        {/* 🏠 the studio's logo + name lead home to the dashboard (Raj, 2026-10-23) */}
        <a href={navHref('dashboard')} className="brand" title="Dashboard" onClick={navClick('dashboard')}>
          {profile?.logo_path
            ? <img className="brand-logo" src={`/api/me/logo/${profile.logo_path}`} alt="logo" />
            : <span>📸</span>}
          <span className="nav-txt">{profile ? (profile.business_name || 'My Studio') : (user?.name || '')}<small>VENDOR</small></span>
        </a>
        <div className="nav-group">WORK</div>
        <a href={navHref('dashboard')} className={`nav-item ${tab==='dashboard'?'active':''}`} aria-current={tab==='dashboard' ? 'page' : undefined} onClick={navClick('dashboard')}><NavIcon name="dashboard" /><span className="nav-txt">Dashboard</span></a>
        {has('leads') && <a href={navHref('leads')} className={`nav-item ${tab==='leads'?'active':''}`} aria-current={tab==='leads' ? 'page' : undefined} onClick={navClick('leads')}><NavIcon name="leads" /><span className="nav-txt">Leads</span>{newLeadCount > 0 && <span className="nav-badge" title={`${newLeadCount} new lead${newLeadCount === 1 ? '' : 's'}`}>{newLeadCount > 99 ? '99+' : newLeadCount}</span>}</a>}
        {has('leads') && <a href={navHref('bookings')} className={`nav-item ${tab==='bookings'?'active':''}`} aria-current={tab==='bookings' ? 'page' : undefined} onClick={navClick('bookings')}><NavIcon name="bookings" /><span className="nav-txt">Bookings</span></a>}
        {has('contracts') && <a href={navHref('contracts')} className={`nav-item ${tab==='contracts'?'active':''}`} aria-current={tab==='contracts' ? 'page' : undefined} onClick={navClick('contracts')}><NavIcon name="contracts" /><span className="nav-txt">Contracts & Invoices</span></a>}
        {canOpen('galleries') && <a href={navHref('galleries')} className={`nav-item ${tab==='galleries'?'active':''}`} aria-current={tab==='galleries' ? 'page' : undefined} onClick={navClick('galleries')}><NavIcon name="galleries" /><span className="nav-txt">Galleries</span>{cleanup.includes('galleries') && <span className="nav-cleanup" title="Not in your plan — clean-up only"> 🧹</span>}</a>}
        {/* 🖨️ Sits under Galleries because that is where the requests come
            from — a client picks photographs in their gallery and sends them. */}
        {has('galleries') && <a href={navHref('requests')} className={`nav-item ${tab==='requests'?'active':''}`} aria-current={tab==='requests' ? 'page' : undefined} onClick={navClick('requests')}><NavIcon name="requests" /><span className="nav-txt">Photo Selection</span></a>}
        {has('crew') && <a href={navHref('crew')} className={`nav-item ${tab==='crew'?'active':''}`} aria-current={tab==='crew' ? 'page' : undefined} onClick={navClick('crew')}><NavIcon name="crew" /><span className="nav-txt">Crew Management</span></a>}
        {canOpen('fileflyer') && <a href={navHref('fileflyer')} className={`nav-item ${tab==='fileflyer'?'active':''}`} aria-current={tab==='fileflyer' ? 'page' : undefined} onClick={navClick('fileflyer')}><NavIcon name="fileflyer" /><span className="nav-txt">File Flyer</span>{cleanup.includes('fileflyer') && <span className="nav-cleanup" title="Not in your plan — clean-up only"> 🧹</span>}</a>}
        {/* 🔒 The four features private to the platform owner, kept
            together and in a deliberate order rather than scattered down
            the list. Each still appears only for somebody granted it. */}
        {has('comms') && <a href={navHref('comms')} className={`nav-item ${tab==='comms'?'active':''}`} aria-current={tab==='comms' ? 'page' : undefined} onClick={navClick('comms')}><NavIcon name="comms" /><span className="nav-txt">Calls & Messages</span>{inbox.total > 0 && <span className="nav-badge" title={`${inbox.total} unread`}>{inbox.total > 99 ? '99+' : inbox.total}</span>}</a>}
        {/* 📊 the owner's private PPM Board — only the AI Agent feature (Perfect Poses Media) */}
        {has('agent') && <a href={navHref('ppm')} className={`nav-item ${tab==='ppm'?'active':''}`} aria-current={tab==='ppm' ? 'page' : undefined} onClick={navClick('ppm')}><NavIcon name="ppm" /><span className="nav-txt">PPM Board</span></a>}
        {has('agent') && <a href={navHref('agent')} className={`nav-item ${tab==='agent'?'active':''}`} aria-current={tab==='agent' ? 'page' : undefined} onClick={navClick('agent')}><NavIcon name="agent" /><span className="nav-txt">AI Agent</span></a>}
        {has('rawsel') && <a href={navHref('rawsel')} className={`nav-item ${tab==='rawsel'?'active':''}`} aria-current={tab==='rawsel' ? 'page' : undefined} onClick={navClick('rawsel')}><NavIcon name="rawsel" /><span className="nav-txt">Raw Selector</span></a>}
        {has('analytics') && <a href={navHref('analytics')} className={`nav-item ${tab==='analytics'?'active':''}`} aria-current={tab==='analytics' ? 'page' : undefined} onClick={navClick('analytics')}><NavIcon name="analytics" /><span className="nav-txt">Analytics</span></a>}
        {has('occasions') && <a href={navHref('occasions')} className={`nav-item ${tab==='occasions'?'active':''}`} aria-current={tab==='occasions' ? 'page' : undefined} onClick={navClick('occasions')}><NavIcon name="occasions" /><span className="nav-txt">Occasions</span></a>}
        {has('liveshoot') && <a href={navHref('liveshoot')} className={`nav-item ${tab==='liveshoot'?'active':''}`} aria-current={tab==='liveshoot' ? 'page' : undefined} onClick={navClick('liveshoot')}><NavIcon name="liveshoot" /><span className="nav-txt">Live Shoot</span></a>}
        {/* 🚪 Raj's own website admin — a separate system on its own
            database. This asks for a one-time proof and follows it; nothing
            of that site renders inside this panel. */}
        {has('ppsite') && <div className="nav-item" onClick={async () => {
          try {
            const { url } = await api.ppsiteEnter();
            window.location.href = url;
          } catch {
            /* ⚠️ Say so rather than doing nothing — a sidebar item that
               silently fails reads as a broken panel. */
            dialog.alert('Could not open the Perfect Poses site just now.', { error: true });
          }
        }}><NavIcon name="ppsite" /><span className="nav-txt">Perfect Poses Site</span></div>}
        {/* 📊 private — only a vendor a super admin has granted it sees this at all */}
        <div className="nav-group">SETUP</div>
        {has('leads') && <a href={navHref('inqform')} className={`nav-item ${tab==='inqform'?'active':''}`} aria-current={tab==='inqform' ? 'page' : undefined} onClick={navClick('inqform')}><NavIcon name="inqform" /><span className="nav-txt">Inquiry Form</span></a>}
        {has('leads') && <a href={navHref('packages')} className={`nav-item ${tab==='packages'?'active':''}`} aria-current={tab==='packages' ? 'page' : undefined} onClick={navClick('packages')}><NavIcon name="packages" /><span className="nav-txt">My Packages</span></a>}
        <a href={navHref('aichat')} className={`nav-item ${tab==='aichat'?'active':''}`} aria-current={tab==='aichat' ? 'page' : undefined} onClick={navClick('aichat')}><NavIcon name="aichat" /><span className="nav-txt">AI Chat</span></a>
        <a href={navHref('services')} className={`nav-item ${tab==='services'?'active':''}`} aria-current={tab==='services' ? 'page' : undefined} onClick={navClick('services')}><NavIcon name="services" /><span className="nav-txt">My Services</span></a>
        {has('website') && <a href={navHref('website')} className={`nav-item ${tab==='website'?'active':''}`} aria-current={tab==='website' ? 'page' : undefined} onClick={navClick('website')}><NavIcon name="website" /><span className="nav-txt">My Website</span></a>}
        <div className="nav-group">ACCOUNT</div>
        <a href={navHref('refer')} className={`nav-item ${tab==='refer'?'active':''}`} aria-current={tab==='refer' ? 'page' : undefined} onClick={navClick('refer')}><NavIcon name="refer" /><span className="nav-txt">Refer a Friend</span></a>
        <a href={navHref('settings')} className={`nav-item ${tab==='settings'?'active':''}`} aria-current={tab==='settings' ? 'page' : undefined} onClick={navClick('settings')}><NavIcon name="settings" /><span className="nav-txt">Settings</span></a>
        <a href={navHref('help')} className={`nav-item ${tab==='help'?'active':''}`} aria-current={tab==='help' ? 'page' : undefined} onClick={navClick('help')}><NavIcon name="help" /><span className="nav-txt">Help &amp; Support</span></a>
        {/* ⚠️ This went to 'packages', which is the vendor's own client-facing
            price list — nothing to do with their subscription. */}
        <div className="nav-auto" role="switch" aria-checked={autoHide} tabIndex={0} title="Keep the menu as icons; it opens when you point at it"
          onClick={toggleAutoHide} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleAutoHide()}>
          <span className="nav-txt">Auto-hide menu</span><span className={`nav-switch ${autoHide ? 'on' : ''}`} />
        </div>
        <StorageBar onUpgrade={() => go('plans')} />
        <div className="logout" onClick={handleLogout}><NavIcon name="logout" /><span className="nav-txt">Log out</span></div>
      </aside>
      {/* ◀ on the sidebar's edge: collapse to icons / open again (not shown on a phone, or while Auto-hide is on) */}
      <button type="button" className="side-handle" onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Open the menu' : 'Collapse the menu'} aria-label={collapsed ? 'Open the menu' : 'Collapse the menu'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} /></svg>
      </button>

      <main className="main">
        <BillingBanner onPlans={() => go('plans')} />
        {welcome && <WelcomeSteps plan={welcome} onGo={(t) => { closeWelcome(); go(t); }} onClose={closeWelcome} />}
        {/* 📐 no top strip (Raj, 2026-11-12): calendar and bell in the top-right corner; the page's name is kept for
            screen readers; the menu button shows on a phone only, where it opens the drawer */}
        <div className="top-actions">
          <button className="menu-btn" onClick={() => setCollapsed(c => !c)} title="Menu">☰</button>
          <h1 className="top-title">{tab === 'dashboard' ? 'Dashboard' : tab === 'ppm' ? 'PPM Board' : tab === 'refer' ? 'Refer a Friend' : tab === 'help' ? 'Help & Support' : tab === 'leads' ? 'Leads' : tab === 'settings' ? 'Settings' : tab === 'packages' ? 'My Packages' : tab === 'bookings' ? 'Bookings' : tab === 'inqform' ? 'Inquiry Form' : tab === 'contracts' ? 'Contracts & Invoices' : tab === 'crew' ? 'Crew Management' : tab === 'galleries' ? 'Galleries' : tab === 'fileflyer' ? 'File Flyer' : tab === 'analytics' ? 'Analytics' : tab === 'comms' ? 'Calls & Messages' : tab === 'rawsel' ? 'Raw Selector' : tab === 'agent' ? 'AI Agent' : tab === 'liveshoot' ? 'Live Shoot' : tab === 'requests' ? 'Photo Selection' : tab === 'occasions' ? 'Occasions' : tab === 'plans' ? 'Plans & Upgrades' : tab === 'website' ? 'My Website' : tab === 'aichat' ? 'AI Chat' : tab === 'calendar' ? 'Calendar' : 'My Services'}</h1>
          <div className="top-icons">
            {has('calendar') && <button className={`hdr-icon ${tab==='calendar'?'active':''}`} onClick={() => setTab(tab === 'calendar' ? 'dashboard' : 'calendar')} title="Quick Calendar">🗓️</button>}
            <NotifBell onOpen={openNotification} />
            {/* 📞 who is calling, while it rings — only an account holding Calls & messages ever loads this */}
            {has('comms') && <Suspense fallback={null}><ScreenPop onOpen={openCaller} /></Suspense>}
          </div>
        </div>

        {error && <div className="err-banner">⚠️ {error}</div>}
        {TAB_FEATURE[tab] && !has(TAB_FEATURE[tab]) && cleanup.includes(TAB_FEATURE[tab]) && (
          <div className="cleanup-note" role="status">
            <span>🧹 <b>This isn't in your plan any more.</b> You can still view, download and delete what's here — choose a plan that includes it to keep using it.</span>
            <button type="button" className="svx-change" onClick={() => go('plans')}>See plans</button>
          </div>
        )}
        {TAB_FEATURE[tab] && !has(TAB_FEATURE[tab]) && !cleanup.includes(TAB_FEATURE[tab]) ? (
          <FeatureLocked goServices={() => setTab('services')} />
        ) : (loading && !features) ? <div className="loading">Loading…</div> : tab === 'help' ? (
          <HelpView user={user} onGo={(t) => go(t)} />
        ) : tab === 'refer' ? (
          <ReferForm />
        ) : tab === 'leads' ? (
          <LeadsView routeLead={route.lead} onOpenLead={(id) => navigate({ tab: 'leads', lead: id ? String(id) : null })} />
        ) : tab === 'bookings' ? (
          <BookingsView routeBooking={route.booking} onOpenBooking={(id) => navigate({ tab: 'bookings', booking: id ? String(id) : null })} rawsel={has('rawsel')} />
        ) : tab === 'contracts' ? (
          <ContractsTab />
        ) : tab === 'crew' ? (
          <CrewView rawsel={has('rawsel')} />
        ) : tab === 'plans' ? (
          <PlansView />
        ) : tab === 'occasions' ? (
          <Suspense fallback={<div className="tab-loading">Loading…</div>}><OccasionsView /></Suspense>
        ) : tab === 'requests' ? (
          <RequestsView />
        ) : tab === 'liveshoot' ? (
          <GalleriesView key="liveshoot" kind="liveshoot" routeAlbum={route.album} onOpenAlbum={(id) => navigate({ tab: 'liveshoot', album: id ? String(id) : null })} />
        ) : tab === 'ppm' ? (
          has('agent') ? <PpmBoard /> : null   /* 📊 the owner's private board — nothing for anyone else */
        ) : tab === 'comms' ? (
          <Suspense fallback={<div className="tab-loading">Loading…</div>}><Inbox /></Suspense>
        ) : tab === 'agent' ? (
          <Suspense fallback={<div className="tab-loading">Loading…</div>}><AgentView /></Suspense>
        ) : tab === 'rawsel' ? (
          <Suspense fallback={<div className="tab-loading">Loading…</div>}><RawSelectorView /></Suspense>
        ) : tab === 'analytics' ? (
          <Suspense fallback={<div className="tab-loading">Loading…</div>}><AnalyticsView /></Suspense>
        ) : tab === 'fileflyer' ? (
          <FileFlyerView />
        ) : tab === 'galleries' ? (
          <GalleriesView key="galleries" routeAlbum={route.album} onOpenAlbum={(id) => navigate({ tab: 'galleries', album: id ? String(id) : null })}
            onEditEmail={() => { setEmailFocus('gallery_shared'); setTab('settings'); }}
            shortcuts={has('galleries')} insights={has('gallery_insights')} />
        ) : tab === 'website' ? (
          <WebsiteView />
        ) : tab === 'aichat' ? (
          <AiChatVendorView goServices={() => setTab('services')} />
        ) : tab === 'calendar' ? (
          // this calendar had no way out of it: its cards were built to open a
          // booking but were rendered without a handler, so clicking did nothing
          <CalendarView onOpen={(l) => navigate({ tab: 'bookings', booking: String(l.id) })} />
        ) : tab === 'inqform' ? (
          <InqFormSettings />
        ) : tab === 'packages' ? (
          <PackagesView />
        ) : tab === 'settings' ? (
          <SettingsView user={user} onProfileChange={setProfile} emailFocus={emailFocus} onFocusUsed={() => setEmailFocus(null)} />
        ) : tab === 'dashboard' ? (
          <DashHome goTab={setTab} openBooking={(id) => navigate({ tab: 'bookings', booking: String(id) })} />
        ) : (
          <MyServicesView onPlans={() => go('plans')} />
        )}
      </main>
    </div>
  );
}
