import { getAIProvider } from './index.js'
import { getUnderstandingAngle } from './understandingAngles.js'

const SYSTEM_PROMPT = `You are the product-understanding engine inside Sneaky Peek. Your job is to read everything a creator has told us about their product — plus any raw material they've supplied — and distill it into structured knowledge that a separate copywriting step will later use to build a pre-purchase experience.

Be specific and concrete. Never invent facts, statistics, testimonials, or claims that aren't supported by what you were given. If the material is thin, say less rather than making things up — shorter, honest arrays are better than padded, generic ones.`

const STRING_FIELDS = ['productSummary', 'audienceSummary', 'coreProblem', 'corePromise']
const ARRAY_FIELDS = ['keyBenefits', 'keyInsights', 'importantTopics', 'strongestHooks', 'objections', 'curiosityOpportunities']

function buildPrompt({ experience, materialsText, angle }) {
  const facts = [
    `Title: ${experience.title}`,
    `Product type: ${experience.productType}`,
    experience.description && `Short description: ${experience.description}`,
    experience.longDescription && `Long description: ${experience.longDescription}`,
    experience.authorName && `Creator/author/brand: ${experience.authorName}`,
    experience.targetAudience && `Stated target audience: ${experience.targetAudience}`,
    experience.promise && `Stated promise: ${experience.promise}`,
    experience.keyBenefits?.length && `Stated key benefits: ${experience.keyBenefits.join('; ')}`,
    experience.topics?.length && `Stated topics: ${experience.topics.join('; ')}`,
    experience.ctaText && `Existing CTA text: ${experience.ctaText}`,
  ]
    .filter(Boolean)
    .join('\n')

  const materialsBlock = materialsText
    ? `\n\nSupplied material (extracted from the creator's uploads/links/pasted content):\n"""\n${materialsText}\n"""`
    : '\n\nNo additional material was supplied — work from the fields above only.'

  return `${facts}${materialsBlock}

${angle}

Return JSON in exactly this shape:
{
  "productSummary": "2-3 sentence summary of what this product actually is",
  "audienceSummary": "who this is genuinely for, 1-2 sentences",
  "coreProblem": "the specific problem or itch this addresses, 1 sentence",
  "corePromise": "what it concretely delivers, 1 sentence",
  "keyBenefits": ["short benefit", "..."],
  "keyInsights": ["a genuinely interesting, specific insight drawn from the material", "..."],
  "importantTopics": ["topic", "..."],
  "strongestHooks": ["a candidate opening line/hook", "..."],
  "objections": ["a real objection a buyer might have", "..."],
  "curiosityOpportunities": ["a specific gap or question this material could open", "..."],
  "recommendedSections": [{ "type": "section_type", "guidance": "what this section should cover for this specific product" }]
}`
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
}

/**
 * Validates and normalizes the AI's raw response into a shape safe to save
 * directly onto Experience.productUnderstanding. Never throws on a partial
 * or slightly malformed response — missing fields default to '' / [] rather
 * than failing the whole analysis, since a partial understanding is still
 * useful. Only throws if the response isn't an object at all.
 */
export function validateUnderstanding(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response was not a JSON object')
  }

  const result = {}
  for (const field of STRING_FIELDS) {
    result[field] = typeof parsed[field] === 'string' ? parsed[field].trim() : ''
  }
  for (const field of ARRAY_FIELDS) {
    result[field] = coerceStringArray(parsed[field])
  }

  result.recommendedSections = Array.isArray(parsed.recommendedSections)
    ? parsed.recommendedSections
        .filter((s) => s && typeof s.guidance === 'string' && s.guidance.trim())
        .map((s) => ({
          type: typeof s.type === 'string' ? s.type : 'other',
          guidance: s.guidance.trim(),
        }))
    : []

  return result
}

/**
 * Analyzes a product from its own fields plus any ready materials' extracted
 * text. `materialsText` should already be concatenated/truncated by the
 * caller — this function doesn't know about the Material model at all,
 * keeping ingestion and understanding cleanly separate.
 */
export async function analyzeProduct({ experience, materialsText }) {
  const provider = getAIProvider()
  const angle = getUnderstandingAngle(experience.productType)

  const parsed = await provider.completeJSON({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt({ experience, materialsText, angle }),
    maxTokens: 2000,
  })

  return validateUnderstanding(parsed)
}
