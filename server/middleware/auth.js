import jwt from 'jsonwebtoken'
import User from '../models/User.js'

/**
 * Short-lived cache of "is this account still allowed in?" so a disabled
 * account loses access within seconds on every route (previously only at
 * next login — a disabled user's 30-day token kept working everywhere
 * except admin routes) without a blocking DB read on every request.
 */
const STATUS_TTL_MS = 30 * 1000
const statusCache = new Map()

export function _clearAuthCache() {
  statusCache.clear()
}

export function invalidateUserAuthCache(userId) {
  statusCache.delete(String(userId))
}

async function isAccountActive(userId) {
  const key = String(userId)
  const cached = statusCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.active
  const user = await User.findById(key).select('disabled').lean()
  const active = Boolean(user && !user.disabled)
  statusCache.set(key, { active, expiresAt: Date.now() + STATUS_TTL_MS })
  if (statusCache.size > 10000) statusCache.delete(statusCache.keys().next().value)
  return active
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  if (!payload?.sub || !/^[a-f0-9]{24}$/.test(payload.sub)) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    if (!(await isAccountActive(payload.sub))) {
      return res.status(401).json({ error: 'This account is no longer active' })
    }
  } catch (err) {
    return next(err)
  }

  req.userId = payload.sub

  // Fire-and-forget — the only real signal behind the admin "active users" metric.
  User.updateOne({ _id: req.userId }, { lastActiveAt: new Date() }).catch(() => {})

  next()
}
