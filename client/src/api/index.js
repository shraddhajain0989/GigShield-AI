// ============================================================================
// GigShield AI — Axios API Client
// ============================================================================

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gs_token');
      localStorage.removeItem('gs_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth API ──
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: (token) => api.post('/auth/refresh', { refreshToken: token }),
  me: () => api.get('/auth/me'),
};

// ── User API ──
export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  selectZone: (data) => api.post('/users/zone', data),
  submitKyc: (data) => api.post('/users/kyc', data),
  listZones: (city) => api.get('/users/zones', { params: { city } }),
  getAnalytics: () => api.get('/users/analytics'),
};

// ── Policy API ──
export const policyAPI = {
  create: (data) => api.post('/policies', data),
  getQuote: (data) => api.post('/policies/quote', data),
  getActive: () => api.get('/policies/active'),
  list: (params) => api.get('/policies', { params }),
  getById: (id) => api.get(`/policies/${id}`),
  cancel: (id, reason) => api.delete(`/policies/${id}`, { data: { reason } }),
};

// ── Claims API ──
export const claimAPI = {
  list: (params) => api.get('/claims', { params }),
  getById: (id) => api.get(`/claims/${id}`),
  review: (id, data) => api.put(`/claims/${id}/review`, data),
  pendingReview: (params) => api.get('/claims/pending-review', { params }),
};

// ── Admin API ──
export const adminAPI = {
  overview: () => api.get('/admin/overview'),
  workers: (params) => api.get('/admin/workers', { params }),
  policies: (params) => api.get('/admin/policies', { params }),
  claims: (params) => api.get('/admin/claims', { params }),
  riskAnalytics: () => api.get('/admin/risk-analytics'),
  zones: () => api.get('/admin/zones'),
  createZone: (data) => api.post('/admin/zones', data),
  triggerScan: () => api.post('/admin/trigger-scan'),
};

// ── Payment API ──
export const paymentAPI = {
  collectPremium: (data) => api.post('/payments/collect-premium', data),
  verifyPremium: (data) => api.post('/payments/verify-premium', data),
  processPayout: (data) => api.post('/payments/process-payout', data),
  getWallet: () => api.get('/payments/wallet'),
  getHistory: (params) => api.get('/payments/history', { params }),
  getRevenue: (params) => api.get('/payments/revenue', { params }),
};
