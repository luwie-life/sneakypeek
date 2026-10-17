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

    // Renewal-failure tracking. Set when a renewal charge fails; cleared
    // by the next successful charge. Access continues until
    // currentPeriodEnd + GRACE (see billing/lifecycle.js), then expires.
    pastDueSince: { type: Date, default: null },
    failedRenewalAttempts: { type: Number, default: 0 },
    lastPaymentAt: { type: Date, default: null },
    lastPaymentError: { type: String, default: null },
    // Plan the remote (Flutterwave) subscription is attached to — used to
    // attribute renewal charges and cancel the right remote record.
    providerPlanId: { type: String, default: null },

    // Append-only audit trail of status transitions (capped — see
    // billing/lifecycle.js recordTransition).
    history: {
      type: [
        {
          at: { type: Date, default: Date.now },
          from: String,
          to: String,
          plan: String,
          reason: String,
          ref: String,
          _id: false,
        },
      ],
      default: [],
    },
  },
  // optimisticConcurrency: concurrent saves of the same subscription (a
  // webhook racing /verify or /cancel) fail with a VersionError instead of
  // silently overwriting each other; lifecycle.js retries on reload.
  { timestamps: true, optimisticConcurrency: true }
)

export default mongoose.model('Subscription', subscriptionSchema)
