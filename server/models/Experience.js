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

// A section is a typed block in the preview journey. `heading`/`body`
// remain the universal fields (so every pre-existing section keeps
// rendering); `data` carries the type-specific structure (quiz questions,
// checklist items, specs, framework steps...). Its shape is validated and
// normalized by services/experience/sections.js before it is ever saved —
// Mixed here only because the shape varies by `type`.
const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    type: { type: String, trim: true, default: 'other' },
    heading: { type: String, trim: true },
    body: { type: String, trim: true },
    // 'free' sections are revealed publicly; 'locked' sections are withheld
    // from the public API entirely (only a teaser placeholder is sent).
    visibility: { type: String, enum: ['free', 'locked'], default: 'free' },
    data: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
)

const previewSettingsSchema = new mongoose.Schema(
  {
    // Index of the last section shown for free. null = no stopping point
    // (only per-section visibility applies). Everything after it is
    // withheld server-side exactly like a 'locked' section.
    stopAfterSection: { type: Number, default: null, min: 0 },
    // Shown at the stopping point / in place of locked sections.
    lockedMessage: { type: String, trim: true, default: '' },
    // When true, locked sections are listed by heading (to build curiosity)
    // without their content. When false, they are omitted entirely.
    showLockedHeadings: { type: Boolean, default: true },
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
    whatItContains: { type: [String], default: [] },
    keyBenefits: { type: [String], default: [] },
    keyInsights: { type: [String], default: [] },
    importantTopics: { type: [String], default: [] },
    differentiators: { type: [String], default: [] },
    strongestHooks: { type: [String], default: [] },
    objections: { type: [String], default: [] },
    customerQuestions: { type: [String], default: [] },
    curiosityOpportunities: { type: [String], default: [] },
    demonstrationIdeas: { type: [String], default: [] },
    // Facts the AI could not ground in the creator's material — shown to
    // the creator as "add this" prompts rather than being invented.
    missingInformation: { type: [String], default: [] },
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
    previewSettings: { type: previewSettingsSchema, default: () => ({}) },
    // Deliverable (ProductMaterial role:'deliverable', access:'free', image)
    // used as the cover on the public page and the storefront card.
    coverAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaterial', default: null },
    // Listed on the creator's storefront when published (default on).
    showOnStorefront: { type: Boolean, default: true },
    // 'ai' | 'fallback' | 'manual' — how the current sections were produced.
    generationSource: { type: String, enum: ['ai', 'fallback', 'manual', ''], default: '' },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    slug: { type: String, required: true, unique: true, index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

experienceSchema.index({ owner: 1, status: 1, publishedAt: -1 })

export default mongoose.model('Experience', experienceSchema)
