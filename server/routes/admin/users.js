import { Router } from 'express'
import mongoose from 'mongoose'
import User from '../../models/User.js'
import Experience from '../../models/Experience.js'
import ProductMaterial from '../../models/ProductMaterial.js'
import AiUsageLog from '../../models/AiUsageLog.js'
import Subscription from '../../models/Subscription.js'
import Plan from '../../models/Plan.js'
import { getSubscriptionForUser } from '../../services/billing/entitlements.js'
import { recordAccountEvent } from '../../services/analytics/track.js'
import { recordAudit } from '../../services/admin/audit.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'

const router = Router()

// List — server-side search/filter/pagination via one aggregation, so the
// whole User collection is never pulled into the browser.
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { search, role, plan, status } = req.query

    const match = {}
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      match.$or = [{ name: re }, { email: re }]
    }
    if (role) match.role = role

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'subscriptions',
          localField: '_id',
          foreignField: 'user',
          as: 'subscription',
        },
      },
      { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'plans',
          localField: 'subscription.plan',
          foreignField: '_id',
          as: 'planDoc',
        },
      },
      { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },
    ]

    if (plan) pipeline.push({ $match: { 'planDoc.slug': plan } })
    if (status) pipeline.push({ $match: { 'subscription.status': status } })

    pipeline.push({
      $lookup: {
        from: 'experiences',
        localField: '_id',
        foreignField: 'owner',
        as: 'experiences',
      },
    })

    pipeline.push({
      $project: {
        name: 1,
        email: 1,
        role: 1,
        disabled: 1,
        createdAt: 1,
        lastActiveAt: 1,
        planName: '$planDoc.name',
        planSlug: '$planDoc.slug',
        subscriptionStatus: '$subscription.status',
        experienceCount: { $size: '$experiences' },
      },
    })

    const [items, totalResult] = await Promise.all([
      User.aggregate([...pipeline, { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }]),
      User.aggregate([...pipeline, { $count: 'total' }]),
    ])

    res.json(paginatedResponse(items, totalResult[0]?.total || 0, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users', detail: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [experienceCount, publishedCount, materialCount, aiUsageCount, subscription] = await Promise.all([
      Experience.countDocuments({ owner: user._id }),
      Experience.countDocuments({ owner: user._id, status: 'published' }),
      ProductMaterial.countDocuments({ user: user._id }),
      AiUsageLog.countDocuments({ user: user._id }),
      getSubscriptionForUser(user._id),
    ])

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        disabled: user.disabled,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
      },
      activity: {
        experiences: experienceCount,
        publishedExperiences: publishedCount,
        materials: materialCount,
        aiGenerations: aiUsageCount,
      },
      billing: {
        plan: { name: subscription.plan.name, slug: subscription.plan.slug },
        status: subscription.status,
        provider: subscription.provider,
        // Provider reference only, never a secret/credential
        providerCustomerId: subscription.providerCustomerId,
        trialEnd: subscription.trialEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        isComplimentary: subscription.isComplimentary,
        grantReason: subscription.grantReason,
        grantNote: subscription.grantNote,
        grantExpiresAt: subscription.grantExpiresAt,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user', detail: err.message })
  }
})

router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be "user" or "admin"' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const previousRole = user.role
    user.role = role
    await user.save()

    await recordAudit({
      adminId: req.adminId,
      action: 'user_role_changed',
      targetType: 'User',
      targetId: user._id,
      metadata: { from: previousRole, to: role },
    })

    res.json({ user: { id: user._id, role: user.role } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role', detail: err.message })
  }
})

router.patch('/:id/disabled', async (req, res) => {
  try {
    const { disabled } = req.body
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ error: 'disabled must be a boolean' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    user.disabled = disabled
    await user.save()

    await recordAudit({
      adminId: req.adminId,
      action: disabled ? 'account_disabled' : 'account_enabled',
      targetType: 'User',
      targetId: user._id,
      metadata: {},
    })

    res.json({ user: { id: user._id, disabled: user.disabled } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update account status', detail: err.message })
  }
})

const GRANT_REASONS = ['ugc', 'creator_partner', 'beta', 'promotion', 'support']

/**
 * Grants time-limited complimentary access by assigning an existing Plan
 * to this user's subscription — never a separate "unlimited" tier. Every
 * normal entitlement and AI-usage check (checkLimit, requireLimit) reads
 * from subscription.plan exactly as it does for a paid subscriber, so a
 * comp-access creator is capped by whatever plan they were granted, same
 * as anyone else on that plan.
 */
router.post('/:id/grant-access', async (req, res) => {
  try {
    const { planSlug, durationDays, reason, note } = req.body

    const plan = await Plan.findOne({ slug: planSlug, active: true })
    if (!plan) return res.status(404).json({ error: 'Unknown or inactive plan' })

    if (!GRANT_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of: ${GRANT_REASONS.join(', ')}` })
    }

    const days = Number(durationDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: 'durationDays must be an integer between 1 and 365' })
    }

    const subscription = await getSubscriptionForUser(req.params.id)
    const previousPlan = subscription.plan.slug

    subscription.plan = plan._id
    subscription.status = 'active'
    subscription.isComplimentary = true
    subscription.grantReason = reason
    subscription.grantNote = typeof note === 'string' ? note.slice(0, 500) : ''
    subscription.grantedBy = req.adminId
    subscription.grantExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    await subscription.save()

    await recordAudit({
      adminId: req.adminId,
      action: 'complimentary_access_granted',
      targetType: 'User',
      targetId: req.params.id,
      metadata: { fromPlan: previousPlan, toPlan: plan.slug, reason, durationDays: days },
    })
    recordAccountEvent({ userId: req.params.id, eventType: 'complimentary_access_granted', metadata: plan.slug })

    res.json({
      subscription: {
        plan: plan.slug,
        isComplimentary: true,
        grantReason: reason,
        grantExpiresAt: subscription.grantExpiresAt,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to grant access', detail: err.message })
  }
})

router.post('/:id/revoke-access', async (req, res) => {
  try {
    const subscription = await getSubscriptionForUser(req.params.id)
    if (!subscription.isComplimentary) {
      return res.status(400).json({ error: 'This user does not have complimentary access to revoke' })
    }

    const revokedPlan = subscription.plan.slug
    const { getFreePlan } = await import('../../services/billing/seedPlans.js')
    const freePlan = await getFreePlan()

    subscription.plan = freePlan._id
    subscription.isComplimentary = false
    subscription.grantReason = 'none'
    subscription.grantNote = ''
    subscription.grantExpiresAt = null
    await subscription.save()

    await recordAudit({
      adminId: req.adminId,
      action: 'complimentary_access_revoked',
      targetType: 'User',
      targetId: req.params.id,
      metadata: { fromPlan: revokedPlan },
    })
    recordAccountEvent({ userId: req.params.id, eventType: 'complimentary_access_revoked', metadata: revokedPlan })

    res.json({ subscription: { plan: 'free', isComplimentary: false } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke access', detail: err.message })
  }
})

export default router
