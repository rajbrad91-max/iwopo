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
  services: () => request('/services'),
  packages: () => request('/packages'),
  myServices: () => request('/vendors/me/services'),
  toggleService: (vendorId, serviceId, enabled) =>
    request(`/vendors/${vendorId}/services/${serviceId}/toggle`, {
      method: 'POST', body: JSON.stringify({ enabled }),
    }),
};
