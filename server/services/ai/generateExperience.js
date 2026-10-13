import { getAIProvider } from './index.js'
import { getSectionFlow } from './templates.js'

const SYSTEM_PROMPT = `You are the writing engine inside Sneaky Peek, a product that turns a creator's product into a short, editorial pre-purchase experience shown to potential customers before they check out.

Write copy that is specific to the actual product described — never generic filler. Keep every section short (1-4 sentences). Do not invent facts, statistics, testimonials, or quotes that were not given to you. Never write a "chapter preview" or "audio preview" that reproduces real copyrighted text — describe or evoke it instead. Match the tone to the product type: editorial for books, instructional for courses, practical for templates, cinematic for audio.`

function buildPrompt({ title, productType, description, targetAudience, promise, hook, understanding }, flow) {
  const sectionList = flow
    .map((s, i) => `${i + 1}. type: "${s.type}" — ${s.guidance}`)
    .join('\n')

  const understandingBlock = understanding
    ? `\n\nDeeper product understanding, already analyzed from the creator's material — use this to make sections specific rather than generic:
- Core problem: ${understanding.coreProblem || 'n/a'}
- Core promise: ${understanding.corePromise || 'n/a'}
- Key insights: ${understanding.keyInsights?.join('; ') || 'none'}
- Strongest hook candidates: ${understanding.strongestHooks?.join('; ') || 'none'}
- Curiosity opportunities: ${understanding.curiosityOpportunities?.join('; ') || 'none'}
- Likely objections to address: ${understanding.objections?.join('; ') || 'none'}`
    : ''

  return `Product details:
- Title: ${title}
- Product type: ${productType}
- Description: ${description || 'Not provided'}
- Target audience: ${targetAudience || 'Not provided'}
- Product promise: ${promise || 'Not provided'}
- Existing hook (reuse or improve if present): ${hook || 'Not provided'}${understandingBlock}

Generate a Sneaky Peek experience with exactly these sections, in this order:
${sectionList}

Return JSON in exactly this shape:
{
  "hook": "a one-line hook for the top of the page (reuse the existing hook improved, or write one)",
  "sections": [
    { "type": "section_type_from_list_above", "heading": "short heading", "body": "1-4 sentence body" }
  ]
}`
}

function validateGenerated(parsed, flow) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response was not a JSON object')
  }
  if (typeof parsed.hook !== 'string') {
    throw new Error('AI response is missing a "hook" string')
  }
  if (!Array.isArray(parsed.sections)) {
    throw new Error('AI response is missing a "sections" array')
  }

  const validTypes = new Set(flow.map((s) => s.type))
  const sections = parsed.sections
    .filter((s) => s && typeof s.body === 'string' && s.body.trim())
    .map((s) => ({
      type: validTypes.has(s.type) ? s.type : 'other',
      heading: typeof s.heading === 'string' ? s.heading : '',
      body: s.body.trim(),
    }))

  if (sections.length === 0) {
    throw new Error('AI response contained no usable sections')
  }

  return { hook: parsed.hook.trim(), sections }
}

/**
 * Generates a full structured experience (hook + ordered sections) for the
 * given product info, tailored to its product type.
 */
export async function generateExperience(productInfo) {
  const flow = getSectionFlow(productInfo.productType)
  const provider = getAIProvider()

  const parsed = await provider.completeJSON({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(productInfo, flow),
    maxTokens: 2000,
  })

  return validateGenerated(parsed, flow)
}

export { SYSTEM_PROMPT }
