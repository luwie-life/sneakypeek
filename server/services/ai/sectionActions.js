import { getAIProvider } from './index.js'
import { getSectionFlow } from './templates.js'
import { SYSTEM_PROMPT } from './generateExperience.js'

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

  const prompt = `${instruction}

Current heading: ${section.heading || '(none)'}
Current body: ${section.body}

Return JSON in exactly this shape:
{ "heading": "updated or same heading", "body": "updated body text" }`

  const parsed = await provider.completeJSON({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 500,
  })

  if (typeof parsed?.body !== 'string' || !parsed.body.trim()) {
    throw new Error('AI response did not include usable body text')
  }

  return {
    heading: typeof parsed.heading === 'string' ? parsed.heading : section.heading,
    body: parsed.body.trim(),
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

  const target = candidates[0] || { type: 'other', guidance: 'A section that adds something new and useful.' }

  const prompt = `Product: ${productInfo?.title || 'Unknown'} (${productType})
Description: ${productInfo?.description || 'Not provided'}

Write one new section of type "${target.type}". Purpose: ${target.guidance}

Return JSON in exactly this shape:
{ "type": "${target.type}", "heading": "short heading", "body": "1-4 sentence body" }`

  const parsed = await provider.completeJSON({ system: SYSTEM_PROMPT, prompt, maxTokens: 400 })

  if (typeof parsed?.body !== 'string' || !parsed.body.trim()) {
    throw new Error('AI response did not include usable body text')
  }

  return {
    type: typeof parsed.type === 'string' ? parsed.type : target.type,
    heading: typeof parsed.heading === 'string' ? parsed.heading : '',
    body: parsed.body.trim(),
  }
}
