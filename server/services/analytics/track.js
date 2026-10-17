import Event from '../../models/Event.js'
import { EVENT_TYPES, VISITOR_EVENTS, SECTION_EVENTS } from './constants.js'

// Deliberately simple regex checks instead of a UA-parsing library —
// we only need broad buckets, not exact versions.
export function detectDevice(ua = '') {
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  if (/mobile|iphone|android/i.test(ua)) return 'mobile'
  if (ua) return 'desktop'
  return 'unknown'
}

export function detectBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'edge'
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'chrome'
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'safari'
  if (/firefox\//i.test(ua)) return 'firefox'
  return ua ? 'other' : 'unknown'
}

// Obvious automated clients shouldn't inflate creator metrics.
const BOT_UA = /bot|crawler|spider|crawling|preview|facebookexternalhit|slackbot|whatsapp|headless|lighthouse/i

function sanitizeReferrer(referrer) {
  if (!referrer || typeof referrer !== 'string') return null
  try {
    return new URL(referrer).hostname.slice(0, 100) || null
  } catch {
    return null
  }
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/**
 * Records one visitor event for a public experience. Silently drops
 * anything invalid (returns null) — tracking must never break the page.
 * Deduplicated per (experience, session, type, section, UTC day), so
 * repeated posts never inflate counts.
 */
export async function recordEvent({ experienceId, eventType, sessionId, visitorId, sectionIndex, sectionType, userAgent, referrer }) {
  if (!VISITOR_EVENTS.includes(eventType)) return null
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) return null
  if (userAgent && BOT_UA.test(userAgent)) return null
  const idx = Number.isInteger(sectionIndex) && sectionIndex >= 0 && sectionIndex < 100 ? sectionIndex : null
  if (SECTION_EVENTS.includes(eventType) && idx === null) return null

  const dedupeKey = `${experienceId}:${sessionId}:${eventType}:${idx ?? ''}:${dayKey()}`
  try {
    return await Event.create({
      experience: experienceId,
      eventType,
      sessionId,
      visitorId: typeof visitorId === 'string' && ID_RE.test(visitorId) ? visitorId : null,
      sectionIndex: idx,
      sectionType: typeof sectionType === 'string' ? sectionType.slice(0, 40) : null,
      device: detectDevice(userAgent),
      browser: detectBrowser(userAgent),
      referrerHost: sanitizeReferrer(referrer),
      dedupeKey,
    })
  } catch (err) {
    if (err.code === 11000) return null // duplicate — already counted
    throw err
  }
}

/** Server-side record of a public free download (counted per session per file per day). */
export async function recordDownload({ experienceId, assetId, sessionId, userAgent }) {
  if (userAgent && BOT_UA.test(userAgent)) return null
  const sid = typeof sessionId === 'string' && ID_RE.test(sessionId) ? sessionId : null
  try {
    return await Event.create({
      experience: experienceId,
      eventType: 'asset_downloaded',
      sessionId: sid,
      sectionType: String(assetId).slice(0, 40),
      device: detectDevice(userAgent),
      browser: detectBrowser(userAgent),
      dedupeKey: sid ? `${experienceId}:${sid}:asset_downloaded:${assetId}:${dayKey()}` : undefined,
    })
  } catch (err) {
    if (err.code === 11000) return null
    throw err
  }
}

/** Storefront page view, attributed to the storefront owner. */
export async function recordStorefrontView({ ownerUserId, sessionId, visitorId, userAgent, referrer }) {
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) return null
  if (userAgent && BOT_UA.test(userAgent)) return null
  try {
    return await Event.create({
      user: ownerUserId,
      eventType: 'storefront_viewed',
      sessionId,
      visitorId: typeof visitorId === 'string' && ID_RE.test(visitorId) ? visitorId : null,
      device: detectDevice(userAgent),
      browser: detectBrowser(userAgent),
      referrerHost: sanitizeReferrer(referrer),
      dedupeKey: `sf:${ownerUserId}:${sessionId}:${dayKey()}`,
    })
  } catch (err) {
    if (err.code === 11000) return null
    throw err
  }
}

/**
 * Records one account-level (monetization/lifecycle) event — tied to a
 * user, not a visitor session or an experience. `metadata` must never
 * contain payment credentials or secrets; it's stored as the event's
 * `sectionType` field (a short plain string, e.g. a plan slug). Never
 * throws — same fail-quiet contract as recordEvent.
 */
export async function recordAccountEvent({ userId, eventType, metadata }) {
  if (!EVENT_TYPES.includes(eventType)) return null
  if (!userId) return null

  return Event.create({
    user: userId,
    eventType,
    sectionType: typeof metadata === 'string' ? metadata.slice(0, 40) : null,
  }).catch(() => null)
}
