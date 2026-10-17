/**
 * Frontend mirror of server/services/experience/sections.js — labels and
 * data "kinds" for every section type. The server is the source of truth
 * and normalizes everything on save; this only drives editing and display.
 */
export const SECTION_TYPES = {
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
  excerpt: { label: 'Excerpt', kind: 'excerpt' },
  chapter_preview: { label: 'Chapter preview', kind: 'excerpt' },
  benefits: { label: 'Benefits', kind: 'list' },
  whats_included: { label: "What's included", kind: 'list' },
  what_they_will_learn: { label: "What you'll learn", kind: 'list' },
  checklist: { label: 'Checklist', kind: 'list' },
  tips: { label: 'Actionable tips', kind: 'list' },
  framework: { label: 'Framework', kind: 'steps' },
  mini_lesson: { label: 'Mini lesson', kind: 'steps' },
  quiz: { label: 'Quiz', kind: 'quiz' },
  exercise: { label: 'Exercise', kind: 'exercise' },
  template_preview: { label: 'Template sample', kind: 'pairs' },
  specs: { label: 'Specifications', kind: 'pairs' },
  faq: { label: 'Questions & answers', kind: 'faq' },
  gallery: { label: 'Gallery', kind: 'gallery' },
  free_download: { label: 'Free sample', kind: 'download' },
  cta: { label: 'Call to action', kind: 'cta' },
  social_proof: { label: 'Why people choose it', kind: 'text' },
}

/** Types offered in the "Add section" menu (legacy types are omitted). */
export const ADDABLE_TYPES = [
  'hook', 'introduction', 'problem', 'insight', 'story', 'excerpt', 'benefits', 'whats_included',
  'what_they_will_learn', 'checklist', 'tips', 'framework', 'mini_lesson', 'quiz', 'exercise',
  'template_preview', 'specs', 'faq', 'gallery', 'free_download', 'curiosity_gap', 'cta',
]

export function kindOf(type) {
  return SECTION_TYPES[type]?.kind || 'text'
}

export function labelOf(type) {
  return SECTION_TYPES[type]?.label || 'Section'
}

export function emptyDataFor(type) {
  switch (kindOf(type)) {
    case 'list': return { items: [''] }
    case 'steps': return { steps: [{ title: '', body: '' }] }
    case 'quiz': return { questions: [{ question: '', options: ['', ''], answerIndex: 0, explanation: '' }] }
    case 'exercise': return { prompt: '', placeholder: '' }
    case 'pairs': return { pairs: [{ label: '', value: '' }] }
    case 'faq': return { items: [{ question: '', answer: '' }] }
    case 'gallery': return { assetIds: [] }
    case 'download': return { assetId: '' }
    case 'cta': return { buttonText: '' }
    case 'excerpt': return { source: '' }
    default: return undefined
  }
}

/** Mirrors the server rule: CTA always public; locked or after the stopping point → locked. */
export function isSectionPublic(section, index, previewSettings = {}) {
  if (section.type === 'cta') return true
  if (section.visibility === 'locked') return false
  const stop = previewSettings?.stopAfterSection
  if (Number.isInteger(stop) && stop >= 0 && index > stop) return false
  return true
}

export const PRODUCT_TYPE_LABEL = {
  book: 'Book', course: 'Course', guide: 'Guide', audio: 'Audio',
  template: 'Template', digital: 'Digital product', physical: 'Product', other: 'Experience',
}

export const DEFAULT_CTA_LABEL = {
  book: 'Get the book', course: 'Enroll now', guide: 'Get the guide', audio: 'Listen now',
  template: 'Get the template', digital: 'Get it now', physical: 'Get it now', other: 'Get it now',
}

export function formatBytes(n) {
  if (!n) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Client-side mirror of the server's "worth rendering" check (for previews). */
export function sectionHasContentClient(section) {
  const d = section.data || {}
  switch (kindOf(section.type)) {
    case 'list': return d.items?.some((x) => x && x.trim()) || Boolean(section.body)
    case 'steps': return d.steps?.some((x) => x.title || x.body) || Boolean(section.body)
    case 'quiz': return d.questions?.some((q) => q.question && q.options?.filter(Boolean).length >= 2)
    case 'exercise': return Boolean(d.prompt || section.body)
    case 'pairs': return d.pairs?.some((p) => p.label && p.value)
    case 'faq': return d.items?.some((q) => q.question && q.answer)
    case 'gallery': return d.images?.length > 0
    case 'download': return Boolean(d.asset)
    case 'cta': return true
    default: return Boolean(section.body || section.heading)
  }
}
