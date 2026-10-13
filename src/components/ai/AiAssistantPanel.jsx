import { useState } from 'react'
import { Wand2, Scissors, Sparkles as SparklesIcon, MessageSquareText, Plus } from 'lucide-react'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'
import { GlassPanel } from '../ui/Card'

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
  onGenerate,
  sections,
  selectedIndex,
  onSelectSection,
  onSectionAction,
  onAddSuggested,
}) {
  const [tone, setTone] = useState('confident')

  const animationState =
    aiState === 'generating' ? 'opening' : aiState === 'thinking' ? 'thinking' : 'idle'

  return (
    <GlassPanel className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 mb-5">
        <RevealMark size={22} animated animationState={animationState} />
        <div>
          <p className="text-sm font-medium text-ink">AI assistant</p>
          <p className="text-xs text-muted">
            {aiState === 'generating' && 'Drafting your experience…'}
            {aiState === 'thinking' && 'Working on it…'}
            {aiState === 'error' && 'Something went wrong'}
            {(aiState === 'idle' || aiState === 'complete') && 'Ready'}
          </p>
        </div>
      </div>

      {errorMessage && (
        <p className="text-xs text-accent-dim bg-accent-soft rounded-lg px-3 py-2 mb-4">
          {errorMessage}
        </p>
      )}

      {!hasContent ? (
        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-sm text-muted">
            No draft yet. Generate a first structured experience from the product details you
            saved on this experience.
          </p>
          <Button
            variant="accent"
            icon={Wand2}
            disabled={aiState === 'generating'}
            onClick={onGenerate}
          >
            {aiState === 'generating' ? 'Generating…' : 'Generate experience'}
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-5">
          <Button
            variant="outline"
            size="sm"
            icon={Wand2}
            disabled={aiState === 'generating'}
            onClick={onGenerate}
          >
            {aiState === 'generating' ? 'Regenerating…' : 'Regenerate all'}
          </Button>

          <div>
            <p className="text-xs text-muted mb-2">Act on a section</p>
            <select
              value={selectedIndex}
              onChange={(e) => onSelectSection(Number(e.target.value))}
              className="w-full text-sm rounded-lg border border-line bg-paper px-3 py-2 mb-3"
            >
              {sections.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}. {s.heading || s.type}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              {SECTION_ACTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  disabled={aiState === 'thinking' || selectedIndex == null}
                  onClick={() => onSectionAction(key)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border border-line bg-paper hover:border-ink transition-colors disabled:opacity-40"
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="flex-1 text-xs rounded-lg border border-line bg-paper px-2 py-2"
              >
                {['confident', 'playful', 'warm', 'urgent', 'minimal'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                disabled={aiState === 'thinking' || selectedIndex == null}
                onClick={() => onSectionAction('tone', tone)}
                className="text-xs px-3 py-2 rounded-lg border border-line bg-paper hover:border-ink transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                Change tone
              </button>
            </div>
          </div>

          <button
            disabled={aiState === 'thinking'}
            onClick={onAddSuggested}
            className="flex items-center justify-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-dashed border-line text-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-40"
          >
            <Plus size={14} /> Suggest a new section
          </button>
        </div>
      )}
    </GlassPanel>
  )
}
