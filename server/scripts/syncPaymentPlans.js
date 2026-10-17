// Usage: npm run billing:sync-plans [-- --dry-run]
// Requires MONGODB_URI and FLW_SECRET_KEY (test or live keys) in server/.env.
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import { ensurePlansSeeded } from '../services/billing/seedPlans.js'
import { getBillingProvider } from '../services/billing/index.js'
import { syncPaymentPlans } from '../services/billing/syncPlans.js'

const dryRun = process.argv.includes('--dry-run')

try {
  await connectDB()
  await ensurePlansSeeded()
  const provider = getBillingProvider()
  if (provider.name !== 'flutterwave') throw new Error('Set BILLING_PROVIDER=flutterwave to create real payment plans')
  const results = await syncPaymentPlans({ provider, dryRun })
  console.table(results)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
