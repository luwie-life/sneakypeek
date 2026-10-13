import { useEffect } from 'react'

const DEFAULT_TITLE = 'Sneaky Peek'

// The real production domain, from build-time config — never the current
// window origin, which would be localhost in dev or a preview URL on a
// staging deploy. Falls back to the current origin only so local dev never
// breaks; that fallback should never ship to production (set
// VITE_MARKETING_URL there).
const PRODUCTION_ORIGIN =
  import.meta.env.VITE_MARKETING_URL || (typeof window !== 'undefined' ? window.location.origin : '')

function setMetaTag(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkTag(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function removeLinkTag(rel) {
  document.head.querySelector(`link[rel="${rel}"]`)?.remove()
}

/**
 * Sets document title + description + canonical URL + robots directive +
 * Open Graph/Twitter tags for the current page, restoring Sneaky Peek's
 * defaults on unmount.
 *
 * Honest limitation: this is a client-side-rendered SPA with no
 * server-side rendering, so these tags are only visible to crawlers that
 * execute JavaScript. Non-JS social-preview bots (most of them, including
 * Facebook/Twitter/Slack/WhatsApp's link-unfurlers) will NOT see this —
 * they'll see index.html's static tags instead (see index.html's own tags
 * for the one page — the homepage — where that static fallback matters
 * most). Real social-preview support for every route would require SSR or
 * prerendering, which is out of scope here. This still correctly sets the
 * browser tab title and helps JS-executing crawlers (e.g. Google), which
 * is the honest ceiling for this architecture.
 *
 * @param {string} [canonicalPath] - path only, e.g. '/' or '/p/some-slug'; combined with the real production origin, never the current window origin.
 * @param {boolean} [noindex] - true for authenticated/private pages — paired with (not a replacement for) robots.txt and real auth checks.
 * @param {string} [image] - absolute URL to an OG/Twitter preview image.
 */
export function useDocumentMeta({ title, description, canonicalPath, noindex, image }) {
  useEffect(() => {
    if (title) document.title = title
    if (description) setMetaTag('name', 'description', description)

    const canonicalUrl = canonicalPath ? `${PRODUCTION_ORIGIN}${canonicalPath}` : undefined
    if (canonicalUrl) setLinkTag('canonical', canonicalUrl)

    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')

    if (title) setMetaTag('property', 'og:title', title)
    if (description) setMetaTag('property', 'og:description', description)
    setMetaTag('property', 'og:type', 'website')
    if (canonicalUrl) setMetaTag('property', 'og:url', canonicalUrl)
    if (image) setMetaTag('property', 'og:image', image)

    if (title) setMetaTag('name', 'twitter:title', title)
    if (description) setMetaTag('name', 'twitter:description', description)
    setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
    if (image) setMetaTag('name', 'twitter:image', image)

    return () => {
      document.title = DEFAULT_TITLE
      removeLinkTag('canonical')
    }
  }, [title, description, canonicalPath, noindex, image])
}

export { PRODUCTION_ORIGIN }
