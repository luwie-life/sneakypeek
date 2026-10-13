import mongoose from 'mongoose'

export const MATERIAL_TYPES = [
  'text',
  'pasted',
  'existing_description',
  'url',
  'pdf',
  'image',
  'audio',
  'video',
]

export const MATERIAL_STATUSES = ['pending', 'processing', 'ready', 'failed']

const materialSchema = new mongoose.Schema(
  {
    experience: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Experience',
      required: true,
      index: true,
    },
    // Denormalized owner ID so ownership checks never require a join back
    // through Experience — every material query can filter by user directly.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: MATERIAL_TYPES, required: true },
    name: { type: String, trim: true, default: '' },

    // For 'url': the URL itself. For 'pdf'/'image'/'audio'/'video': the
    // storage key returned by services/materials/storage.js — never a
    // filesystem path taken directly from user input.
    source: { type: String, trim: true, default: '' },

    // Raw pasted/typed content, for text-based types.
    content: { type: String, default: '' },

    status: { type: String, enum: MATERIAL_STATUSES, default: 'pending' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    extractedText: { type: String, default: '' },
    processingError: { type: String, default: null },
  },
  { timestamps: true }
)

materialSchema.index({ experience: 1, createdAt: -1 })

export default mongoose.model('ProductMaterial', materialSchema)
