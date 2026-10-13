import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { ensurePlansSeeded } from './services/billing/seedPlans.js'
import authRoutes from './routes/auth.routes.js'
import experienceRoutes from './routes/experiences.routes.js'
import materialsRoutes from './routes/materials.routes.js'
import publicRoutes from './routes/public.routes.js'
import billingRoutes from './routes/billing.routes.js'
import adminRoutes from './routes/admin/index.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/experiences', experienceRoutes)
app.use('/api/experiences', materialsRoutes)
app.use('/api/public/experiences', publicRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/admin', adminRoutes)

// Centralized error handler (catches anything thrown/rejected in routes above)
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our end' })
})

const PORT = process.env.PORT || 5000

connectDB()
  .then(ensurePlansSeeded)
  .then(() => {
    app.listen(PORT, () => console.log(`Sneaky Peek API listening on port ${PORT}`))
  })
