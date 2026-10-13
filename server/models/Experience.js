import mongoose from 'mongoose'

export const PRODUCT_TYPES = [
  'book',
  'course',
  'guide',
  'audio',
  'template',
  'digital',
  'physical',
  'other',
]

const sectionSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, default: 'other' },
    heading: { type: String, trim: true },
    body: { type: String, trim: true },
  },
  { _id: false }
)

const recommendedSectionSchema = new mongoose.Schema(
  { type: { type: String, trim: true }, guidance: { type: String, trim: true } },
  { _id: false }
)

// The AI's structured read of the product, produced by
// services/ai/productUnderstanding.js from the creator's fields + materials.
// Embedded (not its own collection) since it's a 1:1 summary of one experience.
const productUnderstandingSchema = new mongoose.Schema(
  {
    productSummary: { type: String, trim: true, default: '' },
    audienceSummary: { type: String, trim: true, default: '' },
    coreProblem: { type: String, trim: true, default: '' },
    corePromise: { type: String, trim: true, default: '' },
    keyBenefits: { type: [String], default: [] },
    keyInsights: { type: [String], default: [] },
    importantTopics: { type: [String], default: [] },
    strongestHooks: { type: [String], default: [] },
    objections: { type: [String], default: [] },
    curiosityOpportunities: { type: [String], default: [] },
    recommendedSections: { type: [recommendedSectionSchema], default: [] },
    generatedAt: { type: Date, default: null },
  },
  { _id: false }
)

const experienceSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    productType: {
      type: String,
      enum: PRODUCT_TYPES,
      default: 'other',
    },
    hook: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    longDescription: { type: String, trim: true, default: '' },
    authorName: { type: String, trim: true, default: '' },
    targetAudience: { type: String, trim: true, default: '' },
    promise: { type: String, trim: true, default: '' },
    keyBenefits: { type: [String], default: [] },
    topics: { type: [String], default: [] },
    ctaText: { type: String, trim: true, default: '' },
    sections: { type: [sectionSchema], default: [] },
    checkoutUrl: { type: String, trim: true, default: '' },
    productUnderstanding: { type: productUnderstandingSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    slug: { type: String, required: true, unique: true, index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Experience', experienceSchema)
