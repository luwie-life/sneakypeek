import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Subscription from '../models/Subscription.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/security.js'
import { getFreePlan } from '../services/billing/seedPlans.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// bcrypt only uses the first 72 bytes; cap well above typical passwords
// but low enough to bound hashing cost.
const MAX_PASSWORD = 200

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts — please wait a few minutes and try again',
})

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: '30d',
    algorithm: 'HS256',
  })
}

router.post('/signup', authLimiter, requireSetting('signupsEnabled', 'New signups are temporarily disabled'), async (req, res) => {
  const { name, email, password } = req.body || {}

  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name.trim() || !email.trim() || !password) {
    return res.status(400).json({ error: 'name, email and password are required' })
  }
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be under 100 characters' })
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }
  if (password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `Password must be under ${MAX_PASSWORD} characters` })
  }

  const existing = await User.findOne({ email: normalizedEmail })
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const passwordHash = await User.hashPassword(password)
  let user
  try {
    user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' })
    throw err
  }

  const freePlan = await getFreePlan()
  await Subscription.create({ user: user._id, plan: freePlan._id, status: 'active', provider: 'none' })

  res.status(201).json({ user, token: signToken(user) })
})

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  if (password.length > MAX_PASSWORD) return res.status(401).json({ error: 'Invalid email or password' })

  const user = await User.findOne({ email: email.trim().toLowerCase() })
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const valid = await user.comparePassword(password)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  if (user.disabled) {
    return res.status(403).json({ error: 'This account has been disabled' })
  }

  res.json({ user, token: signToken(user) })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

export default router
