import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Upload, Sparkles, PenLine, Share2, ArrowRight, BarChart3, MousePointerClick, TrendingUp,
} from 'lucide-react'
import RevealMark from '../components/RevealMark'
import Button from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PricingCard from '../components/billing/PricingCard'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import ExperienceShowcase from '../components/landing/ExperienceShowcase'
import { api } from '../lib/api'
import { useDocumentMeta, PRODUCTION_ORIGIN } from '../lib/useDocumentMeta'

const EASE = [0.16, 1, 0.3, 1]

function Reveal({ children, className, delay = 0 }) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const HOW_IT_WORKS = [
  { icon: Upload, title: 'Bring your material', body: 'A description, an excerpt, a PDF — whatever you already have.' },
  { icon: Sparkles, title: 'AI drafts it', body: 'AI reads what you gave it and creates a first draft, structured to fit your product.' },
  { icon: PenLine, title: 'Edit and approve', body: 'Nothing publishes without you. Rewrite anything, regenerate anything.' },
  { icon: Share2, title: 'Share and let people explore', body: 'One link. Visitors explore before they ever reach your checkout.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState(null)
  const [plansError, setPlansError] = useState('')

  useDocumentMeta({
    title: 'Sneaky Peek — Let them peek. Make them want more.',
    description: 'Sneaky Peek helps creators turn books, courses, templates, and other products into interactive pre-purchase experiences people can explore before buying.',
    canonicalPath: '/',
    image: `${PRODUCTION_ORIGIN}/og-image.png`,
  })

  useEffect(() => {
    api.getPlans()
      .then(({ plans }) => setPlans(plans))
      .catch((err) => setPlansError(err.message))
  }, [])

  return (
    <div className="bg-paper">
      <LandingNav />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 text-center">
        <Reveal>
          <h1 className="font-serif text-4xl sm:text-6xl text-ink leading-[1.1] mb-6">
            Let them peek.
            <br />
            Make them want more.
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-muted text-base sm:text-lg max-w-xl mx-auto mb-9 leading-relaxed">
            Sneaky Peek helps creators turn their products into interactive pre-purchase experiences —
            so people can explore what's inside before they buy.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="accent" size="lg" onClick={() => navigate('/signup')}>
              Create your Sneaky Peek
            </Button>
            <a href="#how-it-works">
              <Button variant="outline" size="lg">See how it works</Button>
            </a>
          </div>
        </Reveal>
      </section>

      {/* Problem */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 py-16 text-center">
        <Reveal>
          <h2 className="font-serif text-3xl text-ink mb-5">
            You spent months making it. They see a cover and a price.
          </h2>
          <p className="text-muted leading-relaxed">
            Books, courses, templates, guides — real work goes into every one. But on a store page,
            a prospective buyer usually gets a title, a cover image, a short description, and a price.
            Nothing that actually shows them what's inside.
          </p>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-surface py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <Reveal>
            <h2 className="font-serif text-3xl text-ink text-center mb-12">How it works</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.06}>
                <Card hover={false} className="h-full">
                  <step.icon size={18} className="text-accent mb-3" />
                  <h3 className="font-sans font-medium text-ink mb-1.5">{step.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive showcase */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center mb-10">
          <Reveal>
            <h2 className="font-serif text-3xl text-ink mb-4">See what visitors actually experience</h2>
            <p className="text-muted leading-relaxed">
              Try the three product types below — this is the real Sneaky Peek layout, not a mockup.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <ExperienceShowcase />
        </Reveal>
      </section>

      {/* AI-assisted creation */}
      <section className="bg-surface py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <Reveal>
            <RevealMark size={28} animated animationState="idle" className="mx-auto mb-6" />
            <h2 className="font-serif text-3xl text-ink mb-5">AI drafts it. You stay in control.</h2>
            <p className="text-muted leading-relaxed">
              Give Sneaky Peek your product material and it reads it, understands what's actually
              interesting about it, and drafts a structured first version. You edit every word,
              regenerate any section, and nothing publishes without your approval. It's a starting
              point, not an autopilot.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Analytics */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <Reveal>
            <h2 className="font-serif text-3xl text-ink text-center mb-4">See what's working</h2>
            <p className="text-muted text-center max-w-xl mx-auto mb-12 leading-relaxed">
              Every published experience tracks how far visitors get and where they lose interest —
              real visitor behavior, not a guess.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-6">
            <Reveal delay={0}>
              <Card hover={false} className="text-center">
                <BarChart3 size={18} className="text-accent mx-auto mb-3" />
                <p className="font-sans font-medium text-ink mb-1">Section-by-section views</p>
                <p className="text-sm text-muted">See exactly where visitors stop reading.</p>
              </Card>
            </Reveal>
            <Reveal delay={0.06}>
              <Card hover={false} className="text-center">
                <MousePointerClick size={18} className="text-accent mx-auto mb-3" />
                <p className="font-sans font-medium text-ink mb-1">Checkout clicks</p>
                <p className="text-sm text-muted">Know when someone was ready to buy.</p>
              </Card>
            </Reveal>
            <Reveal delay={0.12}>
              <Card hover={false} className="text-center">
                <TrendingUp size={18} className="text-accent mx-auto mb-3" />
                <p className="font-sans font-medium text-ink mb-1">A real funnel</p>
                <p className="text-sm text-muted">Visitors → engaged → CTA → checkout, visualized.</p>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal>
            <h2 className="font-serif text-3xl text-ink text-center mb-3">Pricing</h2>
            <p className="text-muted text-center mb-12">Monthly plans. No annual lock-in.</p>
          </Reveal>

          {plansError && <p className="text-accent-dim text-center">{plansError}</p>}
          {!plans && !plansError && (
            <div className="flex justify-center py-12">
              <RevealMark size={28} animated animationState="thinking" />
            </div>
          )}
          {plans && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {plans.map((plan) => (
                <PricingCard key={plan.slug} plan={plan} onSelect={() => navigate('/signup')} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 text-center px-5 sm:px-8">
        <Reveal>
          <RevealMark size={32} className="mx-auto mb-6" />
          <h2 className="font-serif text-3xl sm:text-4xl text-ink mb-8">
            Let them experience it before they buy.
          </h2>
          <Button variant="accent" size="lg" icon={ArrowRight} onClick={() => navigate('/signup')}>
            Create your Sneaky Peek
          </Button>
        </Reveal>
      </section>

      <LandingFooter />
    </div>
  )
}
