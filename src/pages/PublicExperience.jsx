import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen, Lightbulb, HelpCircle, Target, GraduationCap, PenLine, Trophy, Award,
  LayoutTemplate, CheckCircle2, Headphones, Sparkles, Users, Package, Info, ArrowRight,
} from 'lucide-react'
import RevealMark from '../components/RevealMark'
import Button from '../components/ui/Button'
import { api } from '../lib/api'
import { sendEvent } from '../lib/analytics'
import { useDocumentMeta, PRODUCTION_ORIGIN } from '../lib/useDocumentMeta'

const TYPE_LABEL = {
  book: 'Book',
  course: 'Course',
  guide: 'Guide',
  audio: 'Audio',
  template: 'Template',
  digital: 'Digital asset',
  physical: 'Product',
  other: 'Experience',
}

// CTA copy adapted per product type — small touch, keeps the generic
// "Get it now" from feeling identical across every kind of product.
const CTA_LABEL = {
  book: 'Get the book',
  course: 'Enroll now',
  guide: 'Get the guide',
  audio: 'Listen now',
  template: 'Get the template',
  digital: 'Get it now',
  physical: 'Get it now',
  other: 'Get it now',
}

// Every section.type the backend's AI generation can produce (see
// server/services/ai/templates.js) mapped to an icon — this is what gives
// each product type's structure a distinct visual rhythm without
// hardcoding a separate layout per type.
const SECTION_ICON = {
  hook: Sparkles,
  context: Info,
  chapter_preview: BookOpen,
  insight: Lightbulb,
  curiosity_gap: HelpCircle,
  cta: ArrowRight,
  problem: Target,
  mini_lesson: GraduationCap,
  exercise: PenLine,
  result: Trophy,
  course_promise: Award,
  interactive_preview: LayoutTemplate,
  whats_included: CheckCircle2,
  audio_preview: Headphones,
  why_it_matters: Lightbulb,
  preview: Info,
  what_they_will_learn: CheckCircle2,
  benefits: CheckCircle2,
  social_proof: Users,
  introduction: Info,
  other: Package,
}

export default function PublicExperience() {
  const { slug } = useParams()
  const [experience, setExperience] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error
  const [activeSection, setActiveSection] = useState(0)
  const prefersReducedMotion = useReducedMotion()

  // Tracks which (eventType, key) pairs have already been sent this page
  // load, so scroll bounce or re-renders never send duplicates.
  const sentRef = useRef(new Set())
  function sendOnce(key, eventType, extra) {
    if (sentRef.current.has(key)) return
    sentRef.current.add(key)
    sendEvent(slug, { eventType, ...extra })
  }

  useEffect(() => {
    let cancelled = false
    api
      .getPublicExperience(slug)
      .then(({ experience }) => {
        if (cancelled) return
        setExperience(experience)
        setStatus('ready')
        sendOnce('viewed', 'experience_viewed')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err.message.includes('404') || err.message.includes('not available') ? 'notfound' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useDocumentMeta({
    title: experience ? `${experience.title} — Sneaky Peek` : undefined,
    description: experience?.hook || experience?.title,
    canonicalPath: `/p/${slug}`,
    // Only a successfully loaded, genuinely published experience should be
    // indexable — a 404/error state at this same URL (unpublished, deleted,
    // or simply a bad slug) has nothing worth a search result, and must
    // never look indexable just because the route pattern matches.
    noindex: status !== 'ready',
    image: `${PRODUCTION_ORIGIN}/og-image.png`,
  })

  function handleCheckoutClick() {
    sendOnce('cta_clicked', 'cta_clicked')
    sendOnce('checkout_clicked', 'checkout_clicked')
  }

  // Respects prefers-reduced-motion: when set, content renders in its final
  // state immediately rather than animating in. Comprehension never depends
  // on the animation running either way.
  const revealProps = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
        }

  const inViewProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <RevealMark size={40} animated animationState="thinking" />
      </div>
    )
  }

  if (status === 'notfound') {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RevealMark size={40} />
        <p className="font-serif text-2xl text-ink">This experience isn't available</p>
        <p className="text-muted text-sm max-w-xs">
          It may have been unpublished, or the link is incorrect.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6 text-center">
        <p className="text-muted">Something went wrong loading this page. Try again shortly.</p>
      </div>
    )
  }

  const sections = experience.sections || []
  const hasValidCheckout = Boolean(experience.checkoutUrl?.trim())
  const ctaLabel = CTA_LABEL[experience.productType] || 'Get it now'

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-center py-8">
        <RevealMark size={26} animated={!prefersReducedMotion} animationState="idle" />
      </header>

      {/* Section progress — a quiet cue that this is a short, bounded
          experience with a destination, not an endless scroll. */}
      {sections.length > 1 && (
        <div className="flex justify-center gap-1.5 mb-2" aria-hidden="true">
          {sections.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-pill transition-all duration-300 ${
                i <= activeSection ? 'w-5 bg-accent' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
      )}

      <main className="max-w-xl mx-auto px-6 pb-24">
        <motion.p
          {...revealProps(0)}
          className="text-xs uppercase tracking-widest text-accent-dim font-medium mb-4 text-center"
        >
          {TYPE_LABEL[experience.productType] || 'Experience'}
        </motion.p>

        <motion.h1
          {...revealProps(0.05)}
          className="font-serif text-4xl md:text-5xl text-ink text-center leading-tight mb-6"
        >
          {experience.title}
        </motion.h1>

        {experience.hook && (
          <motion.p
            {...revealProps(0.1)}
            className="text-lg text-muted text-center leading-relaxed mb-10"
          >
            {experience.hook}
          </motion.p>
        )}

        {sections.map((section, i) => {
          const Icon = SECTION_ICON[section.type] || Package
          return (
            <motion.section
              key={i}
              {...inViewProps}
              onViewportEnter={() => {
                setActiveSection(i)
                // Reaching the first section past the hero counts as "started"
                if (i === 0) sendOnce('started', 'experience_started')
                sendOnce(`section_viewed:${i}`, 'section_viewed', {
                  sectionIndex: i,
                  sectionType: section.type,
                })
              }}
              onViewportLeave={() => {
                sendOnce(`section_completed:${i}`, 'section_completed', {
                  sectionIndex: i,
                  sectionType: section.type,
                })
              }}
              className="mb-10"
            >
              {section.heading && (
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={15} className="text-accent shrink-0" />
                  <h2 className="font-serif text-2xl text-ink">{section.heading}</h2>
                </div>
              )}
              {section.body && <p className="text-muted leading-relaxed">{section.body}</p>}
            </motion.section>
          )
        })}

        <motion.div
          {...revealProps(0.1)}
          onViewportEnter={() => {
            sendOnce('cta_viewed', 'cta_viewed')
            // Reaching the CTA is our best available signal for "reached the end"
            sendOnce('experience_completed', 'experience_completed')
          }}
          viewport={{ once: true, margin: '-40px' }}
          className="flex justify-center pt-4"
        >
          {hasValidCheckout ? (
            <a href={experience.checkoutUrl} target="_blank" rel="noreferrer" onClick={handleCheckoutClick}>
              <Button variant="accent" size="lg">
                {ctaLabel}
              </Button>
            </a>
          ) : (
            <Button variant="accent" size="lg" disabled>
              {ctaLabel}
            </Button>
          )}
        </motion.div>
      </main>
    </div>
  )
}
