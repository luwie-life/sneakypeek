import mongoose from 'mongoose'

/**
 * -1 on any numeric limit means "unlimited". Everywhere that checks a
 * limit must treat -1 as "always allowed" rather than comparing directly.
 */
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    monthlyPriceCents: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'usd' },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },

    // The ID of this plan's recurring Payment Plan on the billing gateway
    // (Flutterwave). Empty for the Free plan, which never touches a gateway.
    // Without one, checkout still works but as a one-off charge rather
    // than a gateway-managed recurring subscription — see flutterwaveProvider.js.
    providerPriceId: { type: String, default: '' },

    features: {
      aiStudio: { type: Boolean, default: true },
      analytics: { type: Boolean, default: true },
    },

    limits: {
      maxExperiences: { type: Number, default: 1 },
      aiGenerationsPerMonth: { type: Number, default: 5 },
      analyticsRetentionDays: { type: Number, default: 7 }, // -1 = all time
      maxTeamMembers: { type: Number, default: 1 },
      storageMB: { type: Number, default: 100 },
    },

    // Display order on the pricing page
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export default mongoose.model('Plan', planSchema)
