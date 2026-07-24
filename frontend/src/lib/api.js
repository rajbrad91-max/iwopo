// 🔌 API helper — talks to the backend
const BASE = '/api';

// 🕐 format a "HH:MM" (24h) string per the vendor's saved preference
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

// 🗂️ Session storage is PER TAB, so a super-admin tab and a vendor tab can be
// open side by side without overwriting each other. localStorage is shared
// across every tab of the site, which meant logging into one panel silently
// replaced the other's session — refreshing then dropped you into the wrong
// panel, or produced "Super admin only" errors on admin screens.
//
// localStorage is still read as a fallback (so an existing login isn't lost the
// first time this ships) and still written, so opening a NEW tab keeps you
// signed in rather than forcing a fresh login every time.
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

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
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
  changePassword: (current, next) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  vendors: () => request('/vendors'),
  adminCounts: () => request('/admin/counts'),
  markCountSeen: (group) => request(`/admin/counts/${group}/seen`, { method: 'PUT' }),
  adminMessages: () => request('/admin/messages'),
  platformSettings: () => request('/settings/platform'),
  savePlatformSettings: (data) => request('/settings/platform', { method: 'PUT', body: JSON.stringify(data) }),
  revealAwsCreds: () => request('/settings/platform/reveal'),
  reindexAll: () => request('/settings/reindex-all', { method: 'POST' }),
  faceQueueStatus: () => request('/face-queue/status'),

  // 🤖 Chatbot (Tasveer)
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
  myChatbotHistory: () => request('/chatbot/my/history'),
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
  assignPackage: (leadId, package_id) => request(`/vendor-packages/assign/${leadId}`, { method: 'PUT', body: JSON.stringify({ package_id }) }),
  leadPayments: (leadId) => request(`/payments/lead/${leadId}`),
  addPayment: (leadId, amount, method, note) => request(`/payments/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ amount, method, note }) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: 'DELETE' }),
  saveMoney: (leadId, data) => request(`/payments/lead/${leadId}/money`, { method: 'PUT', body: JSON.stringify(data) }),
  setWebPayment: (leadId, enabled) => request(`/payments/lead/${leadId}/web-payment`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  bookings: () => request('/bookings'),
  setLeadStatus: (leadId, status) => request(`/bookings/${leadId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  inquirySettings: (vendorId) => request(`/inquiry-settings/${vendorId}`),
  saveInquirySettings: (data) => request('/inquiry-settings', { method: 'PUT', body: JSON.stringify(data) }),
  myProfile: () => request('/me/profile'),
  saveProfile: (data) => request('/me/profile', { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    const token = localStorage.getItem('iwopo_token');
    const res = await fetch('/api/me/logo', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error('Logo upload failed');
    return res.json();
  },
  emailSettings: () => request('/email/settings'),
  saveEmailSettings: (data) => request('/email/settings', { method: 'PUT', body: JSON.stringify(data) }),
  emailLead: (leadId, subject, body) => request(`/email/lead/${leadId}`, { method: 'POST', body: JSON.stringify({ subject, body }) }),
  leadContracts: (leadId) => request(`/contracts/lead/${leadId}`),
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
  portal: (token) => request(`/portal/${token}`),
  portalPick: (token, package_id) => request(`/portal/${token}/pick`, { method: 'POST', body: JSON.stringify({ package_id }) }),
  portalOfficeVisit: (token) => request(`/portal/${token}/office-visit`, { method: 'POST' }),
  myServices: () => request('/vendors/me/services'),
  myFeatures: () => request('/me/features'),
  toggleService: (vendorId, serviceId, enabled) =>
    request(`/vendors/${vendorId}/services/${serviceId}/toggle`, {
      method: 'POST', body: JSON.stringify({ enabled }),
    }),
};
