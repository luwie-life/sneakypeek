import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Plus, X, Check } from 'lucide-react'
import { api } from '../lib/api'
import { Input, Textarea } from '../components/ui/Input'
import Button from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import RevealMark from '../components/RevealMark'

export default function StorefrontSettings() {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [state, setState] = useState('idle') // idle | saving | saved
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])

  useEffect(() => {
    api
      .getStorefront()
      .then(({ storefront }) => {
        const f = { ...storefront, slug: storefront.slug || storefront.suggestedSlug || '' }
        setForm(f)
        setSaved(storefront)
      })
      .catch((err) => setError(err.message))
    api.listExperiences().then(({ experiences }) => setProducts(experiences || [])).catch(() => {})
  }, [])

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setState('idle')
  }

  async function save(extra = {}) {
    setState('saving')
    setError('')
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        displayName: form.displayName,
        headline: form.headline,
        bio: form.bio,
        accentColor: form.accentColor,
        links: form.links.filter((l) => l.url.trim()),
        ...extra,
      }
      const { storefront } = await api.updateStorefront(payload)
      setForm({ ...storefront })
      setSaved(storefront)
      setState('saved')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  if (!form) {
    return error ? (
      <p className="text-sm text-accent-dim" role="alert">{error}</p>
    ) : (
      <div className="flex justify-center py-16" role="status" aria-label="Loading">
        <RevealMark size={28} animated animationState="thinking" />
      </div>
    )
  }

  const live = saved?.published && saved?.slug
  const listed = products.filter((p) => p.status === 'published' && p.showOnStorefront !== false)

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-sm text-muted max-w-md">
          One page that lists all your published experiences, so visitors can explore everything you offer.
        </p>
        {live && (
          <a href={`/s/${saved.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-dim hover:underline">
            /s/{saved.slug} <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <Input
            label="Storefront address"
            value={form.slug}
            onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            placeholder="your-name"
            maxLength={40}
            aria-describedby="slug-help"
          />
          <p id="slug-help" className="mt-1.5 text-xs text-muted">
            {window.location.origin}/s/{form.slug || 'your-name'} · 3–40 lowercase letters, numbers or dashes.
          </p>
        </div>
        <Input label="Display name" value={form.displayName} maxLength={80} onChange={(e) => update({ displayName: e.target.value })} placeholder="How visitors should see you" />
        <Input label="Headline" value={form.headline} maxLength={140} onChange={(e) => update({ headline: e.target.value })} placeholder="Author of quiet, sea-salted novels" />
        <Textarea label="About" rows={4} value={form.bio} maxLength={1200} onChange={(e) => update({ bio: e.target.value })} />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-muted mb-1.5">Links (up to 5)</legend>
          {form.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={l.label}
                onChange={(e) => update({ links: form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                placeholder="Label"
                aria-label={`Link ${i + 1} label`}
                maxLength={40}
                className="w-1/3 rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={l.url}
                type="url"
                onChange={(e) => update({ links: form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                placeholder="https://"
                aria-label={`Link ${i + 1} URL`}
                className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="button" onClick={() => update({ links: form.links.filter((_, j) => j !== i) })} aria-label={`Remove link ${i + 1}`} className="p-2 text-muted hover:text-accent-dim">
                <X size={14} />
              </button>
            </div>
          ))}
          {form.links.length < 5 && (
            <button type="button" onClick={() => update({ links: [...form.links, { label: '', url: '' }] })} className="self-start inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              <Plus size={12} aria-hidden="true" /> Add link
            </button>
          )}
        </fieldset>

        <label className="flex items-center gap-3 text-sm text-ink">
          <span className="text-muted">Accent colour</span>
          <input type="color" value={form.accentColor || '#c2410c'} onChange={(e) => update({ accentColor: e.target.value })} className="h-8 w-10 rounded border border-line bg-paper" aria-label="Accent colour" />
          {form.accentColor && (
            <button type="button" onClick={() => update({ accentColor: '' })} className="text-xs text-muted hover:text-ink">Use default</button>
          )}
        </label>

        {error && <p className="text-sm text-accent-dim" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant={saved?.published ? 'outline' : 'accent'} disabled={state === 'saving'} onClick={() => save({ published: !saved?.published })}>
            {saved?.published ? 'Unpublish storefront' : 'Publish storefront'}
          </Button>
          {state === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-accent-dim" role="status"><Check size={14} aria-hidden="true" /> Saved</span>
          )}
        </div>
      </form>

      <Card hover={false} className="mt-10">
        <h2 className="font-medium text-ink mb-1">Listed products</h2>
        <p className="text-xs text-muted mb-4">Published experiences with "Show on my storefront" turned on.</p>
        {listed.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing listed yet. <Link to="/dashboard/experiences" className="text-ink underline-offset-2 hover:underline">Publish an experience</Link> to add it here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {listed.map((p) => (
              <li key={p._id} className="py-2.5 flex items-center justify-between text-sm">
                <span className="text-ink">{p.title}</span>
                <Link to={`/dashboard/experiences/${p._id}`} className="text-xs text-muted hover:text-ink">Edit</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
