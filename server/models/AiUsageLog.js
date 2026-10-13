import mongoose from 'mongoose'

const aiUsageLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
})

aiUsageLogSchema.index({ user: 1, createdAt: -1 })

export default mongoose.model('AiUsageLog', aiUsageLogSchema)
