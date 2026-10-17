import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    disabled: { type: Boolean, default: false },
    // Updated best-effort on authenticated requests — the only real signal
    // we have for "active user" admin metrics; never faked.
    lastActiveAt: { type: Date, default: null },

    // Public creator storefront (/s/:slug). Everything here is creator-
    // chosen, public-by-design content — the public API only ever reads
    // these fields (never name/email) so nothing private leaks.
    storefront: {
      slug: { type: String, trim: true, lowercase: true, default: undefined },
      displayName: { type: String, trim: true, default: '' },
      headline: { type: String, trim: true, default: '' },
      bio: { type: String, trim: true, default: '' },
      accentColor: { type: String, trim: true, default: '' },
      links: {
        type: [{ label: { type: String, trim: true }, url: { type: String, trim: true }, _id: false }],
        default: [],
      },
      published: { type: Boolean, default: false },
    },

    // The Free plan's one-time AI trial: one product analysis + one
    // experience generation, for a single experience. Lifetime, not monthly.
    aiTrial: {
      experience: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', default: null },
      analyzeUsedAt: { type: Date, default: null },
      generateUsedAt: { type: Date, default: null },
    },

    // Serializes AI calls per user so parallel requests can't both pass the
    // usage check before either is logged (the classic check-then-act race).
    aiLockUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

// Storefront slugs are unique when set; users without a storefront have no
// slug at all, so a partial index (not sparse — `undefined` subdocument
// paths can still be materialized) keeps them out of the constraint.
userSchema.index(
  { 'storefront.slug': 1 },
  { unique: true, partialFilterExpression: { 'storefront.slug': { $type: 'string' } } }
)

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash)
}

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10)
}

// Never leak the hash to API responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    delete ret.aiLockUntil
    return ret
  },
})

export default mongoose.model('User', userSchema)
