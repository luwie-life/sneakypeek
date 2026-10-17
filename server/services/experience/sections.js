import { customAlphabet } from 'nanoid'

/**
 * The single source of truth for what a preview section can be.
 *
 * Every section shares { id, type, heading, body, visibility } and an
 * optional type-specific `data` payload. One shared model, product-specific
 * section types: books get excerpts, courses get mini-lessons/quizzes/
 * exercises, templates get filled-in sample previews, physical products get
 * specs and galleries — all rendered by one renderer on the frontend
 * (src/components/experience/SectionRenderer.jsx).
 *
 * normalizeSection() is applied to BOTH AI output and creator edits before
 * anything is saved, so the database never holds a shape the renderer
 * can't handle, and no unbounded user payload reaches MongoDB.
 */

export const sectionId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

const LIMITS = {
  heading: 200,
  body: 3000,
  excerptBody: 12000,
  item: 300,
  shortText: 120,
  longText: 1000,
}

/** How each type's `data` is shaped. `kind` drives normalization. */
export const SECTION_TYPES = {
  // Plain editorial text blocks (heading + body)
  hook: { label: 'Hook', kind: 'text' },
  introduction: { label: 'Introduction', kind: 'text' },
  context: { label: 'Context', kind: 'text' },
  problem: { label: 'Problem', kind: 'text' },
  insight: { label: 'Insight', kind: 'text' },
  why_it_matters: { label: 'Why it matters', kind: 'text' },
  curiosity_gap: { label: 'Curiosity gap', kind: 'text' },
  result: { label: 'Result', kind: 'text' },
  course_promise: { label: 'Course promise', kind: 'text' },
  preview: { label: 'Preview', kind: 'text' },
  interactive_preview: { label: 'Preview in use', kind: 'text' },
  audio_preview: { label: 'Audio preview', kind: 'text' },
  story: { label: 'Story', kind: 'text' },
  other: { label: 'Section', kind: 'text' },

  // Long-form reading excerpt (books, guides). Body is the excerpt itself.
  excerpt: { label: 'Excerpt', kind: 'excerpt' },
  // Legacy name from the original book flow — still rendered as an excerpt.
  chapter_preview: { label: 'Chapter preview', kind: 'excerpt' },

  // Lists
  benefits: { label: 'Benefits', kind: 'list' },
  whats_included: { label: "What's included", kind: 'list' },
  what_they_will_learn: { label: "What you'll learn", kind: 'list' },
  checklist: { label: 'Checklist', kind: 'list' },
  tips: { label: 'Actionable tips', kind: 'list' },

  // Steps with titles (frameworks, mini-lessons)
  framework: { label: 'Framework', kind: 'steps' },
  mini_lesson: { label: 'Mini lesson', kind: 'steps' },

  // Interactive
  quiz: { label: 'Quiz', kind: 'quiz' },
  exercise: { label: 'Exercise', kind: 'exercise' },

  // Key/value pairs
  template_preview: { label: 'Template sample', kind: 'pairs' },
  specs: { label: 'Specifications', kind: 'pairs' },

  // Q&A — addresses objections. Never testimonials.
  faq: { label: 'Questions & answers', kind: 'faq' },

  // Asset-backed (deliverables marked free)
  gallery: { label: 'Gallery', kind: 'gallery' },
  free_download: { label: 'Free sample', kind: 'download' },

  // Purchase CTA — always public (it is the point of the page)
  cta: { label: 'Call to action', kind: 'cta' },

  // Legacy type from the original physical flow; kept renderable as text.
  social_proof: { label: 'Why people choose it', kind: 'text' },
}

export const SECTION_TYPE_KEYS = Object.keys(SECTION_TYPES)

function str(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, max)
}

function strList(value, maxItems, maxLen = LIMITS.item) {
  if (!Array.isArray(value)) return []
  return value.map((v) => str(v, maxLen)).filter(Boolean).slice(0, maxItems)
}

/** Accepts arrays of strings or arrays of { title, body } and normalizes to steps. */
function steps(value, maxItems = 8) {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => {
      if (typeof v === 'string') return { title: str(v, LIMITS.shortText), body: '' }
      if (v && typeof v === 'object') return { title: str(v.title, LIMITS.shortText), body: str(v.body, LIMITS.longText) }
      return null
    })
    .filter((v) => v && (v.title || v.body))
    .slice(0, maxItems)
}

function pairs(value, maxItems = 20) {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (v && typeof v === 'object' ? { label: str(v.label, LIMITS.shortText), value: str(v.value, LIMITS.longText) } : null))
    .filter((v) => v && v.label && v.value)
    .slice(0, maxItems)
}

function quizQuestions(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((q) => {
      if (!q || typeof q !== 'object') return null
      const options = strList(q.options, 5, 200)
      const question = str(q.question, 300)
      const answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : -1
      if (!question || options.length < 2) return null
      return {
        question,
        options,
        // -1 = no single right answer (reflection-style question)
        answerIndex: answerIndex >= 0 && answerIndex < options.length ? answerIndex : -1,
        explanation: str(q.explanation, 600),
      }
    })
    .filter(Boolean)
    .slice(0, 6)
}

function faqItems(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (v && typeof v === 'object' ? { question: str(v.question, 300), answer: str(v.answer, LIMITS.longText) } : null))
    .filter((v) => v && v.question && v.answer)
    .slice(0, 10)
}

const OBJECT_ID = /^[a-f0-9]{24}$/

function assetIds(value, maxItems = 8) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v) => typeof v === 'string' && OBJECT_ID.test(v)))].slice(0, maxItems)
}

function normalizeData(kind, data, body) {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  switch (kind) {
    case 'excerpt':
      return { source: str(d.source, LIMITS.shortText) }
    case 'list': {
      let items = strList(d.items, 20)
      // Back-compat: an older/AI section with only a bulleted body becomes a list.
      if (!items.length && body) {
        const lines = body.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
        if (lines.length > 1) items = lines.slice(0, 20).map((l) => l.slice(0, LIMITS.item))
      }
      return { items }
    }
    case 'steps':
      return { steps: steps(d.steps) }
    case 'quiz':
      return { questions: quizQuestions(d.questions) }
    case 'exercise':
      return { prompt: str(d.prompt, LIMITS.longText), placeholder: str(d.placeholder, LIMITS.shortText) }
    case 'pairs':
      return { pairs: pairs(d.pairs) }
    case 'faq':
      return { items: faqItems(d.items) }
    case 'gallery':
      return { assetIds: assetIds(d.assetIds) }
    case 'download':
      return { assetId: typeof d.assetId === 'string' && OBJECT_ID.test(d.assetId) ? d.assetId : '' }
    case 'cta':
      return { buttonText: str(d.buttonText, 60) }
    default:
      return undefined
  }
}

/** True when a section has enough content to be worth rendering. */
export function sectionHasContent(section) {
  const kind = SECTION_TYPES[section.type]?.kind || 'text'
  const d = section.data || {}
  switch (kind) {
    case 'list':
      return d.items?.length > 0 || Boolean(section.body)
    case 'steps':
      return d.steps?.length > 0 || Boolean(section.body)
    case 'quiz':
      return d.questions?.length > 0
    case 'exercise':
      return Boolean(d.prompt || section.body)
    case 'pairs':
      return d.pairs?.length > 0
    case 'faq':
      return d.items?.length > 0
    case 'gallery':
      return d.assetIds?.length > 0
    case 'download':
      return Boolean(d.assetId)
    case 'cta':
      return true
    default:
      return Boolean(section.body || section.heading)
  }
}

/**
 * Normalizes one section. Unknown types become 'other' (rendered as text)
 * rather than being rejected, so nothing a creator wrote is silently lost.
 */
export function normalizeSection(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const type = SECTION_TYPE_KEYS.includes(raw.type) ? raw.type : 'other'
  const kind = SECTION_TYPES[type].kind
  const body = str(raw.body, kind === 'excerpt' ? LIMITS.excerptBody : LIMITS.body)
  const section = {
    id: typeof raw.id === 'string' && /^[a-z0-9]{6,24}$/.test(raw.id) ? raw.id : sectionId(),
    type,
    heading: str(raw.heading, LIMITS.heading),
    body,
    // CTA sections are always public — gating the buy button defeats the page.
    visibility: type === 'cta' ? 'free' : raw.visibility === 'locked' ? 'locked' : 'free',
  }
  const data = normalizeData(kind, raw.data, body)
  if (data !== undefined) section.data = data
  return section
}

export const MAX_SECTIONS = 30

/** Validates a full sections array from a creator save. Throws on bad input. */
export function normalizeSections(sections) {
  if (!Array.isArray(sections)) throw new Error('sections must be an array')
  if (sections.length > MAX_SECTIONS) throw new Error(`An experience can have at most ${MAX_SECTIONS} sections`)
  const seen = new Set()
  return sections.map((s) => {
    const n = normalizeSection(s)
    // Duplicate ids (e.g. a duplicated section) get a fresh one.
    if (seen.has(n.id)) n.id = sectionId()
    seen.add(n.id)
    return n
  })
}

export function normalizePreviewSettings(input, sectionCount) {
  const raw = input && typeof input === 'object' ? input : {}
  let stop = raw.stopAfterSection
  if (stop === '' || stop === undefined) stop = null
  if (stop !== null) {
    stop = Number(stop)
    if (!Number.isInteger(stop) || stop < 0) throw new Error('stopAfterSection must be a non-negative integer or null')
    if (sectionCount !== undefined && stop >= sectionCount) stop = null // past the end = no stopping point
  }
  return {
    stopAfterSection: stop,
    lockedMessage: str(raw.lockedMessage, 300),
    showLockedHeadings: raw.showLockedHeadings !== false,
  }
}

/**
 * Only http(s) URLs may be used as a checkout destination. Anything else
 * (javascript:, data:, vbscript:...) is an XSS vector on the public page,
 * where the URL is rendered as a link visitors click.
 */
export function validateCheckoutUrl(value) {
  if (value === '' || value === null || value === undefined) return ''
  if (typeof value !== 'string' || value.length > 2000) throw new Error('checkoutUrl must be a URL under 2000 characters')
  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('checkoutUrl must be a valid URL (including https://)')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('checkoutUrl must start with http:// or https://')
  return parsed.toString()
}

/** Whether a section index is publicly visible under the creator's settings. */
export function isSectionPublic(section, index, previewSettings) {
  if (section.type === 'cta') return true
  if (section.visibility === 'locked') return false
  const stop = previewSettings?.stopAfterSection
  if (Number.isInteger(stop) && index > stop) return false
  return true
}
