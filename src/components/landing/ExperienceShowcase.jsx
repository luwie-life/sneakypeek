import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { BookOpen, GraduationCap, LayoutTemplate, Sparkles, HelpCircle, ArrowRight } from 'lucide-react'
import Button from '../ui/Button'

// A small, honest subset of what the real public experience renders —
// same visual language (icon + heading + body, serif headline, orange CTA)
// as the actual product, not a decorative mockup. Content below is
// clearly-labeled example copy, never attributed to a real product or person.
const EXAMPLES = {
  book: {
    icon: BookOpen,
    label: 'Book',
    title: 'The Slow Build',
    hook: 'A book about doing fewer things, better.',
    sections: [
      { icon: Sparkles, heading: 'Why this book exists', body: 'Written for people who keep starting things and rarely finishing them.' },
      { icon: HelpCircle, heading: 'What you\u2019ll find inside', body: 'Short chapters, each built around one idea you can act on the same day.' },
    ],
  },
  course: {
    icon: GraduationCap,
    label: 'Course',
    title: 'Foundations of Pricing',
    hook: 'A short course on pricing creative work with confidence.',
    sections: [
      { icon: Sparkles, heading: 'The problem', body: 'Most creators price by guessing, then regret it six months later.' },
      { icon: HelpCircle, heading: 'What you\u2019ll practice', body: 'A simple framework you apply to your own work in the first lesson.' },
    ],
  },
  template: {
    icon: LayoutTemplate,
    label: 'Template',
    title: 'Client Proposal Kit',
    hook: 'A proposal template that gets replies.',
    sections: [
      { icon: Sparkles, heading: 'The problem it solves', body: 'Proposals that look generic get skimmed, not read.' },
      { icon: HelpCircle, heading: 'What\u2019s included', body: 'Three editable sections and a structure you can fill in in minutes.' },
    ],
  },
}

export default function ExperienceShowcase() {
  const [active, setActive] = useState('book')
  const example = EXAMPLES[active]
  const prefersReducedMotion = useReducedMotion()

  return (
    <div>
      <div className="flex justify-center gap-2 mb-6">
        {Object.entries(EXAMPLES).map(([key, ex]) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-sm border transition-colors ${
              active === key ? 'border-ink bg-ink text-paper' : 'border-line text-muted hover:border-ink hover:text-ink'
            }`}
          >
            <ex.icon size={14} />
            {ex.label}
          </button>
        ))}
      </div>

      <div className="bg-paper border border-line rounded-2xl shadow-soft overflow-hidden max-w-md mx-auto">
        <div className="px-6 pt-5 pb-2 text-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">Example — not a real customer</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="px-6 pb-7"
          >
            <p className="text-xs uppercase tracking-widest text-accent-dim font-medium text-center mb-2">
              {example.label}
            </p>
            <h3 className="font-serif text-2xl text-ink text-center mb-2">{example.title}</h3>
            <p className="text-sm text-muted text-center mb-6">{example.hook}</p>

            {example.sections.map((s, i) => (
              <div key={i} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon size={13} className="text-accent shrink-0" />
                  <h4 className="font-serif text-base text-ink">{s.heading}</h4>
                </div>
                <p className="text-xs text-muted leading-relaxed">{s.body}</p>
              </div>
            ))}

            <div className="flex justify-center pt-2">
              <Button variant="accent" size="sm" disabled icon={ArrowRight}>
                Get it now
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
