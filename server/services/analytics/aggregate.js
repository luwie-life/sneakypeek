import mongoose from 'mongoose'
import Event from '../../models/Event.js'
import { FUNNEL_STEPS } from './constants.js'

export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null }

export function resolveRange(range) {
  const days = Object.prototype.hasOwnProperty.call(RANGE_DAYS, range) ? RANGE_DAYS[range] : 30
  if (!days) return null // 'all'
  const from = new Date()
  from.setDate(from.getDate() - days)
  return from
}

function baseMatch(experienceId, from) {
  const match = { experience: new mongoose.Types.ObjectId(experienceId) }
  if (from) match.timestamp = { $gte: from }
  return match
}

/**
 * Distinct-session count per event type, computed in a single pass:
 * first collapse to (eventType, sessionId) pairs, then count them per type.
 * This is the standard way to get "unique sessions that did X" cheaply
 * without a separate query per funnel step.
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

/**
 * Same idea, but grouped by section index too, for the section-level
 * performance table.
 */
async function distinctSessionCountsBySection(match) {
  const rows = await Event.aggregate([
    { $match: { ...match, eventType: { $in: ['section_viewed', 'section_completed'] }, sectionIndex: { $ne: null } } },
    { $group: { _id: { sectionIndex: '$sectionIndex', eventType: '$eventType', sessionId: '$sessionId' } } },
    { $group: { _id: { sectionIndex: '$_id.sectionIndex', eventType: '$_id.eventType' }, count: { $sum: 1 } } },
  ])

  const bySection = {}
  for (const row of rows) {
    const idx = row._id.sectionIndex
    bySection[idx] = bySection[idx] || { views: 0, completions: 0 }
    if (row._id.eventType === 'section_viewed') bySection[idx].views = row.count
    if (row._id.eventType === 'section_completed') bySection[idx].completions = row.count
  }
  return bySection
}

function rate(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10 // one decimal place
}

export async function getFunnel(experienceId, range) {
  const from = resolveRange(range)
  const match = baseMatch(experienceId, from)

  const counts = await distinctSessionCountsByEventType(match)

  const steps = FUNNEL_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    count: counts[step.eventType] || 0,
  }))

  const visitors = steps[0].count
  const ctaViewed = counts.cta_viewed || 0
  const ctaClicked = counts.cta_clicked || 0
  const checkoutClicked = counts.checkout_clicked || 0
  const engaged = counts.section_viewed || 0
  const completed = counts.experience_completed || 0

  return {
    hasData: visitors > 0,
    steps,
    summary: {
      visitors,
      engagementRate: rate(engaged, visitors),
      completionRate: rate(completed, visitors),
      ctaClickRate: rate(ctaClicked, ctaViewed),
      checkoutClickRate: rate(checkoutClicked, visitors),
    },
  }
}

export async function getSectionPerformance(experienceId, range, sections) {
  const from = resolveRange(range)
  const match = baseMatch(experienceId, from)
  const bySection = await distinctSessionCountsBySection(match)

  return sections.map((section, index) => {
    const stats = bySection[index] || { views: 0, completions: 0 }
    return {
      index,
      type: section.type,
      heading: section.heading || section.type?.replace(/_/g, ' ') || `Section ${index + 1}`,
      views: stats.views,
      completions: stats.completions,
      dropOffRate: rate(Math.max(stats.views - stats.completions, 0), stats.views),
    }
  })
}

/**
 * Platform-wide equivalent of getFunnel — same distinct-session counting,
 * same date-range convention, just without an experience filter. Used by
 * the admin overview's Engagement section. Never invents a metric this
 * can't actually compute: only totals the underlying Event model already
 * tracks reliably.
 */
export async function getPlatformFunnel(range) {
  const from = resolveRange(range)
  const match = from ? { timestamp: { $gte: from } } : {}

  const counts = await distinctSessionCountsByEventType(match)

  const visitors = counts.experience_viewed || 0
  const ctaClicked = counts.cta_clicked || 0
  const checkoutClicked = counts.checkout_clicked || 0
  const completed = counts.experience_completed || 0

  return {
    totalViews: visitors,
    ctaClicks: ctaClicked,
    checkoutClicks: checkoutClicked,
    completionRate: rate(completed, visitors),
  }
}
