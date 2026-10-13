import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Sparkles, Copy, Check, QrCode } from 'lucide-react'
import QRCodeModal from '../components/sharing/QRCodeModal'
import { Input, Textarea } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import RevealMark from '../components/RevealMark'
import { api } from '../lib/api'
import UpgradePrompt from '../components/billing/UpgradePrompt'
import ProductMaterials from '../components/materials/ProductMaterials'

const PRODUCT_TYPES = [
  { value: 'book', label: 'Book' },
  { value: 'course', label: 'Course' },
  { value: 'guide', label: 'Guide' },
  { value: 'audio', label: 'Audio / Podcast' },
  { value: 'template', label: 'Template' },
  { value: 'digital', label: 'Digital asset' },
  { value: 'physical', label: 'Physical product' },
  { value: 'other', label: 'Other' },
]

const emptyForm = {
  title: '',
  productType: 'book',
  description: '',
  targetAudience: '',
  promise: '',
  hook: '',
  checkoutUrl: '',
}

function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — fail quietly, link is still visible/selectable.
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy public link"
      className="text-muted hover:text-ink transition-colors inline-flex items-center gap-1"
    >
      {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
    </button>
  )
}

export default function ExperienceEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()

  const [form, setForm] = useState(emptyForm)
  const [experience, setExperience] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [publishState, setPublishState] = useState('idle') // idle | working
  const [error, setError] = useState('')
  const [limitError, setLimitError] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    api
      .getExperience(id)
      .then(({ experience }) => {
        if (cancelled) return
        setExperience(experience)
        setForm({
          title: experience.title,
          productType: experience.productType,
          description: experience.description || '',
          targetAudience: experience.targetAudience || '',
          promise: experience.promise || '',
          hook: experience.hook || '',
          checkoutUrl: experience.checkoutUrl || '',
        })
      })
      .catch((err) => setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  async function handleSave(e) {
    e.preventDefault()
    setSaveState('saving')
    setError('')
    setLimitError(null)
    try {
      if (isNew) {
        const { experience } = await api.createExperience(form)
        navigate(`/dashboard/experiences/${experience._id}`, { replace: true })
        return
      }
      const { experience: updated } = await api.updateExperience(id, form)
      setExperience(updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setError(err.message)
      setSaveState('idle')
    }
  }

  async function handlePublishToggle() {
    setPublishState('working')
    setError('')
    try {
      const { experience: updated } =
        experience.status === 'published'
          ? await api.unpublishExperience(id)
          : await api.publishExperience(id)
      setExperience(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishState('idle')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RevealMark size={28} animated animationState="thinking" />
      </div>
    )
  }

  if (limitError && isNew) {
    return (
      <div className="max-w-2xl">
        <UpgradePrompt error={limitError} />
      </div>
    )
  }

  const publicUrl = experience ? `${window.location.origin}/p/${experience.slug}` : ''

  return (
    <div className="max-w-2xl">
      {experience && (
        <div className="flex items-center gap-3 mb-6">
          <StatusBadge status={experience.status} />
          {experience.status === 'published' ? (
            <div className="flex items-center gap-2 text-sm text-accent-dim">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="hover:underline">
                /p/{experience.slug}
              </a>
              <CopyLinkButton url={publicUrl} />
              <ExternalLink size={12} className="opacity-50" />
              <button
                onClick={() => setQrOpen(true)}
                aria-label="Show QR code"
                className="text-muted hover:text-ink"
              >
                <QrCode size={14} />
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">Not publicly visible yet</span>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <Select
          label="Product type"
          options={PRODUCT_TYPES}
          value={form.productType}
          onChange={(e) => setForm({ ...form, productType: e.target.value })}
        />
        <Textarea
          label="Short description — what is it?"
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Input
          label="Target audience"
          value={form.targetAudience}
          onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
          placeholder="Who is this for?"
        />
        <Input
          label="Product promise"
          value={form.promise}
          onChange={(e) => setForm({ ...form, promise: e.target.value })}
          placeholder="What does it deliver?"
        />
        <Textarea
          label="Hook — the first thing a visitor reads"
          rows={3}
          value={form.hook}
          onChange={(e) => setForm({ ...form, hook: e.target.value })}
          placeholder="Give people a reason to keep looking…"
        />
        <Input
          label="External checkout URL"
          type="url"
          value={form.checkoutUrl}
          onChange={(e) => setForm({ ...form, checkoutUrl: e.target.value })}
          placeholder="https://"
          required
        />

        {error && <p className="text-sm text-accent-dim" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}
          </Button>
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-accent-dim">
              <Check size={14} /> Saved
            </span>
          )}
          {!isNew && (
            <Button
              type="button"
              variant="accent"
              disabled={publishState === 'working'}
              onClick={handlePublishToggle}
            >
              {publishState === 'working'
                ? (experience?.status === 'published' ? 'Unpublishing…' : 'Publishing…')
                : (experience?.status === 'published' ? 'Unpublish' : 'Publish')}
            </Button>
          )}
          {!isNew && (
            <Button
              type="button"
              variant="outline"
              icon={Sparkles}
              onClick={() => navigate(`/dashboard/studio/${id}`)}
            >
              Open in AI Studio
            </Button>
          )}
        </div>
      </form>

      {!isNew && <ProductMaterials experienceId={id} />}

      {experience && (
        <QRCodeModal
          open={qrOpen}
          url={publicUrl}
          filename={`sneaky-peek-${experience.slug}`}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  )
}
