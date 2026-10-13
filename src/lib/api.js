const TOKEN_KEY = 'sp_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new Error('Could not reach the server. Is the backend running?')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    if (data.limitReached) {
      err.limitReached = true
      err.limitKey = data.limitKey
      err.current = data.current
      err.limit = data.limit
      err.plan = data.plan
    }
    throw err
  }

  return data
}

/** Same error handling as request(), but for multipart/form-data uploads — never JSON.stringifies the body, and lets the browser set the Content-Type boundary itself. */
async function requestUpload(path, formData) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`/api${path}`, { method: 'POST', headers, body: formData })
  } catch (err) {
    throw new Error('Could not reach the server. Is the backend running?')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    if (data.limitReached) {
      err.limitReached = true
      err.limitKey = data.limitKey
      err.current = data.current
      err.limit = data.limit
      err.plan = data.plan
    }
    throw err
  }

  return data
}

export const api = {
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),

  listExperiences: () => request('/experiences'),
  createExperience: (payload) => request('/experiences', { method: 'POST', body: payload }),
  getExperience: (id) => request(`/experiences/${id}`),
  updateExperience: (id, payload) => request(`/experiences/${id}`, { method: 'PUT', body: payload }),
  publishExperience: (id) => request(`/experiences/${id}/publish`, { method: 'POST' }),
  unpublishExperience: (id) => request(`/experiences/${id}/unpublish`, { method: 'POST' }),
  deleteExperience: (id) => request(`/experiences/${id}`, { method: 'DELETE' }),

  getPublicExperience: (slug) => request(`/public/experiences/${slug}`, { auth: false }),

  generateExperience: (id) => request(`/experiences/${id}/generate`, { method: 'POST' }),
  runSectionAction: (id, index, payload) =>
    request(`/experiences/${id}/sections/${index}/action`, { method: 'POST', body: payload }),
  suggestSection: (id) => request(`/experiences/${id}/sections/suggest`, { method: 'POST' }),

  getAnalytics: (id, range) => request(`/experiences/${id}/analytics?range=${range || '30d'}`),

  getPlans: () => request('/billing/plans', { auth: false }),
  getSubscription: () => request('/billing/subscription'),
  startCheckout: (planSlug) => request('/billing/checkout', { method: 'POST', body: { planSlug } }),
  verifyCheckout: (transactionId) => request('/billing/verify', { method: 'POST', body: { transactionId } }),
  cancelSubscription: (reason) => request('/billing/cancel', { method: 'POST', body: { reason } }),
  trackEvent: (eventType, metadata) =>
    request('/billing/track', { method: 'POST', body: { eventType, metadata } }).catch(() => {}),

  listMaterials: (experienceId) => request(`/experiences/${experienceId}/materials`),
  createMaterial: (experienceId, payload) =>
    request(`/experiences/${experienceId}/materials`, { method: 'POST', body: payload }),
  uploadMaterial: (experienceId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestUpload(`/experiences/${experienceId}/materials/upload`, formData)
  },
  reprocessMaterial: (experienceId, materialId) =>
    request(`/experiences/${experienceId}/materials/${materialId}/process`, { method: 'POST' }),
  deleteMaterial: (experienceId, materialId) =>
    request(`/experiences/${experienceId}/materials/${materialId}`, { method: 'DELETE' }),

  analyzeProduct: (experienceId) => request(`/experiences/${experienceId}/analyze`, { method: 'POST' }),
  getProductUnderstanding: (experienceId) => request(`/experiences/${experienceId}/product-understanding`),
}

function toQuery(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  const qs = new URLSearchParams(clean).toString()
  return qs ? `?${qs}` : ''
}

export const adminApi = {
  getOverview: (range) => request(`/admin/overview${toQuery({ range })}`),

  listUsers: (params) => request(`/admin/users${toQuery(params)}`),
  getUser: (id) => request(`/admin/users/${id}`),
  updateUserRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
  setUserDisabled: (id, disabled) => request(`/admin/users/${id}/disabled`, { method: 'PATCH', body: { disabled } }),
  grantAccess: (id, payload) => request(`/admin/users/${id}/grant-access`, { method: 'POST', body: payload }),
  revokeAccess: (id) => request(`/admin/users/${id}/revoke-access`, { method: 'POST' }),

  listExperiences: (params) => request(`/admin/experiences${toQuery(params)}`),
  getExperience: (id) => request(`/admin/experiences/${id}`),

  listSubscriptions: (params) => request(`/admin/subscriptions${toQuery(params)}`),
  listPayments: (params) => request(`/admin/payments${toQuery(params)}`),

  listPlans: () => request('/admin/plans'),
  updatePlan: (id, patch) => request(`/admin/plans/${id}`, { method: 'PATCH', body: patch }),
  getPlanSubscriberCount: (id) => request(`/admin/plans/${id}/subscriber-count`),

  getAiUsage: (range) => request(`/admin/ai-usage${toQuery({ range })}`),

  listMaterials: (params) => request(`/admin/materials${toQuery(params)}`),
  getMaterial: (id) => request(`/admin/materials/${id}`),

  getSettings: () => request('/admin/settings'),
  updateSettings: (patch) => request('/admin/settings', { method: 'PATCH', body: patch }),

  listAuditLog: (params) => request(`/admin/audit-log${toQuery(params)}`),
}
