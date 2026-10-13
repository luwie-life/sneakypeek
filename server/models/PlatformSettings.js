import mongoose from 'mongoose'

/**
 * A deliberately small, fixed set of operational toggles — not a place to
 * accumulate speculative flags. Environment variables remain the right
 * place for secrets/config that should never be admin-editable; this is
 * only for things an admin should be able to flip at runtime.
 */
const platformSettingsSchema = new mongoose.Schema({
  platformName: { type: String, default: 'Sneaky Peek' },
  maintenanceMode: { type: Boolean, default: false },
  signupsEnabled: { type: Boolean, default: true },
  aiGenerationEnabled: { type: Boolean, default: true },
  productUnderstandingEnabled: { type: Boolean, default: true },
  publicExperiencesEnabled: { type: Boolean, default: true },
})

export default mongoose.model('PlatformSettings', platformSettingsSchema)
