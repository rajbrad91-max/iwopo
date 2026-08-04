// 🔌 API helper — talks to the backend
const BASE = '/api';

// 🕐 format a "HH:MM" (24h) string per the vendor's saved preference.
// These are wall-clock answers off the inquiry form — an event starting at
// 11:58 starts at 11:58 wherever you read it — so the timezone deliberately
// isn't applied here. That's only for real instants, see fmtDateTime.
export function fmtTime(t) {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = Number(m[1]); const min = m[2];
  const pref = localStorage.getItem('vf_time_format') || '12h';
  if (pref === '24h') return `${String(h).padStart(2, '0')}:${min}`;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

// 🌍 A stored timestamp is a real moment in time, so it's shown in the vendor's
// own timezone and clock format rather than the browser's. A vendor in Vancouver
// checking their panel while travelling should still read times the way their
// business runs, not the way the airport does.
export function fmtDateTime(ts, { dateOnly = false } = {}) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const tz = localStorage.getItem('vf_timezone') || undefined;
  const opts = { year: 'numeric', month: 'short', day: 'numeric', timeZone: tz };
  if (!dateOnly) {
    opts.hour = 'numeric';
    opts.minute = '2-digit';
    opts.hour12 = (localStorage.getItem('vf_time_format') || '12h') !== '24h';
  }
  try { return d.toLocaleString(undefined, opts); }
  catch { return d.toLocaleString(); }   // a bad saved timezone shouldn't blank the row
}

// 📅 An event date is a CALENDAR DAY, not a moment. Postgres stores it as a
// `date`, but it arrives here as "2028-10-29T00:00:00.000Z" — UTC midnight —
// so `new Date(v)` then reads back as the 28th for anyone west of UTC. A
// Vancouver photographer was being shown the day before every wedding.
// Reading the Y-M-D straight off the string keeps the day the vendor typed.
function ymd(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function fmtEventDate(v, { long = false } = {}) {
  const d = ymd(v);
  if (!d) return v ? String(v) : '';
  return d.toLocaleDateString(undefined, long
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Day number, short month and weekday for an event date — no timezone shift. */
export function eventDateParts(v) {
  const d = ymd(v);
  if (!d) return { day: '—', mon: '', dow: '' };
  return {
    day: d.getDate(),
    mon: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    dow: d.toLocaleDateString(undefined, { weekday: 'long' }),
  };
}

/** The same calendar day as a sortable/comparable local Date, or null. */
export function eventDateValue(v) { return ymd(v); }

/**
 * 💱 A sum of the VENDOR's money, in the vendor's own currency.
 *
 * A figure with no currency is worthless once the same software is used in
 * Vancouver and Karachi, and a hard-coded dollar sign quietly tells a client in
 * London the wrong thing. The currency is resolved once when the panel loads —
 * their choice, or their country's — and cached with the other preferences.
 *
 * This is for money a vendor charges their clients. iwopo's own pricing to the
 * vendor is a different thing and is not formatted with this.
 */
export function fmtMoney(n, { decimals = 0, currency } = {}) {
  const code = currency || localStorage.getItem('vf_currency') || 'USD';
  const value = Number(n || 0);
  try {
    return value.toLocaleString(undefined, {
      style: 'currency', currency: code,
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });
  } catch {
    // an unknown code shouldn't blank a total — show the number and say the code
    return `${value.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${code}`;
  }
}

/**
 * 💱 Split a price into its parts so each can be styled separately.
 *
 * The reference renders a price as three things on one baseline: the symbol in
 * the brand colour, the number large and dark, and the currency code small and
 * grey. That needs the pieces apart, and slicing the formatted string would
 * break the moment a currency puts its symbol after the number or uses a
 * different group separator.
 *
 * formatToParts is the supported way to ask Intl what each piece actually is,
 * so this stays right for a vendor billing in kr, ₹ or €, not only in dollars.
 */
export function moneyParts(n, { decimals = 0, currency } = {}) {
  const code = currency || localStorage.getItem('vf_currency') || 'USD';
  const value = Number(n || 0);
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency', currency: code,
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).formatToParts(value);
    // 'currency' is the symbol Intl chose — CA$, £, ₹ — whatever is right here
    const symbol = parts.filter(x => x.type === 'currency').map(x => x.value).join('');
    const amount = parts.filter(x => x.type !== 'currency' && x.type !== 'literal')
      .map(x => x.value).join('');
    // whether the symbol leads tells the caller which order to render in
    const symbolFirst = parts.findIndex(x => x.type === 'currency')
      < parts.findIndex(x => x.type === 'integer');
    return { symbol, amount, code, symbolFirst };
  } catch {
    // an unknown code should still show a number rather than nothing
    return {
      symbol: '', amount: value.toLocaleString(undefined, { maximumFractionDigits: decimals }),
      code, symbolFirst: true,
    };
  }
}

// 🗂️ Session storage is PER TAB, so a super-admin tab and a vendor tab can be
// open side by side without overwriting each other. localStorage is shared
// across every tab of the site, which meant logging into one panel silently
// replaced the other's session — refreshing then dropped you into the wrong
// panel, or produced "Super admin only" errors on admin screens.
//
// localStorage is still read as a fallback (so an existing login isn't lost the
// first time this ships) and still written, so opening a NEW tab keeps you
// signed in rather than forcing a fresh login every time.
/**
 * 📥 Fetch binary from an authenticated route.
 *
 * The request() helper parses JSON, which is wrong for an image or a zip.
 * This returns the raw Response so the caller can take a blob — needed
 * because an <img src> and an <a download> cannot carry an Authorization
 * header, so those have to fetch the bytes themselves and hand over an
 * object URL.
 *
 * Deliberately not solved with a token in the query string: that writes the
 * JWT into server logs and referrer headers on every thumbnail request.
 */
export function authFetch(pathname, opts = {}) {
  const t = getToken();
  return fetch(BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  });
}

function getToken() {
  return sessionStorage.getItem('iwopo_token') || localStorage.getItem('iwopo_token');
}

/** This tab's token — for building authed <img src> / download URLs.
 *  Always use this instead of reading localStorage directly, or the URL will
 *  carry another tab's identity. */
export function getAuthToken() {
  return getToken();
}

export function setSession(token, user) {
  sessionStorage.setItem('iwopo_token', token);          // this tab's identity
  sessionStorage.setItem('iwopo_user', JSON.stringify(user));
  localStorage.setItem('iwopo_token', token);            // seed for new tabs
  localStorage.setItem('iwopo_user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('iwopo_token');
  sessionStorage.removeItem('iwopo_user');
  localStorage.removeItem('iwopo_token');
  localStorage.removeItem('iwopo_user');
}

export function getUser() {
  const raw = sessionStorage.getItem('iwopo_user') || localStorage.getItem('iwopo_user');
  return raw ? JSON.parse(raw) : null;
}

// 🔗 On first load in a tab, copy whatever localStorage has into this tab's own
// session. From then on the tab is pinned to that identity: another tab logging
// in as someone else changes localStorage but NOT this tab's sessionStorage.
(function pinSessionToTab() {
  if (sessionStorage.getItem('iwopo_token')) return;     // tab already pinned
  const t = localStorage.getItem('iwopo_token');
  const u = localStorage.getItem('iwopo_user');
  if (t && u) {
    sessionStorage.setItem('iwopo_token', t);
    sessionStorage.setItem('iwopo_user', u);
  }
})();

// 🔎 Read the role baked into the JWT itself rather than trusting the stored
// user object. With per-tab sessions the two should always agree, but this
// still catches an expired token or a session left over from an older build.
function roleFromToken() {
  const t = getToken();
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role || null;
  } catch { return null; }
}

/** True when the stored user and the actual token disagree about who you are. */
export function sessionMismatch() {
  const stored = getUser()?.role;
  const actual = roleFromToken();
  return !!(stored && actual && stored !== actual);
}

/**
 * A GET with a very short memory, for endpoints several components read at once.
 *
 * Two problems, one answer. Identical requests already in flight share a single
 * promise rather than racing each other, and a result stays usable for a few
 * seconds so components mounting in sequence do not each pay a round trip. On a
 * distant connection that is the difference between one 500ms wait and four.
 *
 * Kept to a few seconds on purpose: long enough to cover a page load, short
 * enough that nothing anyone would notice goes stale. Writes clear it.
 */
const _getCache = new Map();     // path -> { at, data }
const _inFlight = new Map();     // path -> promise
const GET_TTL_MS = 6000;

function cachedGet(path) {
  const hit = _getCache.get(path);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return Promise.resolve(hit.data);
  if (_inFlight.has(path)) return _inFlight.get(path);

  const promise = request(path)
    .then(data => { _getCache.set(path, { at: Date.now(), data }); return data; })
    .finally(() => _inFlight.delete(path));
  _inFlight.set(path, promise);
  return promise;
}

/** Drop cached entries whose path starts with the prefix. */
export function clearGetCache(prefix = '') {
  for (const k of [..._getCache.keys()]) if (k.startsWith(prefix)) _getCache.delete(k);
}

async function request(path, options = {}) {
  // A file upload must NOT carry a JSON content-type — the browser has to set
  // multipart/form-data itself, boundary and all. Without this every upload had
  // to bypass this function and re-implement auth and error handling by hand.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  // 🔑 an expired/invalid token, or a role mismatch on an admin-only route,
  // means this session can't do what the UI is showing. Clear it and send the
  // person back to login instead of leaving them stuck on a dead screen.
  if (res.status === 401 || (res.status === 403 && sessionMismatch())) {
    clearSession();
    window.location.reload();
    throw new Error('Your session expired — please log in again.');
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (businessName, email, password) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ businessName, email, password }) }),
  forgotPassword: (email) =>
    request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    request('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  vendors: () => request('/vendors'),
  adminCounts: () => request('/admin/counts'),
  adminVendorStats: () => request('/admin/vendor-stats'),
  markCountSeen: (group) => request(`/admin/counts/${group}/seen`, { method: 'PUT' }),
  adminMessages: () => request('/admin/messages'),
  platformSettings: () => request('/settings/platform'),
  savePlatformSettings: (data) => request('/settings/platform', { method: 'PUT', body: JSON.stringify(data) }),
  revealAwsCreds: () => request('/settings/platform/reveal'),
  reindexAll: () => request('/settings/reindex-all', { method: 'POST' }),
  faceQueueStatus: () => request('/face-queue/status'),

  // 🤖 Chatbot (Wopo Assistant)
  chatbotSubscribers: () => request('/chatbot/subscribers'),
  chatbotAddSubscriber: (vendor_id) => request('/chatbot/subscribers', { method: 'POST', body: JSON.stringify({ vendor_id }) }),
  chatbotSetActive: (vendorId, active) => request(`/chatbot/subscribers/${vendorId}/active`, { method: 'PUT', body: JSON.stringify({ active }) }),
  chatbotRemoveSubscriber: (vendorId) => request(`/chatbot/subscribers/${vendorId}`, { method: 'DELETE' }),
  chatbotSetCode: (vendorId, access_code) => request(`/chatbot/subscribers/${vendorId}/code`, { method: 'PUT', body: JSON.stringify({ access_code }) }),
  chatbotKnowledge: (vendorId) => request(`/chatbot/knowledge/${vendorId}`),
  chatbotSaveKnowledge: (vendorId, data) => request(`/chatbot/knowledge/${vendorId}`, { method: 'PUT', body: JSON.stringify(data) }),
  chatbotCosts: () => request('/chatbot/costs'),
  chatbotPending: (vendorId) => request(`/chatbot/pending/${vendorId}`),
  chatbotResolvePending: (id, answer, dismiss) => request(`/chatbot/pending/${id}`, { method: 'PUT', body: JSON.stringify({ answer, dismiss }) }),
  chatbotMessages: (vendorId) => request(`/chatbot/messages/${vendorId}`),
  chatbotMarkRead: (id) => request(`/chatbot/messages/${id}/read`, { method: 'PUT' }),
  // vendor-side
  myChatbotStatus: () => request('/chatbot/my/status'),

  // 💾 super admin: set one vendor's File Flyer storage allowance
  setVendorStorage: (vendorId, storage_limit_mb) =>
    request(`/vendors/${vendorId}/storage`, { method: 'PUT', body: JSON.stringify({ storage_limit_mb }) }),

  // 📤 File Flyer — shares a vendor hands to a client, either direction
  fileShares: () => request('/files'),

  // 📁 one level of the vendor's own drive — no share involved
  drive: (folderId) =>
    request(`/files/drive${folderId ? '?folder=' + folderId : ''}`),
  createFolder: (body) =>
    request('/files/folders', { method: 'POST', body: JSON.stringify(body) }),
  // 🔗 sharing is something you do TO a folder; pressing it twice returns the
  // same link rather than minting a second one
  shareFolder: (folderId, body = {}) =>
    request(`/files/folder/${folderId}/share`, { method: 'POST', body: JSON.stringify(body) }),
  unshareFolder: (folderId) =>
    request(`/files/folder/${folderId}/share`, { method: 'DELETE' }),
  renameFolder: (folderId, name) =>
    request(`/files/folder/${folderId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteFolder: (folderId) =>
    request(`/files/folder/${folderId}`, { method: 'DELETE' }),
  emailShare: (id, body) =>
    request(`/files/${id}/email`, { method: 'POST', body: JSON.stringify(body) }),
  updateFileShare: (id, body) => request(`/files/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteFileShare: (id) => request(`/files/${id}`, { method: 'DELETE' }),
  fileShareItems: (id) => request(`/files/${id}/items`),
  uploadShareFiles: (files, folderId) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    // the folder currently open, so a drop lands where the vendor is looking
    if (folderId) fd.append('folder_id', String(folderId));
    return request('/files/upload', { method: 'POST', body: fd });
  },
  deleteShareItem: (itemId) => request(`/files/item/${itemId}`, { method: 'DELETE' }),

  // 📤 File Flyer — the client's side, token only, no auth
  publicShare: (token) => request(`/f/${token}`),
  unlockShare: (token, password) => request(`/f/${token}/unlock`, { method: 'POST', body: JSON.stringify({ password }) }),
  clientUploadFiles: (token, files, uploaderName) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (uploaderName) fd.append('uploader_name', uploaderName);
    return request(`/f/${token}/upload`, { method: 'POST', body: fd });
  },

  // 🌐 Website Builder
  mySite: () => request('/sites/my'),
  saveMySite: (body) => request('/sites/my', { method: 'PUT', body: JSON.stringify(body) }),
  // 🧱 an image for one page block; returns the filename to store on it
  uploadSitePhoto: (file) => { const fd = new FormData(); fd.append('photo', file); return request('/sites/my/photo', { method: 'POST', body: fd }); },
  saveMySiteSlug: (slug) => request('/sites/my/slug', { method: 'PUT', body: JSON.stringify({ slug }) }),
  publishMySite: (published) => request('/sites/my/publish', { method: 'PUT', body: JSON.stringify({ published }) }),
  publicSite: (slug) => request(`/sites/${slug}`),
  siteByHost: () => request('/sites/by-host'),
  inquirySettingsByHost: () => request('/inquiry-settings/by-host'),
  myDomain: () => request('/sites/domain'),
  saveMyDomain: (domain) => request('/sites/domain', { method: 'PUT', body: JSON.stringify({ domain }) }),
  checkMyDomain: () => request('/sites/domain/check', { method: 'POST' }),
  uploadSiteCover: (file) => { const fd = new FormData(); fd.append('photo', file); return request('/sites/my/cover', { method: 'POST', body: fd }); },
  removeSiteCover: () => request('/sites/my/cover', { method: 'DELETE' }),
  setSiteCoverFocus: (cover_focus) => request('/sites/my/cover-focus', { method: 'PUT', body: JSON.stringify({ cover_focus }) }),
  addPortfolioPhoto: (file) => { const fd = new FormData(); fd.append('photo', file); return request('/sites/my/portfolio', { method: 'POST', body: fd }); },
  removePortfolioPhoto: (id) => request(`/sites/my/portfolio/${id}`, { method: 'DELETE' }),
  replacePortfolioPhoto: (id, file) => { const fd = new FormData(); fd.append('photo', file); return request(`/sites/my/portfolio/${id}/replace`, { method: 'POST', body: fd }); },
  savePortfolio: (portfolio) => request('/sites/my/portfolio', { method: 'PUT', body: JSON.stringify({ portfolio }) }),
  myChatbotHistory: () => request('/chatbot/my/history'),
  myChatbotKnowledge: () => request('/chatbot/my/knowledge'),
  saveMyChatbotKnowledge: (body) => request('/chatbot/my/knowledge', { method: 'PUT', body: JSON.stringify(body) }),
  vendorDetail: (id) => request(`/vendors/${id}/detail`),
  vendorFeatures: (id) => request(`/vendors/${id}/features`),
  setVendorFeature: (id, key, body) => request(`/vendors/${id}/features/${key}`, { method: 'PUT', body: JSON.stringify(body) }),
  services: () => request('/services'),
  packages: () => request('/packages'),
  adminServices: () => request('/admin/services'),
  adminPackages: () => request('/admin/packages'),
  trialEligible: () => request('/auth/trial-eligible'),
  updatePackagePrice: (id, prices) =>
    request(`/packages/${id}/price`, { method: 'PUT', body: JSON.stringify(prices) }),
  updateItemPrice: (id, prices) =>
    request(`/package-items/${id}/price`, { method: 'PUT', body: JSON.stringify(prices) }),
  updateServicePrice: (id, prices) =>
    request(`/services/${id}/price`, { method: 'PUT', body: JSON.stringify(prices) }),
  updateCountryPrices: (type, id, country_prices) =>
    request(`/country-prices/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ country_prices }) }),
  updateServiceTiers: (id, tiers) =>
    request(`/services/${id}/tiers`, { method: 'PUT', body: JSON.stringify({ tiers }) }),
  offers: () => request('/offers'),
  createOffer: (data) => request('/offers', { method: 'POST', body: JSON.stringify(data) }),
  toggleOffer: (id) => request(`/offers/${id}/toggle`, { method: 'PUT' }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),
  referrals: () => request('/referrals'),
  createReferral: (referrer_email, friend_email) =>
    request('/referrals', { method: 'POST', body: JSON.stringify({ referrer_email, friend_email }) }),
  createLead: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  leads: (vendorId) => request(`/leads${vendorId ? `?vendor_id=${vendorId}` : ''}`),
  leadsUnreadCount: () => request('/leads/unread-count'),
  // pass a lead id to mark just that one read; omit it to clear them all
  markLeadsSeen: (id) => request('/leads/mark-seen', { method: 'PUT', body: JSON.stringify(id ? { id } : {}) }),
  mappableColumns: () => request('/leads/mappable-columns'),
  lead: (id) => request(`/leads/${id}`),
  updateLead: (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  myCurrencies: () => request('/me/currencies'),
  mySettings: () => request('/me/settings'),
  saveSettings: (data) => request('/me/settings', { method: 'PUT', body: JSON.stringify(data) }),
  changeEmail: (email, password) => request('/me/email', { method: 'PUT', body: JSON.stringify({ email, password }) }),
  changePassword: (current, next) => request('/me/password', { method: 'PUT', body: JSON.stringify({ current, next }) }),
  vendorPackages: () => request('/vendor-packages'),
  pkgTemplates: () => request('/vendor-packages/templates'),
  addTemplate: (name) => request('/vendor-packages/templates', { method: 'POST', body: JSON.stringify({ name }) }),
  renameTemplate: (id, name) => request(`/vendor-packages/templates/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteTemplate: (id) => request(`/vendor-packages/templates/${id}`, { method: 'DELETE' }),
  addVendorPackage: (name, template_id) => request('/vendor-packages', { method: 'POST', body: JSON.stringify({ name, template_id }) }),
  updateVendorPackage: (id, data) => request(`/vendor-packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVendorPackage: (id) => request(`/vendor-packages/${id}`, { method: 'DELETE' }),
  // 📦 a lead's own copy of the packages it was offered
  leadPackages: (leadId) => request(`/lead-packages/${leadId}`),
  loadLeadPackages: (leadId, template_id) => request(`/lead-packages/${leadId}/load`,
    { method: 'POST', body: JSON.stringify({ template_id }) }),
  updateLeadPackage: (leadId, id, data) => request(`/lead-packages/${leadId}/${id}`,
    { method: 'PUT', body: JSON.stringify(data) }),
  deleteLeadPackage: (leadId, id) => request(`/lead-packages/${leadId}/${id}`, { method: 'DELETE' }),
  setPackagesLock: (leadId, locked) => request(`/lead-packages/${leadId}/lock/set`,
    { method: 'PUT', body: JSON.stringify({ locked }) }),
  leadPayments: (leadId) => request(`/payments/lead/${leadId}`),
  addPayment: (leadId, amount, method, note) => request(`/payments/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ amount, method, note }) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: 'DELETE' }),
  saveMoney: (leadId, data) => request(`/payments/lead/${leadId}/money`, { method: 'PUT', body: JSON.stringify(data) }),
  setWebPayment: (leadId, enabled) => request(`/payments/lead/${leadId}/web-payment`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  bookings: () => request('/bookings'),
  booking: (leadId) => request(`/bookings/${leadId}`),
  setLeadStatus: (leadId, status) => request(`/bookings/${leadId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  inquirySettings: (handle) => cachedGet(`/inquiry-settings/${handle}`),
  myInquirySettings: (vendorId) => request('/inquiry-settings/my' + (vendorId ? `?vendor_id=${vendorId}` : '')),
  saveInquirySettings: (data) => {
    clearGetCache('/inquiry-settings');
    return request('/inquiry-settings', { method: 'PUT', body: JSON.stringify(data) });
  },
  myProfile: () => request('/me/profile'),
  saveProfile: (data) => request('/me/profile', { method: 'PUT', body: JSON.stringify(data) }),
  // now that request() handles FormData, this needs no hand-rolled fetch,
  // no second copy of the auth header and no second error path
  uploadLogo: (file) => { const fd = new FormData(); fd.append('logo', file); return request('/me/logo', { method: 'POST', body: fd }); },
  emailSettings: () => request('/email/settings'),
  saveEmailSettings: (data) => request('/email/settings', { method: 'PUT', body: JSON.stringify(data) }),
  emailLead: (leadId, subject, body, cc, kind) => request(`/email/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ subject, body, cc, kind }) }),
  leadContracts: (leadId) => request(`/contracts/lead/${leadId}`),
  releaseContract: (id) => request(`/contracts/${id}/release`, { method: 'PUT' }),
  previewContract: (leadId) => request(`/contracts/preview/${leadId}`),
  createContract: (leadId, title, body) => request(`/contracts/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ title, body }) }),
  voidContract: (id) => request(`/contracts/${id}`, { method: 'DELETE' }),
  viewContract: (token) => request(`/contracts/sign/${token}`),
  signContract: (token, signed_name, signature_data, initials) => request(`/contracts/sign/${token}`, { method: 'POST', body: JSON.stringify({ signed_name, signature_data, initials }) }),
  allContracts: () => request('/contracts'),
  ctTemplates: () => request('/contracts/templates'),
  addCtTemplate: (data) => request('/contracts/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateCtTemplate: (id, data) => request(`/contracts/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCtTemplate: (id) => request(`/contracts/templates/${id}`, { method: 'DELETE' }),
  createContractFromTemplate: (leadId, template_id) => request(`/contracts/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ template_id }) }),
  allInvoices: () => request('/invoices'),
  leadInvoices: (leadId) => request(`/invoices/lead/${leadId}`),
  createInvoice: (leadId, data) => request(`/invoices/lead/${leadId}`, { method: 'POST', body: JSON.stringify(data || {}) }),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
  viewInvoice: (token) => request(`/invoices/view/${token}`),
  leadsHistory: () => request('/leads/history'),
  bulkArchive: (ids) => request('/leads/bulk-archive', { method: 'POST', body: JSON.stringify({ ids }) }),
  bulkDeleteLeads: (ids) => request('/leads/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  restoreLead: (id) => request(`/leads/${id}/restore`, { method: 'POST' }),
  setGateway: (id, enabled) => request(`/leads/${id}/gateway`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  sendPackages: (id) => request(`/leads/${id}/send-packages`, { method: 'POST' }),
  saveTimer: (id, data) => request(`/leads/${id}/timer`, { method: 'PUT', body: JSON.stringify(data) }),
  leadFlags: (id, data) => request(`/leads/${id}/flags`, { method: 'PUT', body: JSON.stringify(data) }),
  crew: () => request('/crew'),
  addCrew: (data) => request('/crew', { method: 'POST', body: JSON.stringify(data) }),
  // 📸 galleries
  albums: () => request('/albums'),
  createAlbum: (data) => request('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateAlbum: (id, data) => request(`/albums/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  albumBookingOptions: () => request('/albums/booking-options'),
  albumSettings: () => request('/albums/settings'),
  saveAlbumSettings: (data) => request('/albums/settings', { method: 'PUT', body: JSON.stringify(data) }),
  galleryTheme: () => request('/albums/theme'),
  saveGalleryTheme: (data) => request('/albums/theme', { method: 'PUT', body: JSON.stringify(data) }),
  emailAlbumInstructions: (id, payload) => request(`/albums/${id}/email-instructions`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  uploadAlbumCover: async (albumId, file) => {
    const fd = new FormData();
    fd.append('cover', file);
    const token = localStorage.getItem('iwopo_token');
    const res = await fetch(`/api/albums/${albumId}/cover`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Cover upload failed');
    return data;
  },
  albumCoverUrl: (id) => `/api/albums/cover/${id}`,
  saveCoverFocus: (albumId, focus) =>
    request(`/albums/${albumId}/cover-focus`, { method: 'PUT', body: JSON.stringify({ focus }) }),
  album: (id) => request(`/albums/${id}`),
  albumFavorites: (id) => request(`/albums/${id}/favorites`),
  albumSelection: (id) => request(`/albums/${id}/selection`),
  completeSelection: (id, completed = true) =>
    request(`/albums/${id}/selection/complete`, { method: 'PUT', body: JSON.stringify({ completed }) }),
  clearSelection: (id) => request(`/albums/${id}/selection`, { method: 'DELETE' }),
  deleteAlbum: (id) => request(`/albums/${id}`, { method: 'DELETE' }),
  deletePhoto: (albumId, photoId) => request(`/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' }),
  uploadPhotos: async (albumId, files, eventId) => {
    const fd = new FormData();
    [...files].forEach(f => fd.append('photos', f));
    if (eventId) fd.append('event_id', eventId);
    const token = localStorage.getItem('iwopo_token');
    const res = await fetch(`/api/albums/${albumId}/photos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  addAlbumEvent: (albumId, name) => request(`/albums/${albumId}/events`, { method: 'POST', body: JSON.stringify({ name }) }),
  renameAlbumEvent: (albumId, eventId, name) => request(`/albums/${albumId}/events/${eventId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteAlbumEvent: (albumId, eventId) => request(`/albums/${albumId}/events/${eventId}`, { method: 'DELETE' }),
  fileUrl: (photoId, type) => `/api/albums/file/${photoId}/${type}`,
  indexFaces: (albumId) => request(`/albums/${albumId}/index-faces`, { method: 'POST' }),
  faceSearch: async (albumId, selfieFile) => {
    const fd = new FormData();
    fd.append('selfie', selfieFile);
    const token = localStorage.getItem('iwopo_token');
    const res = await fetch(`/api/albums/${albumId}/face-search`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Search failed');
    return data;
  },
  updateCrew: (id, data) => request(`/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCrew: (id) => request(`/crew/${id}`, { method: 'DELETE' }),
  leadCrew: (leadId) => request(`/crew/lead/${leadId}`),
  assignCrew: (leadId, data) => request(`/crew/lead/${leadId}`, { method: 'POST', body: JSON.stringify(data) }),
  unassignCrew: (id) => request(`/crew/assignment/${id}`, { method: 'DELETE' }),
  checkinInfo: (token) => request(`/crew/checkin/${token}`),
  checkinAction: (token, action) => request(`/crew/checkin/${token}`, { method: 'POST', body: JSON.stringify({ action }) }),
  notifications: () => request('/notifications'),
  notificationsSeen: () => request('/notifications/seen', { method: 'POST' }),
  emailTemplates: () => request('/email/templates'),
  addEmailTemplate: (data) => request('/email/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateEmailTemplate: (id, data) => request(`/email/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmailTemplate: (id) => request(`/email/templates/${id}`, { method: 'DELETE' }),
  portal: (token, fresh) => request(`/portal/${token}${fresh ? '?fresh=1' : ''}`),
  portalVerify: (token, email) => request(`/portal/${token}/verify`, { method: 'POST', body: JSON.stringify({ email }) }),
  portalPick: (token, package_id) => request(`/portal/${token}/pick`, { method: 'POST', body: JSON.stringify({ package_id }) }),
  // client says they've paid directly — a claim the vendor confirms separately
  portalPayDirect: (token) => request(`/portal/${token}/pay-direct`, { method: 'POST' }),
  confirmPaymentClaim: (leadId, data) => request(`/payments/lead/${leadId}/confirm-claim`,
    { method: 'PUT', body: JSON.stringify(data) }),
  myServices: () => request('/vendors/me/services'),
  myFeatures: () => request('/me/features'),
  toggleService: (vendorId, serviceId, enabled) =>
    request(`/vendors/${vendorId}/services/${serviceId}/toggle`, {
      method: 'POST', body: JSON.stringify({ enabled }),
    }),
};
