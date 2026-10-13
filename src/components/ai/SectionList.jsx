import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import Button from '../ui/Button'
import { Textarea } from '../ui/Input'

export default function SectionList({ sections, onChange, onRemove, onReorder, onAddManual }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Structure</h3>
        <button
          onClick={onAddManual}
          className="text-xs text-muted hover:text-ink flex items-center gap-1"
        >
          <Plus size={13} /> Add blank
        </button>
      </div>

      {sections.length === 0 && (
        <p className="text-xs text-muted italic">No sections yet.</p>
      )}

      {sections.map((section, i) => (
        <div key={i} className="rounded-xl border border-line bg-paper p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-accent-dim font-medium">
              {section.type?.replace(/_/g, ' ') || 'section'}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={i === 0}
                onClick={() => onReorder(i, i - 1)}
                aria-label="Move section up"
                className="text-muted hover:text-ink disabled:opacity-30 p-1"
              >
                <ChevronUp size={14} />
              </button>
              <button
                disabled={i === sections.length - 1}
                onClick={() => onReorder(i, i + 1)}
                aria-label="Move section down"
                className="text-muted hover:text-ink disabled:opacity-30 p-1"
              >
                <ChevronDown size={14} />
              </button>
              <button onClick={() => onRemove(i)} aria-label="Remove section" className="text-muted hover:text-accent-dim p-1">
                <X size={14} />
              </button>
            </div>
          </div>
          <input
            value={section.heading || ''}
            onChange={(e) => onChange(i, { ...section, heading: e.target.value })}
            placeholder="Heading"
            className="w-full text-sm font-medium text-ink bg-transparent outline-none mb-1.5 border-b border-transparent focus:border-line"
          />
          <Textarea
            value={section.body || ''}
            onChange={(e) => onChange(i, { ...section, body: e.target.value })}
            rows={3}
            className="text-sm !border-0 !p-0 !rounded-none focus:!ring-0"
          />
        </div>
      ))}
    </div>
  )
}
