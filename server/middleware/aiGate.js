import { checkAiAccess, acquireAiLock, releaseAiLock } from '../services/billing/entitlements.js'

/**
 * Server-side gate for every AI call:
 *  1. Per-user lock — one AI request at a time per account. A second
 *     concurrent request (double click, another tab, a script) gets 409
 *     instead of racing past the usage check.
 *  2. Allowance check — the monthly plan allowance, or the Free plan's
 *     one-time trial (analysis + generation for a single experience).
 * The lock is released when the response finishes. On success, the route
 * records usage with req.aiGrant (so failed AI calls are never billed).
 */
export function aiGate(kind) {
  return async (req, res, next) => {
    const locked = await acquireAiLock(req.userId)
    if (!locked) {
      return res.status(409).json({ error: 'Another AI request is still running — please wait for it to finish.', aiBusy: true })
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      releaseAiLock(req.userId)
    }
    res.on('finish', release)
    res.on('close', release)

    try {
      const access = await checkAiAccess(req.userId, { kind, experienceId: req.params.id })
      if (!access.allowed) {
        release()
        return res.status(402).json({
          error: access.trialUsed
            ? 'Your free AI trial has been used. Upgrade to keep generating with AI.'
            : `You've reached your plan's AI limit`,
          limitReached: true,
          limitKey: 'aiGenerationsPerMonth',
          current: access.current,
          limit: access.limit,
          plan: access.plan,
          trialUsed: Boolean(access.trialUsed),
          upgradeRequired: true,
        })
      }
      req.aiGrant = { kind, trial: access.trial }
      next()
    } catch (err) {
      release()
      next(err)
    }
  }
}
