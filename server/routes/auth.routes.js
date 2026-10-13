import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Subscription from '../models/Subscription.js'
import { requireAuth } from '../middleware/auth.js'
import { getFreePlan } from '../services/billing/seedPlans.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  })
}

router.post('/signup', requireSetting('signupsEnabled', 'New signups are temporarily disabled'), async (req, res) => {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await User.hashPassword(password)
    const user = await User.create({ name, email, passwordHash })

    const freePlan = await getFreePlan()
    await Subscription.create({ user: user._id, plan: freePlan._id, status: 'active', provider: 'none' })

    res.status(201).json({ user, token: signToken(user) })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create account', detail: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to log in', detail: err.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

export default router
