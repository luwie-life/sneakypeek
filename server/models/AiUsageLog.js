import mongoose from 'mongoose'

const aiUsageLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // What the AI call was for — lets admins see where cost goes.
  kind: { type: String, enum: ['analyze', 'generate', 'section_action', 'other'], default: 'other' },
  experience: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', default: null },
  // Free-plan one-time trial usage. Excluded from the monthly allowance
  // count (the trial is a separate lifetime allowance — see entitlements.js).
  trial: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

aiUsageLogSchema.index({ user: 1, createdAt: -1 })

export default mongoose.model('AiUsageLog', aiUsageLogSchema)
