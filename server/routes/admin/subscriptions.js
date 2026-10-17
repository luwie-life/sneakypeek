import { Router } from 'express'
import Subscription from '../../models/Subscription.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'
import { hasPaidAccess } from '../../services/billing/entitlements.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { status, provider, plan } = req.query

    const match = {}
    if (typeof status === 'string' && status) match.status = status
    if (typeof provider === 'string' && provider) match.provider = provider

    let query = Subscription.find(match)
      .populate('user', 'name email')
      .populate('plan', 'name slug monthlyPriceCents currency')
      .sort({ createdAt: -1 })

    // Filtering by plan slug requires the populate to have happened, so we
    // filter in two passes: fetch a generous window, then filter/paginate
    // in memory only for this one field. Safe at V1 scale; if this
    // collection grows large, move plan filtering into an aggregation
    // $lookup like admin/users.js already does.
    if (plan) {
      const all = await query
      const filtered = all.filter((s) => s.plan?.slug === plan)
      const pageItems = filtered.slice(skip, skip + limit)
      return res.json(paginatedResponse(serializeList(pageItems), filtered.length, { page, limit }))
    }

    const [items, total] = await Promise.all([
      query.skip(skip).limit(limit),
      Subscription.countDocuments(match),
    ])

    res.json(paginatedResponse(serializeList(items), total, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscriptions', detail: err.message })
  }
})

function serializeList(subs) {
  return subs.map((s) => ({
    id: s._id,
    user: s.user ? { id: s.user._id, name: s.user.name, email: s.user.email } : null,
    plan: s.plan ? { name: s.plan.name, slug: s.plan.slug, monthlyPriceCents: s.plan.monthlyPriceCents, currency: s.plan.currency } : null,
    provider: s.provider,
    status: s.status,
    providerSubscriptionId: s.providerSubscriptionId,
    trialEnd: s.trialEnd,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    canceledAt: s.canceledAt,
    pastDueSince: s.pastDueSince,
    failedRenewalAttempts: s.failedRenewalAttempts,
    lastPaymentAt: s.lastPaymentAt,
    lastPaymentError: s.lastPaymentError,
    isComplimentary: s.isComplimentary,
    // Whether the user actually has paid features right now (status alone
    // can lag, e.g. 'active' but past the grace period before the next read).
    hasAccess: hasPaidAccess(s),
    recentHistory: (s.history || []).slice(-5).reverse(),
    createdAt: s.createdAt,
  }))
}

export default router
