import { getAIProvider } from './index.js'
import { getUnderstandingAngle } from './understandingAngles.js'

const SYSTEM_PROMPT = `You are the product-understanding engine inside Sneaky Peek. Your job is to read everything a creator has told us about their product — plus any raw material they've supplied — and distill it into structured knowledge that a separate copywriting step will later use to build a pre-purchase experience.

Be specific and concrete. Never invent facts, statistics, testimonials, credentials, guarantees, or claims that aren't supported by what you were given. If the material is thin, say less rather than making things up — shorter, honest arrays are better than padded, generic ones. When a buyer would reasonably want a fact you were not given (length, format, what's included, who made it), list it under missingInformation instead of guessing.`

const STRING_FIELDS = ['productSummary', 'audienceSummary', 'coreProblem', 'corePromise']
const ARRAY_FIELDS = [
  'whatItContains',
  'keyBenefits',
  'keyInsights',
  'importantTopics',
  'differentiators',
  'strongestHooks',
  'objections',
  'customerQuestions',
  'curiosityOpportunities',
  'demonstrationIdeas',
  'missingInformation',
]

const stringArray = (description) => ({ type: 'array', items: { type: 'string' }, description })

const UNDERSTANDING_SCHEMA = {
  type: 'object',
  properties: {
    productSummary: { type: 'string', description: '2-3 sentences: what this product actually is' },
    audienceSummary: { type: 'string', description: 'Who it is genuinely for' },
    coreProblem: { type: 'string', description: 'The specific problem it addresses' },
    corePromise: { type: 'string', description: 'What it concretely delivers (the customer outcome)' },
    whatItContains: stringArray('What the product contains — only what the material supports'),
    keyBenefits: stringArray('Strongest benefits'),
    keyInsights: stringArray('Specific, interesting insights drawn from the material'),
    importantTopics: stringArray('Topics covered'),
    differentiators: stringArray('What makes it different from alternatives, if supported'),
    strongestHooks: stringArray('Candidate opening lines'),
    objections: stringArray('Real purchase objections'),
    customerQuestions: stringArray('Questions a potential customer would ask'),
    curiosityOpportunities: stringArray('Gaps/questions the preview can open'),
    demonstrationIdeas: stringArray('The best ways to let a visitor experience the value before buying'),
    missingInformation: stringArray('Facts the creator must provide that the material does not state'),
    recommendedSections: {
      type: 'array',
      items: { type: 'object', properties: { type: { type: 'string' }, guidance: { type: 'string' } }, required: ['guidance'] },
    },
  },
  required: ['productSummary', 'corePromise'],
}

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
  "whatItContains": ["what is actually inside the product", "..."],
  "keyBenefits": ["short benefit", "..."],
  "keyInsights": ["a genuinely interesting, specific insight drawn from the material", "..."],
  "importantTopics": ["topic", "..."],
  "differentiators": ["what makes it different, if supported", "..."],
  "strongestHooks": ["a candidate opening line/hook", "..."],
  "objections": ["a real objection a buyer might have", "..."],
  "customerQuestions": ["a question a potential customer would ask", "..."],
  "curiosityOpportunities": ["a specific gap or question this material could open", "..."],
  "demonstrationIdeas": ["how a preview could let a visitor experience the value", "..."],
  "missingInformation": ["a fact the creator should provide", "..."],
  "recommendedSections": [{ "type": "section_type", "guidance": "what this section should cover for this specific product" }]
}`
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim().slice(0, 400))
    .slice(0, 12)
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
    result[field] = typeof parsed[field] === 'string' ? parsed[field].trim().slice(0, 1500) : ''
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

  const parsed = await provider.completeStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt({ experience, materialsText, angle }),
    schema: UNDERSTANDING_SCHEMA,
    schemaName: 'product_understanding',
    maxTokens: 2500,
  })

  return validateUnderstanding(parsed)
}
