import { checkLimit } from '../services/billing/entitlements.js'

/**
 * Blocks the request with a structured 402 if the named limit is already
 * reached. The response shape is designed to be rendered directly as an
 * upgrade prompt on the frontend — never a generic error string.
 */
export function requireLimit(limitKey) {
  return async (req, res, next) => {
    try {
      const result = await checkLimit(req.userId, limitKey)
      if (!result.allowed) {
        return res.status(402).json({
          error: `You've reached your plan's limit for ${limitKey}`,
          limitReached: true,
          limitKey: result.limitKey,
          current: result.current,
          limit: result.limit,
          plan: result.plan,
          upgradeRequired: true,
        })
      }
      next()
    } catch (err) {
      res.status(500).json({ error: 'Failed to check plan limits', detail: err.message })
    }
  }
}
