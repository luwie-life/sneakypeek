import './utils/asyncErrors.js'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { securityHeaders, stripErrorDetailsInProduction } from './middleware/security.js'
import { maintenanceGuard } from './middleware/maintenance.js'
import authRoutes from './routes/auth.routes.js'
import experienceRoutes from './routes/experiences.routes.js'
import materialsRoutes from './routes/materials.routes.js'
import publicRoutes from './routes/public.routes.js'
import billingRoutes from './routes/billing.routes.js'
import adminRoutes from './routes/admin/index.js'
import { storefrontSettingsRouter, publicStorefrontRouter } from './routes/storefront.routes.js'

/**
 * Builds the Express app without connecting to a database or listening —
 * index.js does that for the real server; tests import createApp()
 * directly and run it against an in-memory MongoDB.
 */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // Behind a load balancer/reverse proxy set TRUST_PROXY (e.g. "1") so
  // req.ip — used by rate limiting — is the real client address.
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY
    app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v)
  }

  // CORS: the API uses bearer tokens (no cookies), so CORS is not the
  // primary defense, but in production only the app's own origin(s) may call it.
  const allowed = [process.env.APP_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map((o) => (o || '').trim().replace(/\/$/, ''))
    .filter(Boolean)
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || process.env.NODE_ENV !== 'production' || allowed.includes(origin)) return cb(null, true)
        cb(null, false)
      },
    })
  )

  app.use(securityHeaders)
  app.use(stripErrorDetailsInProduction)
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1
    res.status(db ? 200 : 503).json({ ok: db })
  })

  app.use(maintenanceGuard)

  app.use('/api/auth', authRoutes)
  app.use('/api/experiences', experienceRoutes)
  app.use('/api/experiences', materialsRoutes)
  app.use('/api/public/experiences', publicRoutes)
  app.use('/api/public/storefronts', publicStorefrontRouter)
  app.use('/api/storefront', storefrontSettingsRouter)
  app.use('/api/billing', billingRoutes)
  app.use('/api/admin', adminRoutes)

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

  // Centralized error handler — every thrown/rejected error in a route ends
  // up here (see utils/asyncErrors.js). Never leaks internals to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' })
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' })
    if (err?.name === 'CastError') return res.status(404).json({ error: 'Not found' })
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors || {})[0]?.message || 'Invalid input' })
    }
    console.error(err)
    res.status(500).json({ error: 'Something went wrong on our end' })
  })

  return app
}
