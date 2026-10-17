import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Lock } from 'lucide-react'
import RevealMark from '../components/RevealMark'
import SectionRenderer, { FileCard } from '../components/experience/SectionRenderer'
import { api } from '../lib/api'
import { sendEvent } from '../lib/analytics'
import { PRODUCT_TYPE_LABEL, DEFAULT_CTA_LABEL } from '../lib/sectionTypes'
import { useDocumentMeta, PRODUCTION_ORIGIN } from '../lib/useDocumentMeta'

export default function PublicExperience() {
  const { slug } = useParams()
  const [experience, setExperience] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | unavailable | error
  const [activeSection, setActiveSection] = useState(0)
  const prefersReducedMotion = useReducedMotion()

  // The server also deduplicates; this just avoids pointless requests.
  const sentRef = useRef(new Set())
  function sendOnce(key, eventType, extra) {
    if (sentRef.current.has(key)) return
    sentRef.current.add(key)
    sendEvent(slug, { eventType, ...extra })
  }

  function load() {
    setStatus('loading')
    return api
      .getPublicExperience(slug)
      .then(({ experience }) => {
        setExperience(experience)
        setStatus('ready')
        sendOnce('viewed', 'experience_viewed')
      })
      .catch((err) => {
        if (err.status === 404) setStatus('notfound')
        else if (err.status === 503) setStatus('unavailable')
        else setStatus('error')
      })
  }

  useEffect(() => {
    sentRef.current = new Set()
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useDocumentMeta({
    title: experience ? `${experience.title} — Sneaky Peek` : undefined,
    description: experience?.hook || experience?.description || experience?.title,
    canonicalPath: `/p/${slug}`,
    // Only a successfully loaded, published experience is indexable.
    noindex: status !== 'ready',
    image: experience?.cover?.url ? `${PRODUCTION_ORIGIN}${experience.cover.url}` : `${PRODUCTION_ORIGIN}/og-image.png`,
  })

  const revealProps = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] } }

  const inViewProps = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center" role="status" aria-label="Loading">
        <RevealMark size={40} animated animationState="thinking" />
      </div>
    )
  }

  if (status !== 'ready') {
    const copy = {
      notfound: ["This experience isn't available", 'It may have been unpublished, or the link may be incorrect.'],
      unavailable: ['Temporarily unavailable', 'Sneaky Peek is undergoing maintenance. Please try again in a few minutes.'],
      error: ['Something went wrong', 'We could not load this page. Check your connection and try again.'],
    }[status]
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RevealMark size={40} />
        <h1 className="font-serif text-2xl text-ink">{copy[0]}</h1>
        <p className="text-muted text-sm max-w-xs">{copy[1]}</p>
        {status !== 'notfound' && (
          <button type="button" onClick={load} className="mt-2 rounded-pill border border-line px-4 py-2 text-sm text-ink hover:border-ink">
            Try again
          </button>
        )}
      </div>
    )
  }

  const sections = experience.sections || []
  const checkoutUrl = experience.checkoutUrl?.trim()
  const ctaLabel = experience.ctaText || DEFAULT_CTA_LABEL[experience.productType] || 'Get it now'
  const restricted = (experience.deliverables || []).filter((d) => d.access === 'restricted')
  const hasCtaSection = sections.some((s) => s.type === 'cta')
  const firstLockedIndex = sections.findIndex((s) => s.locked)

  function onCheckout() {
    sendOnce('cta_clicked', 'cta_clicked')
    sendOnce('checkout_clicked', 'checkout_clicked')
  }

  function renderCta({ heading, body, buttonText } = {}) {
    return (
      <motion.div
        {...inViewProps}
        onViewportEnter={() => {
          sendOnce('cta_viewed', 'cta_viewed')
          sendOnce('experience_completed', 'experience_completed')
        }}
        className="rounded-3xl border border-line bg-surface px-6 py-10 text-center"
      >
        <h2 className="font-serif text-3xl text-ink mb-3 leading-tight">{heading || `Get ${experience.title}`}</h2>
        {body && <p className="text-muted leading-relaxed max-w-md mx-auto mb-6 whitespace-pre-line">{body}</p>}
        {restricted.length > 0 && (
          <div className="mx-auto mb-7 max-w-sm text-left">
            <p className="text-xs uppercase tracking-widest text-muted mb-3 text-center">Included with purchase</p>
            <div className="space-y-2">
              {restricted.map((d) => <FileCard key={d.id} asset={d} />)}
            </div>
          </div>
        )}
        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onCheckout}
            className="inline-flex items-center gap-2 rounded-pill bg-accent-dim px-7 py-3.5 text-base font-medium text-white transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {experience.ctaText || buttonText || ctaLabel}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        ) : (
          <p className="text-sm text-muted">Checkout isn't available yet.</p>
        )}
        {checkoutUrl && <p className="mt-3 text-xs text-muted">Opens the creator's checkout page.</p>}
      </motion.div>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <header className="flex items-center justify-between max-w-2xl mx-auto px-6 py-6">
        <RevealMark size={24} animated={!prefersReducedMotion} animationState="idle" />
        {experience.storefront && (
          <Link to={`/s/${experience.storefront.slug}`} className="text-sm text-muted hover:text-ink">
            More from {experience.storefront.displayName || 'this creator'}
          </Link>
        )}
      </header>

      {sections.length > 1 && (
        <div className="sticky top-0 z-10 flex justify-center gap-1.5 py-2 bg-paper/80 backdrop-blur" aria-hidden="true">
          {sections.map((_, i) => (
            <span key={i} className={`h-1 rounded-pill transition-all duration-300 ${i <= activeSection ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
      )}

      <main id="content" className="max-w-xl mx-auto px-6 pb-24 pt-6">
        <motion.p {...revealProps(0)} className="text-xs uppercase tracking-widest text-accent-dim font-medium mb-4 text-center">
          {PRODUCT_TYPE_LABEL[experience.productType] || 'Experience'}
          {experience.authorName ? ` · ${experience.authorName}` : ''}
        </motion.p>

        <motion.h1 {...revealProps(0.05)} className="font-serif text-4xl md:text-5xl text-ink text-center leading-tight mb-6 text-balance">
          {experience.title}
        </motion.h1>

        {experience.hook && (
          <motion.p {...revealProps(0.1)} className="text-lg text-muted text-center leading-relaxed mb-10">
            {experience.hook}
          </motion.p>
        )}

        {experience.cover?.url && (
          <motion.figure {...revealProps(0.12)} className="mb-12 overflow-hidden rounded-2xl border border-line bg-surface">
            <img src={experience.cover.url} alt={experience.cover.title || experience.title} className="w-full h-auto" />
          </motion.figure>
        )}

        {sections.map((section, i) => (
          <div key={section.id || i}>
            {i === firstLockedIndex && experience.lockedMessage && (
              <p className="mb-6 flex items-center justify-center gap-2 text-center text-sm text-muted">
                <Lock size={14} aria-hidden="true" /> {experience.lockedMessage}
              </p>
            )}
            <motion.section
              {...inViewProps}
              aria-label={section.heading || undefined}
              onViewportEnter={() => {
                setActiveSection(i)
                if (section.locked) return
                if (i === 0) sendOnce('started', 'experience_started')
                sendOnce(`sv:${section.index}`, 'section_viewed', { sectionIndex: section.index, sectionType: section.type })
              }}
              onViewportLeave={() => {
                if (!section.locked) sendOnce(`sc:${section.index}`, 'section_completed', { sectionIndex: section.index, sectionType: section.type })
              }}
              className="mb-12"
            >
              <SectionRenderer
                section={section}
                onInteraction={(s) => sendOnce(`ic:${s.index}`, 'interaction_completed', { sectionIndex: s.index, sectionType: s.type })}
                cta={(s) => renderCta({ heading: s.heading, body: s.body, buttonText: s.data?.buttonText })}
              />
            </motion.section>
          </div>
        ))}

        {!hasCtaSection && renderCta()}
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        Made with <a href={PRODUCTION_ORIGIN} className="underline-offset-2 hover:underline">Sneaky Peek</a>
      </footer>
    </div>
  )
}
