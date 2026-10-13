import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, GraduationCap, Compass, LayoutTemplate, Headphones, Download, Package, Sparkles, Upload,
} from 'lucide-react'
import RevealMark from '../components/RevealMark'
import Button from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import UpgradePrompt from '../components/billing/UpgradePrompt'
import AiUpgradePrompt from '../components/billing/AiUpgradePrompt'
import { api } from '../lib/api'

const PRODUCT_TYPES = [
  { value: 'book', label: 'Book', icon: BookOpen },
  { value: 'course', label: 'Course', icon: GraduationCap },
  { value: 'guide', label: 'Guide', icon: Compass },
  { value: 'template', label: 'Template', icon: LayoutTemplate },
  { value: 'audio', label: 'Podcast / Audio', icon: Headphones },
  { value: 'digital', label: 'Digital product', icon: Download },
  { value: 'physical', label: 'Physical product', icon: Package },
  { value: 'other', label: 'Other', icon: Sparkles },
]

const EASE = [0.16, 1, 0.3, 1]

// Two small localStorage pointers — never a parallel data model. The
// Experience record created the moment a type is picked IS the draft; this
// is just "which one was I working on," plus a cache of in-progress pasted
// text (which has nowhere to live server-side until it's actually
// submitted as a Material).
const DRAFT_ID_KEY = 'sp_onboarding_experience_id'
const draftMaterialKey = (id) => `sp_onboarding_material_${id}`

function StepShell({ children }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <RevealMark size={32} variant="wordmark" animated animationState="idle" />
        </div>
        <AnimatePresence mode="wait">{children}</AnimatePresence>
      </div>
    </div>
  )
}

function Step({ stepKey, children }) {
  return (
    <motion.div
      key={stepKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="bg-paper border border-line rounded-2xl shadow-soft p-8"
    >
      {children}
    </motion.div>
  )
}

function defaultTitleFor(type) {
  const label = PRODUCT_TYPES.find((t) => t.value === type)?.label || 'Peek'
  return `My ${label}`
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState('loading') // loading | welcome | type | info | generating | error
  const [experienceId, setExperienceId] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', targetAudience: '', checkoutUrl: '' })
  const [materialText, setMaterialText] = useState('')
  const [materialFile, setMaterialFile] = useState(null)
  const [genMessage, setGenMessage] = useState('')
  const [error, setError] = useState('')
  const [limitError, setLimitError] = useState(null)

  const saveTimer = useRef(null)

  // Resume an in-progress draft, if one exists, on mount.
  useEffect(() => {
    const savedId = localStorage.getItem(DRAFT_ID_KEY)
    if (!savedId) {
      setStep('welcome')
      return
    }

    api.getExperience(savedId)
      .then(({ experience }) => {
        if (experience.sections?.length > 0) {
          // A previous attempt already finished generation — no reason to
          // redo onboarding, take them straight to the real editor.
          localStorage.removeItem(DRAFT_ID_KEY)
          navigate(`/dashboard/studio/${savedId}`, { replace: true })
          return
        }

        setExperienceId(savedId)
        setForm({
          title: experience.title,
          description: experience.description || '',
          targetAudience: experience.targetAudience || '',
          checkoutUrl: experience.checkoutUrl || '',
        })
        setMaterialText(localStorage.getItem(draftMaterialKey(savedId)) || '')
        setStep('info')
      })
      .catch(() => {
        // Draft was deleted or otherwise unreachable — start clean rather
        // than getting stuck.
        localStorage.removeItem(DRAFT_ID_KEY)
        setStep('welcome')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced persistence of whatever's in the form, straight onto the
  // real Experience record — the same endpoint the normal editor uses.
  function updateField(field, value) {
    const next = { ...form, [field]: value }
    setForm(next)

    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateExperience(experienceId, next).catch(() => {
        // A failed autosave here isn't fatal — the final submit re-sends
        // the full form and will surface any real problem then.
      })
    }, 600)
  }

  function updateMaterialText(value) {
    setMaterialText(value)
    localStorage.setItem(draftMaterialKey(experienceId), value)
  }

  async function selectType(type) {
    setError('')
    setLimitError(null)
    try {
      // Creating the draft the moment a real choice is made is what makes
      // this resumable — from here on, progress lives on the Experience
      // record itself, not in component state.
      const { experience } = await api.createExperience({
        title: defaultTitleFor(type),
        productType: type,
      })
      localStorage.setItem(DRAFT_ID_KEY, experience._id)
      setExperienceId(experience._id)
      setForm({ title: experience.title, description: '', targetAudience: '', checkoutUrl: '' })
      setStep('info')
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setError(err.message)
      setStep('error')
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setLimitError(null)
    setStep('generating')
    clearTimeout(saveTimer.current)

    try {
      setGenMessage('Saving your details…')
      await api.updateExperience(experienceId, form)

      let hasMaterial = false
      if (materialText.trim()) {
        setGenMessage('Reading what you gave us…')
        await api.createMaterial(experienceId, { type: 'pasted', name: 'Pasted content', content: materialText })
        hasMaterial = true
      }
      if (materialFile) {
        setGenMessage('Reading your file…')
        await api.uploadMaterial(experienceId, materialFile)
        hasMaterial = true
      }

      if (hasMaterial || form.description) {
        setGenMessage('Understanding your product…')
        await api.analyzeProduct(experienceId)
      }

      setGenMessage('Finding the strongest ideas…')
      await new Promise((r) => setTimeout(r, 400)) // lets that message actually be read before the next real call lands

      setGenMessage('Building your Peek…')
      await api.generateExperience(experienceId)

      localStorage.removeItem(DRAFT_ID_KEY)
      localStorage.removeItem(draftMaterialKey(experienceId))
      navigate(`/dashboard/studio/${experienceId}`)
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setError(err.message)
      setStep('error')
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <RevealMark size={32} animated animationState="thinking" />
      </div>
    )
  }

  return (
    <StepShell>
      {step === 'welcome' && (
        <Step stepKey="welcome">
          <h1 className="font-serif text-3xl text-ink mb-3">Let's create your first Peek.</h1>
          <p className="text-muted text-sm leading-relaxed mb-6">
            Sneaky Peek turns your product into a short, interactive preview — the step between
            someone finding you on social and landing on your checkout. We'll help you build one
            in a couple of minutes.
          </p>
          <Button variant="accent" onClick={() => setStep('type')} className="w-full">
            Get started
          </Button>
        </Step>
      )}

      {step === 'type' && (
        <Step stepKey="type">
          <h2 className="font-serif text-2xl text-ink mb-1">What are you sharing?</h2>
          <p className="text-muted text-sm mb-6">Pick whatever's closest — you can change this later.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {PRODUCT_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => selectType(value)}
                className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-line hover:border-ink hover:bg-surface transition-colors text-left"
              >
                <Icon size={16} className="text-accent shrink-0" />
                <span className="text-sm text-ink">{label}</span>
              </button>
            ))}
          </div>
        </Step>
      )}

      {step === 'info' && (
        <Step stepKey="info">
          <h2 className="font-serif text-2xl text-ink mb-1">Tell us about it</h2>
          <p className="text-muted text-sm mb-6">
            Just enough for the AI to get started — you'll refine everything after. Your progress saves as you go.
          </p>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              required
              autoFocus
            />
            <Textarea
              label="What is it, briefly?"
              rows={2}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
            <Input
              label="Who's it for? (optional)"
              value={form.targetAudience}
              onChange={(e) => updateField('targetAudience', e.target.value)}
            />
            <Input
              label="Checkout URL"
              type="url"
              placeholder="https://"
              value={form.checkoutUrl}
              onChange={(e) => updateField('checkoutUrl', e.target.value)}
              required
            />
            <Textarea
              label="Paste an excerpt or description (optional, but helps the AI a lot)"
              rows={3}
              value={materialText}
              onChange={(e) => updateMaterialText(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <Upload size={14} />
              {materialFile ? materialFile.name : 'Attach a PDF (optional)'}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setMaterialFile(e.target.files?.[0] || null)}
              />
            </label>

            <Button type="submit" variant="accent" className="mt-2">
              Create my Peek
            </Button>
          </form>
        </Step>
      )}

      {step === 'generating' && (
        <Step stepKey="generating">
          <div className="flex flex-col items-center text-center py-6">
            <RevealMark size={36} animated animationState="opening" />
            <p className="text-ink font-medium mt-5">{genMessage}</p>
            <p className="text-muted text-xs mt-1.5">This usually takes a few seconds.</p>
          </div>
        </Step>
      )}

      {step === 'error' && (
        <Step stepKey="error">
          {limitError ? (
            limitError.limitKey === 'aiGenerationsPerMonth' ? (
              <AiUpgradePrompt onDismiss={() => navigate('/dashboard')} />
            ) : (
              <UpgradePrompt error={limitError} />
            )
          ) : (
            <div className="text-center py-4">
              <RevealMark size={28} />
              <p className="font-serif text-xl text-ink mt-4 mb-2">Something went wrong</p>
              <p className="text-sm text-muted mb-6">{error}</p>
              <Button variant="accent" onClick={() => setStep(experienceId ? 'info' : 'welcome')}>
                Try again
              </Button>
            </div>
          )}
          <p className="text-xs text-muted text-center mt-4">
            Nothing is lost — your draft is saved. Come back any time to pick up where you left off.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs text-muted hover:text-ink underline block mx-auto mt-3"
          >
            Skip to dashboard
          </button>
        </Step>
      )}
    </StepShell>
  )
}
