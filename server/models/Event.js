import mongoose from 'mongoose'
import { EVENT_TYPES } from '../services/analytics/constants.js'

const eventSchema = new mongoose.Schema({
  // Public-experience funnel events (anonymous visitors) set `experience`
  // + `sessionId`. Account-level monetization events (authenticated users,
  // no visitor session) set `user` instead and leave both of those null —
  // same collection, same aggregation patterns, no second events system.
  experience: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Experience',
    default: null,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  eventType: { type: String, enum: EVENT_TYPES, required: true },
  sessionId: { type: String, default: null },
  // Server-assigned, never trusts a client-sent timestamp (avoids clock skew / spoofing)
  timestamp: { type: Date, default: Date.now },
  sectionIndex: { type: Number, default: null },
  sectionType: { type: String, default: null },
  device: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
  browser: { type: String, default: 'unknown' },
  // Hostname only — never the full URL with query params, for privacy
  referrerHost: { type: String, default: null },
})

// Primary funnel/section aggregation path
eventSchema.index({ experience: 1, eventType: 1, timestamp: -1 })
// Distinct-session lookups within an experience
eventSchema.index({ experience: 1, sessionId: 1 })
// Account-level (monetization) event queries
eventSchema.index({ user: 1, eventType: 1, timestamp: -1 })

export default mongoose.model('Event', eventSchema)
