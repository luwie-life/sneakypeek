import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = payload.sub

    // Fire-and-forget — never awaited, never blocks the request, and a
    // failure here must never fail an otherwise-valid authenticated call.
    // This is the only real signal behind the admin "active users" metric.
    // Deliberately does NOT check `disabled` here: doing so would require
    // a blocking DB read on every single authenticated request across the
    // whole app. Disabled accounts are rejected at login instead (see
    // auth.routes.js) — see requireAdmin for why admin routes can afford
    // a stricter, blocking check.
    User.updateOne({ _id: req.userId }, { lastActiveAt: new Date() }).catch(() => {})

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
