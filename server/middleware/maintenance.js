import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { getSettings } from '../services/admin/settings.js'

// Paths that must keep working during maintenance: health checks, logging
// in (so admins can get in to turn it off), the payment webhook (Flutterwave
// retries are limited — dropping them would lose renewals), and admin routes.
const ALWAYS_ALLOWED = [/^\/api\/health$/, /^\/api\/auth\/login$/, /^\/api\/auth\/me$/, /^\/api\/billing\/webhook$/, /^\/api\/admin\//]

/**
 * Enforces PlatformSettings.maintenanceMode server-side. Before this, the
 * toggle existed in the admin UI and database but nothing ever read it.
 * Admin users bypass maintenance so they can verify fixes.
 */
export async function maintenanceGuard(req, res, next) {
  try {
    if (ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next()
    const settings = await getSettings()
    if (!settings.maintenanceMode) return next()

    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
        const user = await User.findById(payload.sub).select('role disabled')
        if (user && !user.disabled && user.role === 'admin') return next()
      } catch {
        // fall through to the maintenance response
      }
    }
    return res.status(503).json({ error: 'Sneaky Peek is undergoing maintenance. Please try again shortly.', maintenance: true })
  } catch {
    next() // fail open — a settings lookup failure must not take the whole API down
  }
}
