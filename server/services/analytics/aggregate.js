import mongoose from 'mongoose'
import Event from '../../models/Event.js'
import { FUNNEL_STEPS } from './constants.js'

export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null }

const DAY_MS = 24 * 60 * 60 * 1000

export function resolveRange(range, now = new Date()) {
  const days = Object.prototype.hasOwnProperty.call(RANGE_DAYS, range) ? RANGE_DAYS[range] : 30
  if (!days) return null // 'all'
  return new Date(now.getTime() - days * DAY_MS)
}

function oid(id) {
  return new mongoose.Types.ObjectId(String(id))
}

function window(experienceId, from, to) {
  const match = { experience: oid(experienceId) }
  if (from || to) match.timestamp = {}
  if (from) match.timestamp.$gte = from
  if (to) match.timestamp.$lt = to
  return match
}

function rate(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10 // one decimal place
}

/**
 * Distinct-session count per event type in one pass: collapse to
 * (eventType, sessionId) pairs, then count per type.
 */
async function distinctSessionCountsByEventType(match) {
  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: { eventType: '$eventType', sessionId: '$sessionId' } } },
    { $group: { _id: '$_id.eventType', count: { $sum: 1 } } },
  ])
  const counts = {}
  for (const row of rows) counts[row._id] = row.count
  return counts
}

async function headline(match) {
  const [counts, viewsRow, visitorsRow, downloadsRow] = await Promise.all([
    distinctSessionCountsByEventType(match),
    // Views are already deduplicated per session per day at write time.
    Event.countDocuments({ ...match, eventType: 'experience_viewed' }),
    Event.aggregate([
      { $match: { ...match, eventType: 'experience_viewed' } },
      { $group: { _id: { $ifNull: ['$visitorId', '$sessionId'] } } },
      { $count: 'n' },
    ]),
    Event.countDocuments({ ...match, eventType: 'asset_downloaded' }),
  ])
  return {
    counts,
    views: viewsRow,
    uniqueVisitors: visitorsRow[0]?.n || 0,
    downloads: downloadsRow,
  }
}

async function sectionStats(match) {
  const [perSection, furthest] = await Promise.all([
    Event.aggregate([
      { $match: { ...match, eventType: { $in: ['section_viewed', 'section_completed', 'interaction_completed'] }, sectionIndex: { $ne: null } } },
      { $group: { _id: { i: '$sectionIndex', t: '$eventType', s: '$sessionId' } } },
      { $group: { _id: { i: '$_id.i', t: '$_id.t' }, count: { $sum: 1 } } },
    ]),
    // Furthest section each session reached → where visitors stop.
    Event.aggregate([
      { $match: { ...match, eventType: 'section_viewed', sectionIndex: { $ne: null } } },
      { $group: { _id: '$sessionId', maxIndex: { $max: '$sectionIndex' } } },
      { $group: { _id: '$maxIndex', sessions: { $sum: 1 } } },
    ]),
  ])
  const by = {}
  for (const row of perSection) {
    const i = row._id.i
    by[i] = by[i] || { views: 0, completions: 0, interactions: 0 }
    if (row._id.t === 'section_viewed') by[i].views = row.count
    if (row._id.t === 'section_completed') by[i].completions = row.count
    if (row._id.t === 'interaction_completed') by[i].interactions = row.count
  }
  const stops = {}
  for (const row of furthest) stops[row._id] = row.sessions
  return { by, stops }
}

async function dailyViews(match, from) {
  const rows = await Event.aggregate([
    { $match: { ...match, eventType: 'experience_viewed' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, views: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  if (!from) return rows.map((r) => ({ date: r._id, views: r.views }))
  const map = new Map(rows.map((r) => [r._id, r.views]))
  const out = []
  for (let t = new Date(from); t <= new Date(); t = new Date(t.getTime() + DAY_MS)) {
    const key = t.toISOString().slice(0, 10)
    out.push({ date: key, views: map.get(key) || 0 })
  }
  return out
}

async function topReferrers(match) {
  const rows = await Event.aggregate([
    { $match: { ...match, eventType: 'experience_viewed' } },
    { $group: { _id: { $ifNull: ['$referrerHost', 'direct'] }, views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: 5 },
  ])
  return rows.map((r) => ({ source: r._id, views: r.views }))
}

/**
 * Everything the creator analytics dashboard shows for one experience.
 * Every number is something the Event collection actually records — there
 * is no "sales" or "revenue" figure, because Sneaky Peek cannot see the
 * creator's external checkout. Checkout clicks are reported as clicks.
 */
export async function getAnalyticsReport(experience, range) {
  const now = new Date()
  const from = resolveRange(range, now)
  const match = window(experience._id, from, null)

  const [current, sections, daily, referrers] = await Promise.all([
    headline(match),
    sectionStats(match),
    dailyViews(match, from),
    topReferrers(match),
  ])

  let previous = null
  if (from) {
    const prevFrom = new Date(from.getTime() - (now.getTime() - from.getTime()))
    const prev = await headline(window(experience._id, prevFrom, from))
    previous = {
      views: prev.views,
      uniqueVisitors: prev.uniqueVisitors,
      checkoutClicks: prev.counts.checkout_clicked || 0,
      ctaClicks: prev.counts.cta_clicked || 0,
    }
  }

  const c = current.counts
  const visitors = c.experience_viewed || 0
  const steps = FUNNEL_STEPS.map((step, i) => {
    const count = c[step.eventType] || 0
    return { key: step.key, label: step.label, count, rateFromStart: rate(count, visitors), stepIndex: i }
  })

  const sectionRows = experience.sections.map((section, index) => {
    const s = sections.by[index] || { views: 0, completions: 0, interactions: 0 }
    const stoppedHere = sections.stops[index] || 0
    return {
      index,
      type: section.type,
      heading: section.heading || section.type?.replace(/_/g, ' ') || `Section ${index + 1}`,
      visibility: section.visibility || 'free',
      views: s.views,
      reachRate: rate(s.views, visitors),
      completions: s.completions,
      interactions: s.interactions,
      // Share of section viewers for whom this was the furthest point reached.
      stoppedHere,
      dropOffRate: rate(stoppedHere, s.views),
    }
  })

  // The single most useful pointer for a creator: where most people leave.
  const candidates = sectionRows.filter((r) => r.views >= 5 && r.type !== 'cta')
  const biggestDropOff = candidates.length
    ? candidates.reduce((a, b) => (b.stoppedHere > a.stoppedHere ? b : a))
    : null

  return {
    hasData: visitors > 0,
    summary: {
      views: current.views,
      uniqueVisitors: current.uniqueVisitors,
      sessions: visitors,
      engagementRate: rate(c.section_viewed || 0, visitors),
      completionRate: rate(c.experience_completed || 0, visitors),
      interactions: c.interaction_completed || 0,
      ctaViews: c.cta_viewed || 0,
      ctaClicks: c.cta_clicked || 0,
      ctaClickRate: rate(c.cta_clicked || 0, c.cta_viewed || 0),
      checkoutClicks: c.checkout_clicked || 0,
      checkoutClickRate: rate(c.checkout_clicked || 0, visitors),
      freeDownloads: current.downloads,
    },
    previous,
    funnel: { steps },
    sections: sectionRows,
    biggestDropOff: biggestDropOff && biggestDropOff.stoppedHere > 0 ? { index: biggestDropOff.index, heading: biggestDropOff.heading, stoppedHere: biggestDropOff.stoppedHere } : null,
    daily,
    referrers,
    notes: ['Checkout clicks show visitors who opened your checkout page — they are not confirmed sales.'],
  }
}

/** Compact per-experience totals for the analytics index list. */
export async function getOwnerSummary(experienceIds, range) {
  const from = resolveRange(range)
  const match = { experience: { $in: experienceIds.map(oid) } }
  if (from) match.timestamp = { $gte: from }
  const rows = await Event.aggregate([
    { $match: { ...match, eventType: { $in: ['experience_viewed', 'checkout_clicked', 'cta_clicked'] } } },
    { $group: { _id: { e: '$experience', t: '$eventType', s: '$sessionId' } } },
    { $group: { _id: { e: '$_id.e', t: '$_id.t' }, count: { $sum: 1 } } },
  ])
  const out = {}
  for (const row of rows) {
    const id = String(row._id.e)
    out[id] = out[id] || { visitors: 0, ctaClicks: 0, checkoutClicks: 0 }
    if (row._id.t === 'experience_viewed') out[id].visitors = row.count
    if (row._id.t === 'cta_clicked') out[id].ctaClicks = row.count
    if (row._id.t === 'checkout_clicked') out[id].checkoutClicks = row.count
  }
  return out
}

/**
 * Platform-wide equivalent for the admin overview's Engagement section.
 */
export async function getPlatformFunnel(range) {
  const from = resolveRange(range)
  const match = { experience: { $ne: null } }
  if (from) match.timestamp = { $gte: from }

  const counts = await distinctSessionCountsByEventType(match)
  const visitors = counts.experience_viewed || 0

  return {
    totalViews: visitors,
    ctaClicks: counts.cta_clicked || 0,
    checkoutClicks: counts.checkout_clicked || 0,
    completionRate: rate(counts.experience_completed || 0, visitors),
  }
}
