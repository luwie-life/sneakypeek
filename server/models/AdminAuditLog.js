import mongoose from 'mongoose'

const adminAuditLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, index: true }, // e.g. 'plan_updated', 'user_role_changed'
  targetType: { type: String, required: true }, // e.g. 'Plan', 'User', 'PlatformSettings'
  targetId: { type: String, default: null },
  // Small, structured, human-readable diffs only — never secrets, tokens,
  // password hashes, or raw payment credentials.
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
})

adminAuditLogSchema.index({ createdAt: -1 })

export default mongoose.model('AdminAuditLog', adminAuditLogSchema)
