import User from '../models/User.js'

/**
 * Must run after requireAuth (needs req.userId). Does its own DB read
 * rather than trusting anything cached on the request — admin routes are
 * low-traffic internal endpoints, so the extra query is a fine trade for
 * never relying on stale or spoofable state. Checks role AND disabled:
 * a disabled admin account loses admin access immediately, even mid-session.
 */
export async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('role disabled')

    if (!user || user.disabled) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    req.adminId = req.userId
    next()
  } catch (err) {
    res.status(500).json({ error: 'Admin authorization check failed' })
  }
}
