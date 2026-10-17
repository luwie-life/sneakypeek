import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Sparkles, Copy, Check, QrCode, Archive, RotateCcw, Trash2 } from 'lucide-react'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DeliverablesManager from '../components/materials/DeliverablesManager'
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
  authorName: '',
  targetAudience: '',
  promise: '',
  keyBenefits: '',
  hook: '',
  checkoutUrl: '',
  ctaText: '',
  showOnStorefront: true,
  coverAsset: '',
}

function toForm(e) {
  return {
    title: e.title,
    productType: e.productType,
    description: e.description || '',
    authorName: e.authorName || '',
    targetAudience: e.targetAudience || '',
    promise: e.promise || '',
    keyBenefits: (e.keyBenefits || []).join('\n'),
    hook: e.hook || '',
    checkoutUrl: e.checkoutUrl || '',
    ctaText: e.ctaText || '',
    showOnStorefront: e.showOnStorefront !== false,
    coverAsset: e.coverAsset || '',
  }
}

function toPayload(form, isNew) {
  const { coverAsset, keyBenefits, ...rest } = form
  const payload = { ...rest, keyBenefits: keyBenefits.split('\n').map((s) => s.trim()).filter(Boolean) }
  if (!isNew) payload.coverAsset = coverAsset || null
  return payload
}

/** Client-side mirror of the server's publish rules so creators see what's missing first. */
function publishProblems(experience, form) {
  const problems = []
  if (!form.checkoutUrl?.trim()) problems.push('Add your checkout link (where buyers pay — Gumroad, Shopify, Selar, your site).')
  else if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(form.checkoutUrl.trim())) problems.push('The checkout link must start with https://')
  if (!(experience?.sections || []).some((s) => s.type !== 'cta' && (s.body || s.heading))) problems.push('Add at least one section in AI Studio.')
  return problems
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
  const [deliverables, setDeliverables] = useState([])
  const [confirm, setConfirm] = useState(null) // 'delete' | 'archive'
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    api
      .getExperience(id)
      .then(({ experience }) => {
        if (cancelled) return
        setExperience(experience)
        setForm(toForm(experience))
      })
      .catch((err) => setError(err.status === 404 ? 'This experience was not found.' : err.message))
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
        const { experience } = await api.createExperience(toPayload(form, true))
        navigate(`/dashboard/experiences/${experience._id}`, { replace: true })
        return
      }
      const { experience: updated } = await api.updateExperience(id, toPayload(form, false))
      setExperience(updated)
      setForm(toForm(updated))
      setDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setError(err.message)
      setSaveState('idle')
    }
  }

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  async function handlePublishToggle() {
    setPublishState('working')
    setError('')
    try {
      if (experience.status !== 'published') {
        const problems = publishProblems(experience, form)
        if (problems.length) {
          setError(problems.join(' '))
          return
        }
        // Publish what's on screen, not the last saved copy.
        if (dirty) {
          const { experience: saved } = await api.updateExperience(id, toPayload(form, false))
          setExperience(saved)
          setDirty(false)
        }
      }
      const { experience: updated } =
        experience.status === 'published' ? await api.unpublishExperience(id) : await api.publishExperience(id)
      setExperience(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishState('idle')
    }
  }

  async function handleArchiveToggle() {
    setError('')
    try {
      const { experience: updated } = experience.status === 'archived' ? await api.restoreExperience(id) : await api.archiveExperience(id)
      setExperience(updated)
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setError(err.message)
    }
  }

  async function handleDelete() {
    try {
      await api.deleteExperience(id)
      navigate('/dashboard/experiences', { replace: true })
    } catch (err) {
      setError(err.message)
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

      {experience?.status === 'archived' && (
        <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          This experience is archived. It isn't public and doesn't appear in your lists. Restore it to edit or publish again.
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input label="Title" value={form.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Select label="Product type" options={PRODUCT_TYPES} value={form.productType} onChange={(e) => update({ productType: e.target.value })} />
          <Input label="Creator / author name" value={form.authorName} maxLength={120} onChange={(e) => update({ authorName: e.target.value })} placeholder="Shown on the preview" />
        </div>
        <Textarea label="Short description — what is it?" rows={2} maxLength={2000} value={form.description} onChange={(e) => update({ description: e.target.value })} />
        <Input label="Target audience" value={form.targetAudience} maxLength={500} onChange={(e) => update({ targetAudience: e.target.value })} placeholder="Who is this for?" />
        <Input label="Product promise" value={form.promise} maxLength={1000} onChange={(e) => update({ promise: e.target.value })} placeholder="What does it deliver?" />
        <Textarea
          label="Key benefits — one per line"
          rows={3}
          value={form.keyBenefits}
          onChange={(e) => update({ keyBenefits: e.target.value })}
          placeholder={'Clear, practical chapters\nWorksheets for every step'}
        />
        <Textarea label="Hook — the first thing a visitor reads" rows={3} maxLength={300} value={form.hook} onChange={(e) => update({ hook: e.target.value })} placeholder="Give people a reason to keep looking…" />

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-5">
          <Input
            label="Checkout link (required to publish)"
            type="url"
            value={form.checkoutUrl}
            onChange={(e) => update({ checkoutUrl: e.target.value })}
            placeholder="https://"
          />
          <Input label="Button text" value={form.ctaText} maxLength={60} onChange={(e) => update({ ctaText: e.target.value })} placeholder="Get the book" />
        </div>
        <p className="-mt-3 text-xs text-muted">Buyers pay on your own checkout. Sneaky Peek never processes payments for your product.</p>

        {!isNew && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Cover image</span>
              <select
                value={form.coverAsset || ''}
                onChange={(e) => update({ coverAsset: e.target.value })}
                className="rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              >
                <option value="">No cover</option>
                {deliverables
                  .filter((d) => d.access === 'free' && d.mimeType?.startsWith('image/'))
                  .map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
              </select>
              <span className="text-xs text-muted">Upload an image marked Free under Files &amp; downloads.</span>
            </label>
            <label className="flex items-start gap-2.5 pt-7 text-sm text-ink">
              <input type="checkbox" checked={form.showOnStorefront} onChange={(e) => update({ showOnStorefront: e.target.checked })} className="mt-0.5 accent-[var(--sp-accent)]" />
              <span>
                Show on my storefront
                <span className="block text-xs text-muted">When published, list it on your creator page.</span>
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-accent-dim" role="alert">{error}</p>}
        {limitError && !isNew && <UpgradePrompt error={limitError} />}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={saveState === 'saving' || experience?.status === 'archived'}>
            {saveState === 'saving' ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}
          </Button>
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-accent-dim" role="status">
              <Check size={14} aria-hidden="true" /> Saved
            </span>
          )}
          {!isNew && experience?.status !== 'archived' && (
            <Button type="button" variant="accent" disabled={publishState === 'working'} onClick={handlePublishToggle}>
              {publishState === 'working'
                ? experience?.status === 'published' ? 'Unpublishing…' : 'Publishing…'
                : experience?.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          )}
          {!isNew && experience?.status !== 'archived' && (
            <Button type="button" variant="outline" icon={Sparkles} onClick={() => navigate(`/dashboard/studio/${id}`)}>
              Open in AI Studio
            </Button>
          )}
        </div>
      </form>

      {!isNew && experience?.status !== 'archived' && <ProductMaterials experienceId={id} />}
      {!isNew && experience?.status !== 'archived' && <DeliverablesManager experienceId={id} onChange={setDeliverables} />}

      {!isNew && experience && (
        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-line pt-6 text-sm">
          <button type="button" onClick={() => (experience.status === 'archived' ? handleArchiveToggle() : setConfirm('archive'))} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            {experience.status === 'archived' ? <RotateCcw size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
            {experience.status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button type="button" onClick={() => setConfirm('delete')} className="inline-flex items-center gap-1.5 text-muted hover:text-accent-dim">
            <Trash2 size={14} aria-hidden="true" /> Delete permanently
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'delete' ? 'Delete this experience?' : 'Archive this experience?'}
        description={
          confirm === 'delete'
            ? 'This permanently removes the experience, its files, and its analytics. This cannot be undone.'
            : 'Archiving unpublishes it and hides it from your lists. You can restore it later.'
        }
        confirmLabel={confirm === 'delete' ? 'Delete' : 'Archive'}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c === 'delete') handleDelete()
          else handleArchiveToggle()
        }}
      />

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
