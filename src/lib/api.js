const TOKEN_KEY = 'sp_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function buildError(res, data) {
  const err = new Error(data.error || `Request failed (${res.status})`)
  err.status = res.status
  err.data = data
  if (data.limitReached) {
    err.limitReached = true
    err.limitKey = data.limitKey
    err.current = data.current
    err.limit = data.limit
    err.plan = data.plan
  }
  if (data.trialUsed) err.trialUsed = true
  if (data.aiBusy) err.aiBusy = true
  if (data.maintenance) err.maintenance = true
  return err
}

async function send(path, init) {
  let res
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // A token for a disabled/removed account: clear it so the app returns to login.
    if (res.status === 401 && init.headers?.Authorization) setToken(null)
    throw buildError(res, data)
  }
  return data
}

function authHeaders(auth = true) {
  const headers = {}
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(auth) }
  return send(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
}

/** Multipart upload — lets the browser set the Content-Type boundary itself. */
async function requestUpload(path, formData, method = 'POST') {
  return send(path, { method, headers: authHeaders(), body: formData })
}

/** Authenticated file download (owner-only files can't be plain links because they need the bearer token). */
async function downloadBlob(path, fileName) {
  let res
  try {
    res = await fetch(`/api${path}`, { headers: authHeaders() })
  } catch {
    throw new Error('Could not reach the server.')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw buildError(res, data)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

  archiveExperience: (id) => request(`/experiences/${id}/archive`, { method: 'POST' }),
  restoreExperience: (id) => request(`/experiences/${id}/restore`, { method: 'POST' }),
  listExperiencesIncludingArchived: () => request('/experiences?include=archived'),

  getPublicExperience: (slug) => request(`/public/experiences/${slug}`, { auth: false }),
  getPublicStorefront: (slug) => request(`/public/storefronts/${slug}`, { auth: false }),

  getStorefront: () => request('/storefront'),
  updateStorefront: (payload) => request('/storefront', { method: 'PUT', body: payload }),

  generateExperience: (id) => request(`/experiences/${id}/generate`, { method: 'POST' }),
  starterDraft: (id, replace = false) => request(`/experiences/${id}/starter-draft`, { method: 'POST', body: { replace } }),
  runSectionAction: (id, index, payload) =>
    request(`/experiences/${id}/sections/${index}/action`, { method: 'POST', body: payload }),
  suggestSection: (id) => request(`/experiences/${id}/sections/suggest`, { method: 'POST' }),

  getAnalytics: (id, range) => request(`/experiences/${id}/analytics?range=${range || '7d'}`),
  getAnalyticsSummary: (range) => request(`/experiences/analytics/summary?range=${range || '7d'}`),

  getPlans: () => request('/billing/plans', { auth: false }),
  getSubscription: () => request('/billing/subscription'),
  startCheckout: (planSlug) => request('/billing/checkout', { method: 'POST', body: { planSlug } }),
  verifyCheckout: (transactionId) => request('/billing/verify', { method: 'POST', body: { transactionId } }),
  listPayments: () => request('/billing/payments'),
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

  listDeliverables: (experienceId) => request(`/experiences/${experienceId}/deliverables`),
  uploadDeliverable: (experienceId, file, fields = {}) => {
    const formData = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) formData.append(k, v)
    formData.append('file', file)
    return requestUpload(`/experiences/${experienceId}/deliverables`, formData)
  },
  updateDeliverable: (experienceId, materialId, patch) =>
    request(`/experiences/${experienceId}/deliverables/${materialId}`, { method: 'PATCH', body: patch }),
  replaceDeliverableFile: (experienceId, materialId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestUpload(`/experiences/${experienceId}/deliverables/${materialId}/file`, formData, 'PUT')
  },
  deleteDeliverable: (experienceId, materialId) =>
    request(`/experiences/${experienceId}/deliverables/${materialId}`, { method: 'DELETE' }),
  downloadDeliverable: (experienceId, materialId, fileName) =>
    downloadBlob(`/experiences/${experienceId}/deliverables/${materialId}/download`, fileName),

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
