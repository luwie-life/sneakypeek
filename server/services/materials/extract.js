import { PDFParse } from 'pdf-parse'
import { getStorageProvider } from './storage.js'
import { safeFetchText } from './safeFetch.js'

const MAX_EXTRACTED_LENGTH = 50000 // keeps prompts and documents bounded regardless of source size

/** Strips control characters and caps length. Applied to every extraction result. */
function sanitize(text) {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // control chars, keep \n \t
    .trim()
    .slice(0, MAX_EXTRACTED_LENGTH)
}

async function extractPdf(material) {
  const storage = getStorageProvider()
  const buffer = await storage.read(material.source)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return sanitize(result.text)
  } finally {
    await parser.destroy()
  }
}

async function extractUrl(material) {
  // SSRF-safe: public addresses only, bounded size/time, redirects re-checked.
  const html = await safeFetchText(material.source)
  // Deliberately simple — this is a best-effort text extraction, not a
  // browser. Strips scripts/styles/tags, collapses whitespace.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  return sanitize(text)
}

function extractPlainText(material) {
  return sanitize(material.content || '')
}

const NOT_YET_SUPPORTED = new Set(['image', 'audio', 'video', 'file'])

/**
 * Extracts usable text from a material. Throws on failure — the caller
 * (processMaterial) is responsible for catching that and recording
 * `processingError` / status 'failed'. Never touches the AI layer.
 */
export async function extractText(material) {
  if (NOT_YET_SUPPORTED.has(material.type)) {
    throw new Error(`${material.type} processing isn't supported yet — coming soon`)
  }

  switch (material.type) {
    case 'pdf':
      return extractPdf(material)
    case 'url':
      return extractUrl(material)
    case 'text':
    case 'pasted':
    case 'existing_description':
      return extractPlainText(material)
    default:
      throw new Error(`Unknown material type: "${material.type}"`)
  }
}
