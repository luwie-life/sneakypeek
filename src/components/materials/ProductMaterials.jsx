import { useEffect, useRef, useState } from 'react'
import { FileText, Link as LinkIcon, Type, Upload, Trash2, RefreshCw, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { Card } from '../ui/Card'
import Button from '../ui/Button'
import { Textarea, Input } from '../ui/Input'
import MaterialStatusBadge from '../ui/MaterialStatusBadge'
import RevealMark from '../RevealMark'
import AiUpgradePrompt from '../billing/AiUpgradePrompt'

const TYPE_ICON = { pdf: FileText, url: LinkIcon, pasted: Type, text: Type, existing_description: Type }

function MaterialRow({ material, onRemove, onRetry, busy }) {
  const Icon = TYPE_ICON[material.type] || FileText
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <Icon size={15} className="text-muted shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink truncate">{material.name || material.source || 'Pasted content'}</p>
        {material.status === 'failed' && material.processingError && (
          <p className="text-xs text-accent-dim mt-0.5">{material.processingError}</p>
        )}
      </div>
      <MaterialStatusBadge status={material.status} />
      {material.status === 'failed' && (
        <button disabled={busy} onClick={onRetry} className="text-muted hover:text-ink disabled:opacity-40">
          <RefreshCw size={14} />
        </button>
      )}
      <button disabled={busy} onClick={onRemove} className="text-muted hover:text-accent-dim disabled:opacity-40">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function ProductMaterials({ experienceId }) {
  const [materials, setMaterials] = useState([])
  const [understanding, setUnderstanding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pasteText, setPasteText] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [limitError, setLimitError] = useState(null)
  const fileInputRef = useRef(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [{ materials }, { productUnderstanding }] = await Promise.all([
        api.listMaterials(experienceId),
        api.getProductUnderstanding(experienceId),
      ])
      setMaterials(materials)
      setUnderstanding(productUnderstanding?.generatedAt ? productUnderstanding : null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceId])

  async function handleAddText() {
    if (!pasteText.trim()) return
    setError('')
    try {
      await api.createMaterial(experienceId, { type: 'pasted', name: 'Pasted content', content: pasteText })
      setPasteText('')
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddUrl() {
    if (!urlInput.trim()) return
    setError('')
    try {
      await api.createMaterial(experienceId, { type: 'url', name: urlInput, url: urlInput })
      setUrlInput('')
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      await api.uploadMaterial(experienceId, file)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      e.target.value = ''
    }
  }

  async function handleRemove(materialId) {
    setBusyId(materialId)
    try {
      await api.deleteMaterial(experienceId, materialId)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRetry(materialId) {
    setBusyId(materialId)
    try {
      await api.reprocessMaterial(experienceId, materialId)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    setLimitError(null)
    try {
      const { productUnderstanding } = await api.analyzeProduct(experienceId)
      setUnderstanding(productUnderstanding)
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else if (err.aiBusy) setError('Another AI request from your account is still running. Try again in a moment.')
      else setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Card hover={false} className="mt-8">
      <h2 className="font-sans font-medium text-ink mb-1">Product material</h2>
      <p className="text-xs text-muted mb-5">
        Give the AI something real to work with — paste text, add a link, or upload a PDF.
      </p>

      {error && <p className="text-sm text-accent-dim mb-4">{error}</p>}

      {materials.length > 0 && (
        <div className="mb-5">
          {materials.map((m) => (
            <MaterialRow
              key={m._id}
              material={m}
              busy={busyId === m._id}
              onRemove={() => handleRemove(m._id)}
              onRetry={() => handleRetry(m._id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 mb-5">
        <Textarea
          rows={3}
          placeholder="Paste an excerpt, product description, or notes…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAddText} disabled={!pasteText.trim()}>
            Add text
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelected}
            className="hidden"
          />
          <Button variant="outline" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Upload PDF
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="https://your-product-page.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={handleAddUrl} disabled={!urlInput.trim()}>
            Add link
          </Button>
        </div>
      </div>

      {limitError ? (
        <AiUpgradePrompt trialUsed={Boolean(limitError.trialUsed)} monthlyLimit={!limitError.trialUsed && limitError.limit > 0} onDismiss={() => setLimitError(null)} />
      ) : (
        <>
          <Button
            variant="accent"
            size="sm"
            icon={Sparkles}
            disabled={analyzing}
            onClick={handleAnalyze}
          >
            {analyzing ? 'Analyzing…' : understanding ? 'Re-analyze product' : 'Analyze product'}
          </Button>

          {understanding && (
            <div className="mt-5 pt-5 border-t border-line">
              <div className="flex items-center gap-2 mb-3">
                <RevealMark size={18} />
                <h3 className="text-sm font-medium text-ink">What the AI understood</h3>
              </div>
              <p className="text-sm text-muted mb-3">{understanding.productSummary}</p>
              {understanding.keyInsights?.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {understanding.keyInsights.slice(0, 4).map((insight, i) => (
                    <li key={i} className="text-xs text-muted flex gap-2">
                      <span className="text-accent">•</span> {insight}
                    </li>
                  ))}
                </ul>
              )}
              {understanding.whatItContains?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-ink mb-1.5">What it contains</p>
                  <ul className="flex flex-col gap-1">
                    {understanding.whatItContains.slice(0, 6).map((x, i) => (
                      <li key={i} className="text-xs text-muted flex gap-2"><span className="text-accent">•</span> {x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {understanding.missingInformation?.length > 0 && (
                <div className="mt-4 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <p className="text-xs font-medium text-ink mb-1.5">Add these to get a better draft</p>
                  <ul className="flex flex-col gap-1">
                    {understanding.missingInformation.slice(0, 6).map((x, i) => (
                      <li key={i} className="text-xs text-muted flex gap-2"><span aria-hidden="true">–</span> {x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
