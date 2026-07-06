// 🔌 API helper — talks to the backend
const BASE = '/api';

function getToken() {
  return localStorage.getItem('vowflo_token');
}

export function setSession(token, user) {
  localStorage.setItem('vowflo_token', token);
  localStorage.setItem('vowflo_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('vowflo_token');
  localStorage.removeItem('vowflo_user');
}

export function getUser() {
  const raw = localStorage.getItem('vowflo_user');
  return raw ? JSON.parse(raw) : null;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (businessName, email, password) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ businessName, email, password }) }),
  vendors: () => request('/vendors'),
  adminCounts: () => request('/admin/counts'),
  markCountSeen: (group) => request(`/admin/counts/${group}/seen`, { method: 'PUT' }),
  adminMessages: () => request('/admin/messages'),
  platformSettings: () => request('/settings/platform'),
  savePlatformSettings: (data) => request('/settings/platform', { method: 'PUT', body: JSON.stringify(data) }),
  revealAwsCreds: () => request('/settings/platform/reveal'),
  reindexAll: () => request('/settings/reindex-all', { method: 'POST' }),
  vendorDetail: (id) => request(`/vendors/${id}/detail`),
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
  bookings: () => request('/bookings'),
  setLeadStatus: (leadId, status) => request(`/bookings/${leadId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  inquirySettings: (vendorId) => request(`/inquiry-settings/${vendorId}`),
  saveInquirySettings: (data) => request('/inquiry-settings', { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    const token = localStorage.getItem('vowflo_token');
    const res = await fetch('/api/inquiry-settings/logo', {
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
  restoreLead: (id) => request(`/leads/${id}/restore`, { method: 'POST' }),
  leadFlags: (id, data) => request(`/leads/${id}/flags`, { method: 'PUT', body: JSON.stringify(data) }),
  crew: () => request('/crew'),
  addCrew: (data) => request('/crew', { method: 'POST', body: JSON.stringify(data) }),
  // 📸 galleries
  albums: () => request('/albums'),
  createAlbum: (data) => request('/albums', { method: 'POST', body: JSON.stringify(data) }),
  album: (id) => request(`/albums/${id}`),
  deleteAlbum: (id) => request(`/albums/${id}`, { method: 'DELETE' }),
  deletePhoto: (albumId, photoId) => request(`/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' }),
  uploadPhotos: async (albumId, files) => {
    const fd = new FormData();
    [...files].forEach(f => fd.append('photos', f));
    const token = localStorage.getItem('vowflo_token');
    const res = await fetch(`/api/albums/${albumId}/photos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  fileUrl: (photoId, type) => `/api/albums/file/${photoId}/${type}`,
  indexFaces: (albumId) => request(`/albums/${albumId}/index-faces`, { method: 'POST' }),
  faceSearch: async (albumId, selfieFile) => {
    const fd = new FormData();
    fd.append('selfie', selfieFile);
    const token = localStorage.getItem('vowflo_token');
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
