const SESSION_KEY = 'sp_session'
const VISITOR_KEY = 'sp_visitor'
const VISITOR_TTL_MS = 30 * 24 * 60 * 60 * 1000

function randomId(prefix) {
  const raw = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '')
  return `${prefix}_${raw}`.slice(0, 40)
}

function safeStorage(kind) {
  try {
    const s = window[kind]
    const probe = '__sp'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

let memorySession = null

/** Per-tab visit id (resets when the tab closes). Only used to dedupe analytics. */
export function getSessionId() {
  const store = safeStorage('sessionStorage')
  if (!store) return (memorySession ||= randomId('s'))
  let id = store.getItem(SESSION_KEY)
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = randomId('s')
    store.setItem(SESSION_KEY, id)
  }
  return id
}

/**
 * Random id kept for 30 days to count unique visitors across visits.
 * It is not linked to any personal data and is rotated after 30 days.
 */
export function getVisitorId() {
  const store = safeStorage('localStorage')
  if (!store) return undefined
  try {
    const saved = JSON.parse(store.getItem(VISITOR_KEY) || 'null')
    if (saved?.id && saved.createdAt && Date.now() - saved.createdAt < VISITOR_TTL_MS) return saved.id
  } catch {
    // fall through and rotate
  }
  const id = randomId('v')
  store.setItem(VISITOR_KEY, JSON.stringify({ id, createdAt: Date.now() }))
  return id
}

function post(url, body) {
  try {
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
  } catch {
    // Tracking must never break the visitor's experience
  }
}

/**
 * Sends one analytics event. Never awaited by callers, never throws,
 * never slows down the page: `keepalive` lets the request complete even
 * if the visitor is mid-navigation (e.g. clicking through to checkout).
 * The server deduplicates per session, so calling this twice is harmless.
 */
export function sendEvent(slug, { eventType, sectionIndex, sectionType } = {}) {
  if (!slug) return
  post(`/api/public/experiences/${encodeURIComponent(slug)}/events`, {
    eventType,
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    sectionIndex,
    sectionType,
    referrer: document.referrer || undefined,
  })
}

export function sendStorefrontView(slug) {
  if (!slug) return
  post(`/api/public/storefronts/${encodeURIComponent(slug)}/events`, {
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    referrer: document.referrer || undefined,
  })
}
