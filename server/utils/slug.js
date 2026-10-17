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

export { slugify }

// Storefront slugs live at /s/:slug. Reserved words avoid confusing or
// impersonating platform pages.
const RESERVED_STOREFRONT_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'help', 'login', 'logout', 'p', 's',
  'settings', 'signup', 'sneakypeek', 'sneaky-peek', 'store', 'support', 'www', 'luwie', 'official',
])

/** Returns a normalized storefront slug, or throws with a user-facing message. */
export function validateStorefrontSlug(input) {
  if (typeof input !== 'string') throw new Error('Storefront address is required')
  const slug = input.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug) || slug.includes('--')) {
    throw new Error('Storefront address must be 3-40 characters: lowercase letters, numbers and single hyphens')
  }
  if (RESERVED_STOREFRONT_SLUGS.has(slug)) throw new Error('That storefront address is reserved — please choose another')
  return slug
}
