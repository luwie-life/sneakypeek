import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Check } from 'lucide-react'
import { api } from '../lib/api'
import Button from '../components/ui/Button'
import RevealMark from '../components/RevealMark'
import SectionList from '../components/ai/SectionList'
import StudioPreview from '../components/ai/StudioPreview'
import AiAssistantPanel from '../components/ai/AiAssistantPanel'
import AiUpgradePrompt from '../components/billing/AiUpgradePrompt'

export default function AiStudio() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [experience, setExperience] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [aiState, setAiState] = useState('idle') // idle | generating | thinking | complete | error
  const [aiError, setAiError] = useState('')
  const [limitError, setLimitError] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [mobileTab, setMobileTab] = useState('preview') // structure | preview | assistant — mobile only, all three show at once on lg+

  useEffect(() => {
    let cancelled = false
    api
      .getExperience(id)
      .then(({ experience }) => !cancelled && setExperience(experience))
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  async function persistSections(nextSections, nextHook) {
    setSaveState('saving')
    try {
      const { experience: updated } = await api.updateExperience(id, {
        sections: nextSections,
        ...(nextHook !== undefined ? { hook: nextHook } : {}),
      })
      setExperience(updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch (err) {
      setAiError(err.message)
      setSaveState('idle')
    }
  }

  async function handleGenerate() {
    setAiState('generating')
    setAiError('')
    setLimitError(null)
    try {
      const { experience: updated } = await api.generateExperience(id)
      setExperience(updated)
      setSelectedIndex(0)
      setAiState('complete')
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setAiError(err.message)
      setAiState('error')
    }
  }

  async function handleSectionAction(action, tone) {
    setAiState('thinking')
    setAiError('')
    setLimitError(null)
    try {
      const { experience: updated } = await api.runSectionAction(id, selectedIndex, { action, tone })
      setExperience(updated)
      setAiState('complete')
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setAiError(err.message)
      setAiState('error')
    }
  }

  async function handleAddSuggested() {
    setAiState('thinking')
    setAiError('')
    setLimitError(null)
    try {
      const { experience: updated } = await api.suggestSection(id)
      setExperience(updated)
      setSelectedIndex(updated.sections.length - 1)
      setAiState('complete')
    } catch (err) {
      if (err.limitReached) setLimitError(err)
      else setAiError(err.message)
      setAiState('error')
    }
  }

  function handleManualChange(index, nextSection) {
    const nextSections = experience.sections.map((s, i) => (i === index ? nextSection : s))
    setExperience({ ...experience, sections: nextSections })
    persistSections(nextSections)
  }

  function handleRemove(index) {
    const nextSections = experience.sections.filter((_, i) => i !== index)
    setExperience({ ...experience, sections: nextSections })
    if (selectedIndex >= nextSections.length) setSelectedIndex(Math.max(0, nextSections.length - 1))
    persistSections(nextSections)
  }

  function handleReorder(from, to) {
    const next = [...experience.sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setExperience({ ...experience, sections: next })
    persistSections(next)
  }

  function handleAddManual() {
    const nextSections = [...experience.sections, { type: 'other', heading: '', body: '' }]
    setExperience({ ...experience, sections: nextSections })
    persistSections(nextSections)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <RevealMark size={32} animated animationState="thinking" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-accent-dim">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-line bg-paper gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => navigate('/dashboard/experiences')} className="text-muted hover:text-ink shrink-0" aria-label="Back to experiences">
            <ArrowLeft size={18} />
          </button>
          <RevealMark size={22} className="shrink-0 hidden sm:block" variant="wordmark" />
          <RevealMark size={20} className="shrink-0 sm:hidden" />
          <span className="text-muted hidden sm:inline">/</span>
          <span className="text-sm font-medium text-ink truncate">{experience.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted shrink-0">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-accent-dim">
              <Check size={13} />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          <Link to={`/dashboard/experiences/${id}`}>
            <Button variant="ghost" size="sm" icon={Save} aria-label="Back to editor">
              <span className="hidden sm:inline">Back to editor</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Mobile-only tab switcher — on lg+ all three panes show side by side instead */}
      <div className="flex lg:hidden border-b border-line bg-paper px-4">
        {[
          { key: 'structure', label: 'Structure' },
          { key: 'preview', label: 'Preview' },
          { key: 'assistant', label: 'AI Assistant' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMobileTab(tab.key)}
            className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${
              mobileTab === tab.key ? 'border-accent text-ink font-medium' : 'border-transparent text-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4 p-4 min-h-0">
        <div className={`${mobileTab === 'structure' ? 'block' : 'hidden'} lg:block overflow-y-auto pr-1`}>
          <SectionList
            sections={experience.sections || []}
            onChange={handleManualChange}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onAddManual={handleAddManual}
          />
        </div>

        <div className={`${mobileTab === 'preview' ? 'block' : 'hidden'} lg:block min-h-0`}>
          <StudioPreview experience={experience} />
        </div>

        <div className={`${mobileTab === 'assistant' ? 'block' : 'hidden'} lg:block min-h-0`}>
          {limitError ? (
            <AiUpgradePrompt onDismiss={() => setLimitError(null)} />
          ) : (
            <AiAssistantPanel
              hasContent={(experience.sections || []).length > 0}
              aiState={aiState}
              errorMessage={aiError}
              onGenerate={handleGenerate}
              sections={experience.sections || []}
              selectedIndex={selectedIndex}
              onSelectSection={setSelectedIndex}
              onSectionAction={handleSectionAction}
              onAddSuggested={handleAddSuggested}
            />
          )}
        </div>
      </div>
    </div>
  )
}
