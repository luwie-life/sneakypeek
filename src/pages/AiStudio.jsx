import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Check, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import Button from '../components/ui/Button'
import RevealMark from '../components/RevealMark'
import SectionList from '../components/ai/SectionList'
import StudioPreview from '../components/ai/StudioPreview'
import AiAssistantPanel from '../components/ai/AiAssistantPanel'
import AiUpgradePrompt from '../components/billing/AiUpgradePrompt'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const SAVE_DELAY_MS = 700

function trialMessage(sub, experienceId) {
  if (!sub || sub.effectivePlan?.slug !== 'free') return ''
  const t = sub.usage?.aiTrial
  if (!t?.available) return ''
  if (t.experience && t.experience !== experienceId) return 'Your free AI trial was used on another experience. You can still edit by hand or use a starter draft.'
  if (t.generateUsed) return 'Free AI trial used. You can keep editing by hand, or upgrade for more AI help.'
  return `Free trial: one AI analysis and one AI-generated draft for one experience${t.analyzeUsed ? ' (analysis used)' : ''}.`
}

export default function AiStudio() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [experience, setExperience] = useState(null)
  const [deliverables, setDeliverables] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [aiState, setAiState] = useState('idle')
  const [aiError, setAiError] = useState('')
  const [notes, setNotes] = useState([])
  const [limitError, setLimitError] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirm, setConfirm] = useState(null) // { kind: 'regenerate' | 'starter' }

  const [saveState, setSaveState] = useState('idle') // idle | pending | saving | saved | error
  const [saveError, setSaveError] = useState('')
  const [mobileTab, setMobileTab] = useState('structure')

  // Debounced autosave: local edits update the UI immediately; the latest
  // version is sent once typing pauses (previously every keystroke was a PUT).
  const pending = useRef(null)
  const timer = useRef(null)
  const version = useRef(0)
  const inflight = useRef(null)

  const refreshSubscription = useCallback(() => {
    api.getSubscription().then(setSubscription).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getExperience(id), api.listDeliverables(id).catch(() => ({ deliverables: [] }))])
      .then(([{ experience }, { deliverables }]) => {
        if (cancelled) return
        setExperience(experience)
        setDeliverables(deliverables || [])
      })
      .catch((err) => !cancelled && setLoadError(err.status === 404 ? 'This experience was not found.' : err.message))
      .finally(() => !cancelled && setLoading(false))
    refreshSubscription()
    return () => {
      cancelled = true
    }
  }, [id, refreshSubscription])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (inflight.current) await inflight.current.catch(() => {})
    const patch = pending.current
    if (!patch) return
    pending.current = null
    const sentVersion = version.current
    setSaveState('saving')
    const p = api
      .updateExperience(id, patch)
      .then(({ experience: updated }) => {
        // Only adopt the server copy if nothing changed locally meanwhile.
        if (version.current === sentVersion) setExperience(updated)
        setSaveState(pending.current ? 'pending' : 'saved')
        setSaveError('')
      })
      .catch((err) => {
        // Keep the unsaved patch so the next edit or retry sends it again.
        pending.current = { ...patch, ...(pending.current || {}) }
        setSaveState('error')
        setSaveError(err.message)
      })
      .finally(() => {
        inflight.current = null
      })
    inflight.current = p
    await p
  }, [id])

  function schedule(patch) {
    version.current += 1
    pending.current = { ...(pending.current || {}), ...patch }
    setSaveState('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  useEffect(() => {
    const warn = (e) => {
      if (pending.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (pending.current) flush()
    }
  }, [flush])

  function updateSections(nextSections, extra = {}) {
    setExperience((prev) => ({ ...prev, sections: nextSections, ...extra }))
    schedule({ sections: nextSections, ...extra })
  }

  function handlePreviewSettings(next) {
    const clean = { ...next }
    setExperience((prev) => ({ ...prev, previewSettings: clean }))
    schedule({ previewSettings: clean })
  }

  function handleAiError(err) {
    if (err.limitReached) setLimitError(err)
    else if (err.aiBusy) setAiError('Another AI request from your account is still running. Wait a moment and try again.')
    else if (err.maintenance) setAiError('Sneaky Peek is undergoing maintenance. Try again shortly.')
    else setAiError(err.message)
    setAiState('error')
  }

  async function runAi(fn) {
    setAiError('')
    setLimitError(null)
    await flush()
    try {
      await fn()
      setAiState('complete')
    } catch (err) {
      handleAiError(err)
    } finally {
      refreshSubscription()
    }
  }

  function doGenerate() {
    setAiState('generating')
    return runAi(async () => {
      const res = await api.generateExperience(id)
      version.current += 1
      setExperience(res.experience)
      setSelectedIndex(0)
      setNotes(res.notes || [])
      if (res.fallback) setAiError('AI was unavailable, so a starter draft was created from your details. Nothing was charged.')
    })
  }

  function handleGenerate() {
    if ((experience.sections || []).length > 0) setConfirm({ kind: 'regenerate' })
    else doGenerate()
  }

  async function doStarterDraft(replace) {
    setAiState('thinking')
    setAiError('')
    await flush()
    try {
      const res = await api.starterDraft(id, replace)
      version.current += 1
      setExperience(res.experience)
      setNotes(res.notes || [])
      setLimitError(null)
      setAiState('complete')
    } catch (err) {
      if (err.data?.confirmReplace) setConfirm({ kind: 'starter' })
      else handleAiError(err)
      setAiState('idle')
    }
  }

  function handleSectionAction(action, tone) {
    setAiState('thinking')
    return runAi(async () => {
      const { experience: updated } = await api.runSectionAction(id, selectedIndex, { action, tone })
      version.current += 1
      setExperience(updated)
    })
  }

  function handleAddSuggested() {
    setAiState('thinking')
    return runAi(async () => {
      const { experience: updated } = await api.suggestSection(id)
      version.current += 1
      setExperience(updated)
      const ctaIndex = updated.sections.findIndex((s) => s.type === 'cta')
      setSelectedIndex(ctaIndex > 0 ? ctaIndex - 1 : updated.sections.length - 1)
    })
  }

  function adjustStop(nextSections, removedIndex, movedFrom, movedTo) {
    const ps = experience.previewSettings || {}
    let stop = Number.isInteger(ps.stopAfterSection) ? ps.stopAfterSection : null
    if (stop === null) return undefined
    if (removedIndex !== undefined && removedIndex <= stop) stop = Math.max(0, stop - 1)
    if (movedFrom !== undefined) {
      if (movedFrom === stop) stop = movedTo
      else if (movedFrom < stop && movedTo >= stop) stop -= 1
      else if (movedFrom > stop && movedTo <= stop) stop += 1
    }
    if (stop >= nextSections.length) stop = nextSections.length ? nextSections.length - 1 : null
    return { ...ps, stopAfterSection: stop }
  }

  function handleManualChange(index, nextSection) {
    updateSections(experience.sections.map((s, i) => (i === index ? nextSection : s)))
  }

  function handleRemove(index) {
    const next = experience.sections.filter((_, i) => i !== index)
    const ps = adjustStop(next, index)
    if (selectedIndex >= next.length) setSelectedIndex(Math.max(0, next.length - 1))
    updateSections(next, ps ? { previewSettings: ps } : {})
  }

  function handleReorder(from, to) {
    const next = [...experience.sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ps = adjustStop(next, undefined, from, to)
    setSelectedIndex(to)
    updateSections(next, ps ? { previewSettings: ps } : {})
  }

  function handleAdd(section) {
    const sections = [...(experience.sections || [])]
    const ctaIndex = sections.findIndex((s) => s.type === 'cta')
    const at = section.type !== 'cta' && ctaIndex >= 0 ? ctaIndex : sections.length
    sections.splice(at, 0, section)
    setSelectedIndex(at)
    updateSections(sections)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center" role="status" aria-label="Loading">
        <RevealMark size={32} animated animationState="thinking" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink">{loadError}</p>
        <Link to="/dashboard/experiences" className="text-sm text-muted hover:text-ink underline-offset-2 hover:underline">Back to experiences</Link>
      </div>
    )
  }

  const sections = experience.sections || []

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-line bg-paper gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={async () => {
              await flush()
              navigate('/dashboard/experiences')
            }}
            className="text-muted hover:text-ink shrink-0"
            aria-label="Back to experiences"
          >
            <ArrowLeft size={18} />
          </button>
          <RevealMark size={22} className="shrink-0 hidden sm:block" variant="wordmark" />
          <RevealMark size={20} className="shrink-0 sm:hidden" />
          <span className="text-muted hidden sm:inline">/</span>
          <span className="text-sm font-medium text-ink truncate">{experience.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted shrink-0" aria-live="polite">
          {(saveState === 'pending' || saveState === 'saving') && 'Saving…'}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-accent-dim">
              <Check size={13} aria-hidden="true" />
              <span className="hidden sm:inline">All changes saved</span>
            </span>
          )}
          {saveState === 'error' && (
            <button onClick={flush} className="flex items-center gap-1 text-accent-dim" title={saveError}>
              <AlertCircle size={13} aria-hidden="true" /> Not saved — retry
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={Save}
            aria-label="Back to editor"
            onClick={async () => {
              await flush()
              navigate(`/dashboard/experiences/${id}`)
            }}
          >
            <span className="hidden sm:inline">Back to editor</span>
          </Button>
        </div>
      </header>

      <div className="flex lg:hidden border-b border-line bg-paper px-4" role="tablist">
        {[
          { key: 'structure', label: 'Structure' },
          { key: 'preview', label: 'Preview' },
          { key: 'assistant', label: 'AI Assistant' },
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={mobileTab === tab.key}
            onClick={() => setMobileTab(tab.key)}
            className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${mobileTab === tab.key ? 'border-accent text-ink font-medium' : 'border-transparent text-muted'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-4 p-4 min-h-0 lg:h-[calc(100vh-65px)]">
        <div className={`${mobileTab === 'structure' ? 'block' : 'hidden'} lg:block overflow-y-auto pr-1`}>
          <SectionList
            sections={sections}
            previewSettings={experience.previewSettings || {}}
            deliverables={deliverables}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onChange={handleManualChange}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onAdd={handleAdd}
            onPreviewSettingsChange={handlePreviewSettings}
          />
        </div>

        <div className={`${mobileTab === 'preview' ? 'block' : 'hidden'} lg:block min-h-[60vh] lg:min-h-0`}>
          <StudioPreview experience={experience} deliverables={deliverables} />
        </div>

        <div className={`${mobileTab === 'assistant' ? 'block' : 'hidden'} lg:block min-h-0`}>
          {limitError ? (
            <AiUpgradePrompt
              trialUsed={Boolean(limitError.trialUsed)}
              monthlyLimit={!limitError.trialUsed && limitError.limit > 0}
              onStarterDraft={sections.length === 0 ? () => doStarterDraft(false) : undefined}
              onDismiss={() => setLimitError(null)}
            />
          ) : (
            <AiAssistantPanel
              hasContent={sections.length > 0}
              aiState={aiState}
              errorMessage={aiError}
              notes={notes}
              trial={trialMessage(subscription, id)}
              onGenerate={handleGenerate}
              onStarterDraft={() => doStarterDraft(false)}
              sections={sections}
              selectedIndex={selectedIndex}
              onSelectSection={setSelectedIndex}
              onSectionAction={handleSectionAction}
              onAddSuggested={handleAddSuggested}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'regenerate' ? 'Replace all sections?' : 'Replace with a starter draft?'}
        description={
          confirm?.kind === 'regenerate'
            ? 'Regenerating replaces every section, including your edits. This uses one AI generation.'
            : 'This replaces your current sections with a simple draft built from your product details.'
        }
        confirmLabel="Replace"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const kind = confirm.kind
          setConfirm(null)
          if (kind === 'regenerate') doGenerate()
          else doStarterDraft(true)
        }}
      />
    </div>
  )
}
