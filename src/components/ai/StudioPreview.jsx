import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import RevealMark from '../RevealMark'
import SectionRenderer, { FileCard } from '../experience/SectionRenderer'
import { isSectionPublic, labelOf, PRODUCT_TYPE_LABEL, DEFAULT_CTA_LABEL, sectionHasContentClient } from '../../lib/sectionTypes'

/**
 * Live preview of the experience. "Visitor view" applies exactly the same
 * free/locked/stopping-point rules as the public page (the server enforces
 * them; this mirrors them so the creator sees what visitors will see).
 * Asset-backed sections show names only, because the owner's files are
 * not public URLs until the experience is published.
 */
export default function StudioPreview({ experience, deliverables = [] }) {
  const [mode, setMode] = useState('visitor') // visitor | all
  const byId = useMemo(() => new Map(deliverables.map((d) => [d._id, d])), [deliverables])
  const settings = experience.previewSettings || {}

  const sections = (experience.sections || []).map((s, index) => {
    if (mode === 'visitor' && !isSectionPublic(s, index, settings)) {
      return { index, id: s.id, type: s.type, label: labelOf(s.type), locked: true, heading: settings.showLockedHeadings !== false ? s.heading : '' }
    }
    const out = { ...s, index, locked: false }
    if (s.type === 'gallery') {
      out.data = { images: (s.data?.assetIds || []).map((id) => byId.get(id)).filter((d) => d && (mode === 'all' || d.access === 'free')).map((d) => ({ id: d._id, title: d.title, url: null })) }
    }
    if (s.type === 'free_download') {
      const d = byId.get(s.data?.assetId)
      out.data = d && (mode === 'all' || d.access === 'free') ? { asset: { ...d, id: d._id, url: d.access === 'free' ? '#' : null } } : {}
    }
    return out
  })
  const visible = sections.filter((s) => s.locked || sectionHasContentClient(s))
  const restricted = deliverables.filter((d) => d.access === 'restricted')
  const firstLocked = visible.findIndex((s) => s.locked)
  const ctaLabel = experience.ctaText || DEFAULT_CTA_LABEL[experience.productType] || 'Get it now'
  const hasCta = visible.some((s) => s.type === 'cta')

  const ctaBlock = (s = {}) => (
    <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
      <p className="font-serif text-2xl text-ink mb-2">{s.heading || `Get ${experience.title || 'it'}`}</p>
      {s.body && <p className="text-sm text-muted mb-4 whitespace-pre-line">{s.body}</p>}
      {restricted.length > 0 && (
        <div className="mx-auto mb-5 max-w-xs space-y-2 text-left">
          <p className="text-[11px] uppercase tracking-widest text-muted text-center">Included with purchase</p>
          {restricted.map((d) => <FileCard key={d._id} asset={{ ...d, url: null }} preview />)}
        </div>
      )}
      <span className="inline-flex rounded-pill bg-accent-dim px-5 py-2.5 text-sm font-medium text-white">{experience.ctaText || s.data?.buttonText || ctaLabel}</span>
      {!experience.checkoutUrl && <p className="mt-3 text-xs text-accent-dim">Add a checkout link in the editor before publishing.</p>}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-paper rounded-2xl border border-line">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-line bg-paper/95 backdrop-blur">
        <RevealMark size={20} />
        <div role="tablist" aria-label="Preview mode" className="flex rounded-pill border border-line p-0.5 text-xs">
          {[
            ['visitor', 'Visitor view'],
            ['all', 'All content'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-pill px-3 py-1 transition-colors ${mode === key ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-widest text-accent-dim font-medium mb-3 text-center">
          {PRODUCT_TYPE_LABEL[experience.productType] || 'Experience'}
          {experience.authorName ? ` · ${experience.authorName}` : ''}
        </p>
        <h1 className="font-serif text-3xl text-ink text-center leading-tight mb-4">{experience.title || 'Untitled experience'}</h1>
        {experience.hook && <p className="text-muted text-center leading-relaxed mb-8">{experience.hook}</p>}

        {visible.length === 0 && (
          <p className="text-muted text-sm text-center py-10">No sections yet. Generate a first draft or add a section.</p>
        )}

        {visible.map((section, i) => (
          <div key={section.id || i} className="mb-8">
            {mode === 'visitor' && i === firstLocked && settings.lockedMessage && (
              <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock size={12} aria-hidden="true" /> {settings.lockedMessage}</p>
            )}
            {mode === 'all' && section.visibility === 'locked' && (
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted flex items-center gap-1"><Lock size={10} aria-hidden="true" /> Locked for visitors</p>
            )}
            <SectionRenderer section={section} size="sm" preview cta={ctaBlock} />
          </div>
        ))}
        {visible.length > 0 && !hasCta && ctaBlock()}
      </div>
    </div>
  )
}
