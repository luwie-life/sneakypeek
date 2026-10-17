import 'dotenv/config'
import { validateEnv } from './config/env.js'
import { connectDB } from './config/db.js'
import { ensurePlansSeeded } from './services/billing/seedPlans.js'
import { startReconcileJob } from './services/billing/reconcile.js'
import { createApp } from './app.js'

const { errors, warnings } = validateEnv()
for (const w of warnings) console.warn(`[config] ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`[config] ${e}`)
  process.exit(1)
}

const PORT = process.env.PORT || 5000

connectDB()
  .then(ensurePlansSeeded)
  .then(() => {
    const app = createApp()
    app.listen(PORT, () => console.log(`Sneaky Peek API listening on port ${PORT}`))
    startReconcileJob()
  })
