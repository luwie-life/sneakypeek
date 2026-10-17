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
    // 'initial' = first charge from our checkout; 'renewal' = a charge
    // Flutterwave made automatically against the payment plan.
    kind: { type: String, enum: ['initial', 'renewal'], default: 'initial' },
    failureReason: { type: String, default: null },
    // Set once the transaction's effect has been applied to the
    // Subscription. A Payment with appliedAt=null after a crash is retried
    // by the next webhook delivery / verify call (see billing/lifecycle.js).
    appliedAt: { type: Date, default: null },
    // Short claim lock so two concurrent deliveries can't both apply.
    processingUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

paymentSchema.index({ createdAt: -1 })
// Idempotency: a gateway transaction is recorded (and applied) at most
// once, no matter how many times the webhook is delivered or /verify is
// called. Partial so legacy rows without an ID don't collide.
paymentSchema.index(
  { provider: 1, providerTransactionId: 1 },
  { unique: true, partialFilterExpression: { providerTransactionId: { $type: 'string' } } }
)

export default mongoose.model('Payment', paymentSchema)
