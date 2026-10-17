import { getAIProvider } from './index.js'
import { getSectionFlow } from './templates.js'
import { normalizeSection, sectionHasContent, SECTION_TYPES } from '../experience/sections.js'

const SYSTEM_PROMPT = `You are the experience designer inside Sneaky Peek. Sneaky Peek turns a creator's product into a short, interactive pre-purchase preview: visitors experience real value first, then decide to buy.

Principles:
- Specific to THIS product. No generic filler, no hype words ("revolutionary", "game-changing", "unlock").
- Show, don't claim: a real excerpt, a usable mini-lesson, a filled-in sample, actual specs.
- Ground every factual claim in the facts and material provided. Never invent testimonials, reviews, ratings, sales numbers, credentials, guarantees, refund policies, page counts, durations, prices or contents. If a section needs a fact you don't have, leave it out and list it in "needsCreatorInput".
- Excerpts must be copied verbatim from the supplied material — never paraphrased or written by you. If no material text is supplied, omit excerpt sections.
- Short, scannable sections (1-4 sentences of body unless the type says otherwise). Editorial, confident, warm.
- Match tone to product type: literary for books, instructional for courses and guides, practical for templates, sensory for physical products.`

// JSON schema for the structured output. Kept permissive on `data` (its
// shape depends on `type`) — the server-side normalizer is authoritative.
const EXPERIENCE_SCHEMA = {
  type: 'object',
  properties: {
    hook: { type: 'string', description: 'One-line hook for the top of the page' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          heading: { type: 'string' },
          body: { type: 'string' },
          data: { type: 'object' },
        },
        required: ['type'],
      },
    },
    needsCreatorInput: { type: 'array', items: { type: 'string' }, description: 'Facts the creator should add to strengthen or verify the preview' },
  },
  required: ['hook', 'sections'],
}

const DATA_SHAPES = {
  text: '',
  excerpt: ', "data": { "source": "e.g. From Chapter 2" }  (body = 120-400 words copied verbatim from the material)',
  list: ', "data": { "items": ["short item", "..."] }  (body = optional one-line intro)',
  steps: ', "data": { "steps": [{ "title": "step name", "body": "one sentence" }] }',
  quiz: ', "data": { "questions": [{ "question": "...", "options": ["a","b","c"], "answerIndex": 0, "explanation": "why" }] }',
  exercise: ', "data": { "prompt": "the question the visitor answers", "placeholder": "example start of an answer" }  (body = short instructions)',
  pairs: ', "data": { "pairs": [{ "label": "...", "value": "..." }] }',
  faq: ', "data": { "items": [{ "question": "...", "answer": "..." }] }',
  cta: ', "data": { "buttonText": "2-4 word button label" }',
}

function shapeFor(type) {
  return DATA_SHAPES[SECTION_TYPES[type]?.kind] ?? ''
}

function understandingBlock(u) {
  if (!u) return ''
  const list = (arr) => (arr?.length ? arr.join('; ') : 'none')
  return `

Product understanding (already analyzed from the creator's material):
- Summary: ${u.productSummary || 'n/a'}
- Audience: ${u.audienceSummary || 'n/a'}
- Core problem: ${u.coreProblem || 'n/a'}
- Core promise: ${u.corePromise || 'n/a'}
- What it contains: ${list(u.whatItContains)}
- Key benefits: ${list(u.keyBenefits)}
- Key insights: ${list(u.keyInsights)}
- Differentiators: ${list(u.differentiators)}
- Strongest hooks: ${list(u.strongestHooks)}
- Likely objections: ${list(u.objections)}
- Customer questions: ${list(u.customerQuestions)}
- Best ways to demonstrate value: ${list(u.demonstrationIdeas)}
- Information the creator still needs to provide: ${list(u.missingInformation)}`
}

export function buildPrompt(productInfo, flow, materialsText) {
  const p = productInfo
  const sectionList = flow
    .map((s, i) => `${i + 1}. type: "${s.type}" — ${s.guidance}\n   shape: { "type": "${s.type}", "heading": "...", "body": "..."${shapeFor(s.type)} }`)
    .join('\n')

  const facts = [
    `Title: ${p.title}`,
    `Product type: ${p.productType}`,
    `Description: ${p.description || 'Not provided'}`,
    p.longDescription && `Long description: ${p.longDescription}`,
    p.authorName && `Creator/brand: ${p.authorName}`,
    `Target audience: ${p.targetAudience || 'Not provided'}`,
    `Promise: ${p.promise || 'Not provided'}`,
    p.keyBenefits?.length && `Stated benefits: ${p.keyBenefits.join('; ')}`,
    p.topics?.length && `Stated topics: ${p.topics.join('; ')}`,
    `Existing hook (improve if present): ${p.hook || 'Not provided'}`,
    p.ctaText && `Creator's CTA text: ${p.ctaText}`,
  ]
    .filter(Boolean)
    .join('\n')

  const material = materialsText
    ? `\n\nSupplied material (the creator's own product content — the ONLY allowed source for excerpts):\n"""\n${materialsText}\n"""`
    : '\n\nNo product material text was supplied — omit excerpt sections.'

  return `${facts}${understandingBlock(p.understanding)}${material}

Design the Sneaky Peek preview with these sections, in this order (omit a section entirely if the facts can't support it):
${sectionList}

Return an object: { "hook": "...", "sections": [ ...section objects in the shapes above... ], "needsCreatorInput": ["fact the creator should add", "..."] }`
}

// ---------- Grounding ----------

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when the excerpt actually comes from the creator's material: at
 * least 80% of its sentences (by characters) must appear verbatim (after
 * whitespace/punctuation normalization) in the supplied text.
 */
export function isExcerptGrounded(excerpt, materialsText) {
  const haystack = normalizeForMatch(materialsText)
  if (!haystack) return false
  const sentences = String(excerpt || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeForMatch)
    .filter((s) => s.length >= 20)
  if (!sentences.length) return false
  const total = sentences.reduce((n, s) => n + s.length, 0)
  const found = sentences.filter((s) => haystack.includes(s)).reduce((n, s) => n + s.length, 0)
  return found / total >= 0.8
}

/** Deterministic excerpt straight from the creator's material (never AI-written). */
export function pickExcerpt(materialsText, maxChars = 1600) {
  const text = String(materialsText || '').split('\n\n---\n\n')[0] || ''
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 80)
  let out = ''
  for (const p of paragraphs) {
    if (out.length + p.length > maxChars && out) break
    out += (out ? '\n\n' : '') + p
  }
  if (!out) {
    const flat = text.replace(/\s+/g, ' ').trim()
    if (flat.length < 200) return ''
    out = flat.slice(0, maxChars)
  }
  if (out.length > maxChars) out = out.slice(0, maxChars)
  // End on a sentence boundary when possible.
  const lastStop = Math.max(out.lastIndexOf('. '), out.lastIndexOf('? '), out.lastIndexOf('! '), out.endsWith('.') ? out.length - 1 : -1)
  return lastStop > maxChars * 0.5 ? out.slice(0, lastStop + 1) : out
}

// ---------- Validation ----------

export function validateGenerated(parsed, flow, materialsText) {
  if (!parsed || typeof parsed !== 'object') throw new Error('AI response was not a JSON object')
  if (!Array.isArray(parsed.sections)) throw new Error('AI response is missing a "sections" array')

  const allowed = new Set([...flow.map((s) => s.type), 'cta'])
  const notes = Array.isArray(parsed.needsCreatorInput)
    ? parsed.needsCreatorInput.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 200)).slice(0, 8)
    : []

  const sections = []
  for (const raw of parsed.sections) {
    if (!raw || typeof raw !== 'object') continue
    const section = normalizeSection({ ...raw, type: allowed.has(raw.type) ? raw.type : SECTION_TYPES[raw.type] ? raw.type : 'other', visibility: 'free' })
    if (SECTION_TYPES[section.type].kind === 'excerpt') {
      if (!isExcerptGrounded(section.body, materialsText)) {
        const real = pickExcerpt(materialsText)
        if (!real) continue // no material → no excerpt; never keep invented text
        section.body = real
        notes.push('The excerpt was taken directly from your material — choose the passage you most want to share.')
      }
    }
    if (!sectionHasContent(section)) continue
    sections.push(section)
  }

  if (sections.length === 0) throw new Error('AI response contained no usable sections')
  if (!sections.some((s) => s.type === 'cta')) {
    sections.push(normalizeSection({ type: 'cta', heading: 'Ready for the full version?', body: '', data: { buttonText: '' } }))
  }

  const hook = typeof parsed.hook === 'string' && parsed.hook.trim() ? parsed.hook.trim().slice(0, 300) : ''
  return { hook, sections, notes: [...new Set(notes)] }
}

/**
 * Generates a full structured experience (hook + ordered, typed sections)
 * tailored to the product type. Throws on provider failure — the route
 * decides whether to fall back (see buildFallbackExperience).
 */
export async function generateExperience(productInfo, { materialsText = '' } = {}) {
  const flow = getSectionFlow(productInfo.productType)
  const provider = getAIProvider()
  const boundedMaterial = String(materialsText || '').slice(0, 12000)

  const parsed = await provider.completeStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(productInfo, flow, boundedMaterial),
    schema: EXPERIENCE_SCHEMA,
    schemaName: 'experience',
    maxTokens: 4000,
  })

  const result = validateGenerated(parsed, flow, boundedMaterial)
  return { ...result, hook: result.hook || productInfo.hook || '' }
}

/**
 * Non-AI starter draft, built only from what the creator entered and their
 * own material. Used when the AI provider is unavailable so a creator is
 * never left with an empty editor. Never invents anything.
 */
export function buildFallbackExperience(p, { materialsText = '' } = {}) {
  const flow = getSectionFlow(p.productType)
  const firstSentence = (t) => (String(t || '').match(/^[^.!?]+[.!?]?/) || [''])[0].trim()
  const benefits = (p.keyBenefits || []).filter(Boolean)
  const topics = (p.topics || []).filter(Boolean)
  const hook = p.hook || firstSentence(p.description) || p.title

  const sections = []
  for (const step of flow) {
    const kind = SECTION_TYPES[step.type]?.kind
    let s = null
    if (step.type === 'hook') s = { type: 'hook', heading: p.title, body: hook }
    else if (['context', 'introduction', 'problem', 'preview'].includes(step.type) && (p.description || p.longDescription)) {
      s = { type: step.type, heading: step.type === 'problem' ? 'The problem' : `About ${p.title}`, body: p.longDescription || p.description }
    } else if (kind === 'excerpt') {
      const excerpt = pickExcerpt(materialsText)
      if (excerpt) s = { type: step.type, heading: 'Read a sample', body: excerpt, data: { source: '' } }
    } else if (kind === 'list' && (benefits.length || topics.length)) {
      const items = step.type === 'benefits' ? benefits : topics.length ? topics : benefits
      if (items.length) s = { type: step.type, heading: SECTION_TYPES[step.type].label, data: { items } }
    } else if (['result', 'course_promise'].includes(step.type) && p.promise) {
      s = { type: step.type, heading: 'What you get', body: p.promise }
    } else if (step.type === 'cta') {
      s = { type: 'cta', heading: `Get ${p.title}`, body: p.promise || '', data: { buttonText: p.ctaText || '' } }
    }
    if (s) {
      const n = normalizeSection(s)
      if (sectionHasContent(n)) sections.push(n)
    }
  }
  if (!sections.some((s) => s.type === 'cta')) sections.push(normalizeSection({ type: 'cta', heading: `Get ${p.title}`, data: {} }))

  return {
    hook,
    sections,
    notes: ['AI was unavailable, so this starter draft uses only the details you entered. Add sections or edit before publishing.'],
  }
}

export { SYSTEM_PROMPT }
