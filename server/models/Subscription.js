import mongoose from 'mongoose'

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
]

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one current subscription per user
      index: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },

    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active' },

    // 'none' for the Free plan, which never touches a payment gateway
    provider: { type: String, enum: ['none', 'flutterwave', 'mock'], default: 'none' },
    providerCustomerId: { type: String, default: null }, // email, for Flutterwave
    providerSubscriptionId: { type: String, default: null },

    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },

    trialEnd: { type: Date, default: null },
    // Prevents re-triggering a free trial after it has expired or been canceled once
    trialUsed: { type: Boolean, default: false },
    // Prevents firing trial_expiring more than once per trial
    trialExpiringNotified: { type: Boolean, default: false },

    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },

    // Admin-granted complimentary access (creator/UGC program, beta, etc.).
    // Deliberately NOT a separate access tier — it just assigns an existing
    // Plan to this subscription, so every normal entitlement/AI-usage check
    // applies unchanged. "Complimentary" only means provider stays 'none'
    // (no Flutterwave involvement) and it expires back to Free on its own.
    isComplimentary: { type: Boolean, default: false },
    grantReason: {
      type: String,
      enum: ['none', 'ugc', 'creator_partner', 'beta', 'promotion', 'support'],
      default: 'none',
    },
    grantNote: { type: String, default: '', trim: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    grantExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Subscription', subscriptionSchema)
