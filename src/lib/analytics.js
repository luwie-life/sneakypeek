const SESSION_KEY = 'sp_session'

export function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

/**
 * Sends one analytics event. Never awaited by callers, never throws,
 * never slows down the page: `keepalive` lets the request complete even
 * if the visitor is mid-navigation (e.g. clicking through to checkout).
 */
export function sendEvent(slug, { eventType, sectionIndex, sectionType } = {}) {
  try {
    fetch(`/api/public/experiences/${slug}/events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        sessionId: getSessionId(),
        sectionIndex,
        sectionType,
        referrer: document.referrer || undefined,
      }),
    }).catch(() => {})
  } catch {
    // Tracking must never break the visitor's experience
  }
}
