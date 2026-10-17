import { useState } from 'react'
import { Wand2, Scissors, Sparkles as SparklesIcon, MessageSquareText, Plus, FileText } from 'lucide-react'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'
import { GlassPanel } from '../ui/Card'
import { kindOf } from '../../lib/sectionTypes'

const SECTION_ACTIONS = [
  { key: 'rewrite', label: 'Rewrite', icon: Wand2 },
  { key: 'shorten', label: 'Shorten', icon: Scissors },
  { key: 'compelling', label: 'More compelling', icon: SparklesIcon },
  { key: 'improve_cta', label: 'Improve CTA', icon: MessageSquareText },
]

export default function AiAssistantPanel({
  hasContent,
  aiState, // 'idle' | 'generating' | 'thinking' | 'complete' | 'error'
  errorMessage,
  notes = [],
  trial,
  onGenerate,
  onStarterDraft,
  sections,
  selectedIndex,
  onSelectSection,
  onSectionAction,
  onAddSuggested,
}) {
  const [tone, setTone] = useState('confident')
  const busy = aiState === 'generating' || aiState === 'thinking'
  const animationState = aiState === 'generating' ? 'opening' : aiState === 'thinking' ? 'thinking' : 'idle'
  const selected = sections[selectedIndex]
  const isExcerpt = selected && kindOf(selected.type) === 'excerpt'
  const isStructured = selected && !['text', 'excerpt', 'cta'].includes(kindOf(selected.type))

  return (
    <GlassPanel className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 mb-5">
        <RevealMark size={22} animated animationState={animationState} />
        <div>
          <p className="text-sm font-medium text-ink">AI assistant</p>
          <p className="text-xs text-muted" role="status" aria-live="polite">
            {aiState === 'generating' && 'Drafting your experience — this can take up to a minute…'}
            {aiState === 'thinking' && 'Working on it…'}
            {aiState === 'error' && 'Something went wrong'}
            {(aiState === 'idle' || aiState === 'complete') && 'Ready'}
          </p>
        </div>
      </div>

      {trial && (
        <p className="text-xs text-muted bg-paper border border-line rounded-lg px-3 py-2 mb-4">{trial}</p>
      )}

      {errorMessage && (
        <p className="text-xs text-accent-dim bg-accent-soft rounded-lg px-3 py-2 mb-4" role="alert">{errorMessage}</p>
      )}

      {notes.length > 0 && (
        <div className="text-xs text-ink bg-paper border border-line rounded-lg px-3 py-2 mb-4">
          <p className="font-medium mb-1">Before you publish</p>
          <ul className="list-disc pl-4 space-y-0.5 text-muted">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      {!hasContent ? (
        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-sm text-muted">
            No draft yet. Generate a structured experience from your product details and the material you added, or start from a simple draft built only from your details.
          </p>
          <Button variant="accent" icon={Wand2} disabled={busy} onClick={onGenerate}>
            {aiState === 'generating' ? 'Generating…' : 'Generate with AI'}
          </Button>
          <Button variant="outline" size="sm" icon={FileText} disabled={busy} onClick={onStarterDraft}>
            Starter draft (no AI)
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-5">
          <Button variant="outline" size="sm" icon={Wand2} disabled={busy} onClick={onGenerate}>
            {aiState === 'generating' ? 'Regenerating…' : 'Regenerate all'}
          </Button>

          <div>
            <label htmlFor="ai-section-select" className="block text-xs text-muted mb-2">Act on a section</label>
            <select
              id="ai-section-select"
              value={selectedIndex}
              onChange={(e) => onSelectSection(Number(e.target.value))}
              className="w-full text-sm rounded-lg border border-line bg-paper px-3 py-2 mb-3"
            >
              {sections.map((s, i) => (
                <option key={s.id || i} value={i}>
                  {i + 1}. {s.heading || s.type?.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            {isExcerpt ? (
              <p className="text-xs text-muted">Excerpts stay in your own words, so AI won't rewrite them. Edit the passage directly instead.</p>
            ) : (
              <>
                {isStructured && <p className="text-xs text-muted mb-2">AI actions change the heading and text of this section; its items stay as you set them.</p>}
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_ACTIONS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={busy || selectedIndex == null}
                      onClick={() => onSectionAction(key)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border border-line bg-paper hover:border-ink transition-colors disabled:opacity-40"
                    >
                      <Icon size={13} aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <label htmlFor="ai-tone" className="sr-only">Tone</label>
                  <select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)} className="flex-1 text-xs rounded-lg border border-line bg-paper px-2 py-2">
                    {['confident', 'playful', 'warm', 'urgent', 'minimal'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || selectedIndex == null}
                    onClick={() => onSectionAction('tone', tone)}
                    className="text-xs px-3 py-2 rounded-lg border border-line bg-paper hover:border-ink transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    Change tone
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onAddSuggested}
            className="flex items-center justify-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-dashed border-line text-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-40"
          >
            <Plus size={14} aria-hidden="true" /> Suggest a new section
          </button>
        </div>
      )}
    </GlassPanel>
  )
}
