import { MATERIAL_TYPES } from '../../models/ProductMaterial.js'
import { extractText } from './extract.js'

export const MAX_PASTED_LENGTH = 20000
export const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Validates a material creation request before anything is written to the
 * database. Throws a plain Error with a message safe to show the user.
 */
export function validateMaterialInput({ type, content, url }) {
  if (!MATERIAL_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${MATERIAL_TYPES.join(', ')}`)
  }

  if (['text', 'pasted', 'existing_description'].includes(type)) {
    if (!content || !content.trim()) {
      throw new Error('content is required for this material type')
    }
    if (content.length > MAX_PASTED_LENGTH) {
      throw new Error(`content must be under ${MAX_PASTED_LENGTH} characters`)
    }
  }

  if (type === 'url') {
    if (!url) throw new Error('url is required for this material type')
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch {
      throw new Error('url must be a valid http(s) URL')
    }
  }
}

/**
 * Runs extraction for one material and persists the outcome. Never throws —
 * a processing failure is recorded on the material itself (status 'failed',
 * processingError set) rather than propagated, since a failed material
 * shouldn't take down the request that triggered it.
 */
export async function processMaterial(material) {
  material.status = 'processing'
  material.processingError = null
  await material.save()

  try {
    const text = await extractText(material)
    material.extractedText = text
    material.status = 'ready'
    material.processingError = null
  } catch (err) {
    material.status = 'failed'
    material.processingError = err.message.slice(0, 500)
  }

  await material.save()
  return material
}
