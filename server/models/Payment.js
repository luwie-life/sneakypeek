import mongoose from 'mongoose'

/**
 * Until now, a verified Flutterwave transaction only ever updated the
 * Subscription in place — no record of the individual payment itself was
 * ever kept. That makes an admin "payments" view impossible without this.
 * This model is purely a read history; it never drives entitlement logic
 * (Subscription remains the single source of truth for what a user can
 * currently do) and writing to it is best-effort/non-blocking — a failure
 * here must never prevent a verified payment from granting access.
 */
const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    provider: { type: String, enum: ['flutterwave', 'mock'], required: true },
    providerTransactionId: { type: String, default: null },
    txRef: { type: String, default: null, index: true },
    status: { type: String, enum: ['successful', 'failed', 'pending'], required: true },
  },
  { timestamps: true }
)

paymentSchema.index({ createdAt: -1 })

export default mongoose.model('Payment', paymentSchema)
