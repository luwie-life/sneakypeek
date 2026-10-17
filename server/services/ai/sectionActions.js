import { getAIProvider } from './index.js'
import { getSectionFlow } from './templates.js'
import { SYSTEM_PROMPT } from './generateExperience.js'
import { normalizeSection, sectionHasContent, SECTION_TYPES } from '../experience/sections.js'

const ACTION_SCHEMA = {
  type: 'object',
  properties: { heading: { type: 'string' }, body: { type: 'string' } },
  required: ['body'],
}

const TEXT_ACTION_INSTRUCTIONS = {
  rewrite: 'Rewrite this section with fresh wording. Keep the same meaning and length.',
  shorten: 'Make this section noticeably shorter and punchier without losing its point.',
  compelling: 'Rewrite this section to be more compelling and specific. Avoid generic hype words.',
  improve_cta: 'Rewrite this as a sharper, more confident call-to-action line.',
}

/**
 * Runs a text-transform action ("rewrite", "shorten", "compelling",
 * "improve_cta", or "tone" with a `tone` param) on a single section and
 * returns the updated { heading, body }.
 */
export async function runSectionAction({ action, section, tone }) {
  const provider = getAIProvider()

  let instruction
  if (action === 'tone') {
    if (!tone) throw new Error('A target tone is required for the "tone" action')
    instruction = `Rewrite this section in a ${tone} tone. Keep the same meaning and roughly the same length.`
  } else {
    instruction = TEXT_ACTION_INSTRUCTIONS[action]
  }

  if (!instruction) {
    throw new Error(`Unknown section action: "${action}"`)
  }
  if (SECTION_TYPES[section.type]?.kind === 'excerpt') {
    // Excerpts are the creator's own verbatim words — AI must not rewrite them.
    throw new Error('Excerpts are quoted from your own material and can only be edited by hand')
  }
  if (typeof tone === 'string' && tone.length > 40) throw new Error('Tone must be under 40 characters')
  if (!section.body && !section.heading) throw new Error('This section has no text to rewrite')

  const prompt = `${instruction}

Current heading: ${section.heading || '(none)'}
Current body: ${section.body || '(none)'}

Return JSON in exactly this shape:
{ "heading": "updated or same heading", "body": "updated body text" }`

  const parsed = await provider.completeStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: ACTION_SCHEMA,
    schemaName: 'section_action',
    maxTokens: 800,
  })

  if (typeof parsed?.body !== 'string' || !parsed.body.trim()) {
    throw new Error('AI response did not include usable body text')
  }

  // Structured data (quiz questions, list items...) is left untouched —
  // text actions only rewrite heading/body.
  return {
    heading: typeof parsed.heading === 'string' ? parsed.heading.trim().slice(0, 200) : section.heading,
    body: parsed.body.trim().slice(0, SECTION_TYPES[section.type]?.kind === 'excerpt' ? 12000 : 3000),
  }
}

/**
 * Asks the AI to suggest one new section appropriate for this product type
 * that isn't already present in the experience.
 */
export async function suggestNewSection({ productType, existingSections, productInfo }) {
  const provider = getAIProvider()
  const flow = getSectionFlow(productType)
  const usedTypes = new Set(existingSections.map((s) => s.type))
  const candidates = flow.filter((s) => !usedTypes.has(s.type))

  let target = candidates[0] || { type: 'other', guidance: 'A section that adds something new and useful.' }

  // Excerpts can't be suggested (they must come from the creator's material).
  if (SECTION_TYPES[target.type]?.kind === 'excerpt') target = { type: 'insight', guidance: 'One genuinely useful idea from the product.' }

  const prompt = `Title: ${productInfo?.title || 'Unknown'}
Product type: ${productType}
Description: ${productInfo?.description || 'Not provided'}

Write one new section of type "${target.type}". Purpose: ${target.guidance}
Only use facts stated above; never invent testimonials, numbers or guarantees.

Return an object: { "type": "${target.type}", "heading": "short heading", "body": "1-4 sentence body", "data": { ...type-specific fields if applicable } }`

  const parsed = await provider.completeStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: { type: 'object', properties: { type: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' }, data: { type: 'object' } }, required: ['type'] },
    schemaName: 'section',
    maxTokens: 800,
  })

  const section = normalizeSection({ ...parsed, type: target.type })
  if (!sectionHasContent(section)) throw new Error('AI response did not include a usable section')
  return section
}
