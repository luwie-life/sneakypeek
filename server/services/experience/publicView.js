import ProductMaterial from '../../models/ProductMaterial.js'
import User from '../../models/User.js'
import { isSectionPublic, sectionHasContent, SECTION_TYPES } from './sections.js'

/**
 * Builds the ONLY shape of an experience that is ever sent to anonymous
 * visitors. Anything not copied here explicitly is never exposed:
 * no owner id, no product understanding, no source materials, no storage
 * keys, no content of locked sections, no restricted-download URLs.
 *
 * Rule of thumb: anything in this response is visible to anyone who opens
 * dev tools, so locked content must never be included "hidden".
 */

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export function publicAssetUrl(slug, assetId) {
  return `/api/public/experiences/${encodeURIComponent(slug)}/assets/${assetId}`
}

function publicDeliverable(slug, m) {
  const base = {
    id: String(m._id),
    title: m.name || m.fileName || 'Resource',
    description: m.description || '',
    fileName: m.fileName || '',
    mimeType: m.mimeType || '',
    sizeBytes: m.sizeBytes || 0,
    isImage: IMAGE_MIME.has(m.mimeType),
  }
  if (m.access === 'free') return { ...base, access: 'free', url: publicAssetUrl(slug, m._id) }
  // Restricted: listed so visitors know it's included, never downloadable.
  return { ...base, fileName: '', access: 'restricted', url: null }
}

export async function loadPublicDeliverables(experienceId) {
  return ProductMaterial.find({
    experience: experienceId,
    role: 'deliverable',
    access: { $in: ['free', 'restricted'] },
    status: 'ready',
  })
    .sort({ order: 1, createdAt: 1 })
    .select('name description fileName mimeType sizeBytes access order')
    .lean()
}

export async function toPublicExperience(experience, { deliverables, creator } = {}) {
  const slug = experience.slug
  const assets = deliverables || (await loadPublicDeliverables(experience._id))
  const freeById = new Map(assets.filter((a) => a.access === 'free').map((a) => [String(a._id), a]))
  const settings = experience.previewSettings || {}

  const sections = []
  let lockedCount = 0
  experience.sections.forEach((raw, index) => {
    const section = raw.toObject ? raw.toObject() : raw
    if (!isSectionPublic(section, index, settings)) {
      lockedCount += 1
      sections.push({
        index,
        id: section.id || `s${index}`,
        type: section.type,
        label: SECTION_TYPES[section.type]?.label || 'Section',
        locked: true,
        // Heading only if the creator opted in — never body/data.
        heading: settings.showLockedHeadings !== false ? section.heading || '' : '',
      })
      return
    }

    const out = {
      index,
      id: section.id || `s${index}`,
      type: section.type,
      heading: section.heading || '',
      body: section.body || '',
      locked: false,
    }
    if (section.data) out.data = JSON.parse(JSON.stringify(section.data))

    // Resolve asset references against FREE deliverables only. A deleted,
    // restricted or foreign asset id simply disappears from the output.
    if (section.type === 'gallery') {
      out.data = out.data || {}
      out.data.images = (section.data?.assetIds || [])
        .map((id) => freeById.get(id))
        .filter((a) => a && IMAGE_MIME.has(a.mimeType))
        .map((a) => ({ id: String(a._id), title: a.name || '', url: publicAssetUrl(slug, a._id) }))
      delete out.data.assetIds
      if (!out.data.images.length) return
    }
    if (section.type === 'free_download') {
      const asset = freeById.get(section.data?.assetId)
      if (!asset) return
      out.data = { asset: publicDeliverable(slug, asset) }
    }
    if (!sectionHasContent({ ...section, data: section.data })) return
    sections.push(out)
  })

  let cover = null
  if (experience.coverAsset) {
    const a = freeById.get(String(experience.coverAsset))
    if (a && IMAGE_MIME.has(a.mimeType)) cover = { url: publicAssetUrl(slug, a._id), title: a.name || '' }
  }

  let storefront = creator
  if (storefront === undefined) {
    const owner = await User.findById(experience.owner).select('storefront').lean()
    storefront = owner?.storefront?.published && owner.storefront.slug
      ? { slug: owner.storefront.slug, displayName: owner.storefront.displayName || '' }
      : null
  }

  return {
    slug,
    title: experience.title,
    productType: experience.productType,
    hook: experience.hook || '',
    description: experience.description || '',
    authorName: experience.authorName || '',
    ctaText: experience.ctaText || '',
    checkoutUrl: experience.checkoutUrl || '',
    publishedAt: experience.publishedAt,
    cover,
    sections,
    lockedCount,
    lockedMessage: settings.lockedMessage || '',
    deliverables: assets.map((a) => publicDeliverable(slug, a)),
    storefront,
  }
}
