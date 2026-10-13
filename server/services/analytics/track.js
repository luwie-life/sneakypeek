import Event from '../../models/Event.js'
import { EVENT_TYPES } from './constants.js'

// Deliberately simple regex checks instead of a UA-parsing library —
// we only need broad buckets, not exact versions.
function detectDevice(ua = '') {
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  if (/mobile|iphone|android/i.test(ua)) return 'mobile'
  if (ua) return 'desktop'
  return 'unknown'
}

function detectBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'edge'
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'chrome'
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'safari'
  if (/firefox\//i.test(ua)) return 'firefox'
  return ua ? 'other' : 'unknown'
}

function sanitizeReferrer(referrer) {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname || null
  } catch {
    return null
  }
}

/**
 * Records one analytics event. Validates just enough to keep the
 * collection clean — invalid events are silently dropped (returns null)
 * rather than erroring, since a tracking call should never break the
 * visitor's experience.
 */
export async function recordEvent({
  experienceId,
  eventType,
  sessionId,
  sectionIndex,
  sectionType,
  userAgent,
  referrer,
}) {
  if (!EVENT_TYPES.includes(eventType)) return null
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) return null

  return Event.create({
    experience: experienceId,
    eventType,
    sessionId,
    sectionIndex: Number.isInteger(sectionIndex) ? sectionIndex : null,
    sectionType: typeof sectionType === 'string' ? sectionType.slice(0, 40) : null,
    device: detectDevice(userAgent),
    browser: detectBrowser(userAgent),
    referrerHost: sanitizeReferrer(referrer),
  })
}

/**
 * Records one account-level (monetization/lifecycle) event — tied to a
 * user, not a visitor session or an experience. `metadata` must never
 * contain payment credentials or secrets; it's stored as the event's
 * `sectionType` field (repurposed as a short plain string, e.g. a plan
 * slug) to avoid adding a parallel schema just for this. Never throws —
 * same fail-quiet contract as recordEvent.
 */
export async function recordAccountEvent({ userId, eventType, metadata }) {
  if (!EVENT_TYPES.includes(eventType)) return null
  if (!userId) return null

  return Event.create({
    user: userId,
    eventType,
    sectionType: typeof metadata === 'string' ? metadata.slice(0, 40) : null,
  })
}
