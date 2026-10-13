import { customAlphabet } from 'nanoid'
import Experience from '../models/Experience.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6)

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
}

/**
 * Generates a unique, URL-safe slug from a title, e.g. "my-first-book-x7f2kq".
 * Retries with a fresh suffix on the rare collision.
 */
export async function generateUniqueSlug(title) {
  const base = slugify(title) || 'experience'

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${nanoid(6).toLowerCase()}`
    const exists = await Experience.exists({ slug: candidate })
    if (!exists) return candidate
  }

  // Extremely unlikely fallback
  return `${base}-${nanoid(10).toLowerCase()}`
}
