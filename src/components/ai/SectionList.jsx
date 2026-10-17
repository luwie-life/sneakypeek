import { useState } from 'react'
import { ChevronUp, ChevronDown, X, Plus, Lock, Unlock, Scissors, ChevronRight } from 'lucide-react'
import { kindOf, labelOf, ADDABLE_TYPES, emptyDataFor, isSectionPublic } from '../../lib/sectionTypes'

const fieldCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft'

/**
 * The creator's structure editor. Every section shows its type, whether it
 * is free or locked, and where the free preview stops. Structured sections
 * (lists, steps, quizzes, FAQs, assets) get proper fields instead of a
 * single text box.
 */
export default function SectionList({
  sections,
  previewSettings,
  deliverables = [],
  selectedIndex,
  onSelect,
  onChange,
  onRemove,
  onReorder,
  onAdd,
  onPreviewSettingsChange,
}) {
  const [adding, setAdding] = useState(false)
  const [addType, setAddType] = useState('other')
  const stop = Number.isInteger(previewSettings?.stopAfterSection) ? previewSettings.stopAfterSection : null
  const publicCount = sections.filter((s, i) => s.type !== 'cta' && isSectionPublic(s, i, previewSettings)).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Structure</h3>
        <span className="text-xs text-muted">{publicCount} free · {sections.filter((s) => s.type !== 'cta').length - publicCount} locked</span>
      </div>

      <PreviewSettingsCard settings={previewSettings} onChange={onPreviewSettingsChange} hasStop={stop !== null} />

      {sections.length === 0 && <p className="text-xs text-muted">No sections yet. Generate a draft or add a section below.</p>}

      {sections.map((section, i) => {
        const isPublic = isSectionPublic(section, i, previewSettings)
        const afterStop = stop !== null && i > stop && section.type !== 'cta'
        return (
          <div key={section.id || i}>
            <SectionCard
              section={section}
              index={i}
              count={sections.length}
              isPublic={isPublic}
              afterStop={afterStop}
              isStop={stop === i}
              selected={selectedIndex === i}
              deliverables={deliverables}
              onSelect={() => onSelect?.(i)}
              onChange={(next) => onChange(i, next)}
              onRemove={() => onRemove(i)}
              onReorder={onReorder}
              onSetStop={() => onPreviewSettingsChange({ ...previewSettings, stopAfterSection: stop === i ? null : i })}
            />
            {stop === i && i < sections.length - 1 && (
              <div className="my-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-accent-dim" role="note">
                <span className="h-px flex-1 bg-accent/40" />
                Free preview ends here
                <span className="h-px flex-1 bg-accent/40" />
              </div>
            )}
          </div>
        )
      })}

      {adding ? (
        <div className="rounded-xl border border-line bg-paper p-3 flex flex-col gap-2">
          <label className="text-xs text-muted" htmlFor="add-section-type">Section type</label>
          <select id="add-section-type" value={addType} onChange={(e) => setAddType(e.target.value)} className={fieldCls}>
            {ADDABLE_TYPES.map((t) => (
              <option key={t} value={t}>{labelOf(t)}</option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted hover:text-ink px-2 py-1">Cancel</button>
            <button
              type="button"
              onClick={() => {
                onAdd({ type: addType, heading: '', body: '', visibility: 'free', data: emptyDataFor(addType) })
                setAdding(false)
              }}
              className="text-xs rounded-pill bg-ink text-paper px-3 py-1.5"
            >
              Add section
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={sections.length >= 30}
          className="flex items-center justify-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-dashed border-line text-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-40"
        >
          <Plus size={14} aria-hidden="true" /> Add section
        </button>
      )}
    </div>
  )
}

function PreviewSettingsCard({ settings = {}, onChange, hasStop }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-line bg-paper">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs text-muted hover:text-ink">
        <span>Free preview settings{hasStop ? ' · stopping point set' : ''}</span>
        <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <p className="text-xs text-muted leading-relaxed">
            Locked sections and everything after the stopping point are never sent to visitors' browsers. The call to action is always shown.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Message shown where the free preview ends</span>
            <input
              value={settings.lockedMessage || ''}
              maxLength={300}
              onChange={(e) => onChange({ ...settings, lockedMessage: e.target.value })}
              placeholder="The rest is in the full version."
              className={fieldCls}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={settings.showLockedHeadings !== false}
              onChange={(e) => onChange({ ...settings, showLockedHeadings: e.target.checked })}
              className="accent-[var(--sp-accent)]"
            />
            Show headings of locked sections as a teaser
          </label>
          {hasStop && (
            <button type="button" onClick={() => onChange({ ...settings, stopAfterSection: null })} className="self-start text-xs text-accent-dim hover:underline">
              Remove stopping point
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SectionCard({ section, index, count, isPublic, afterStop, isStop, selected, deliverables, onSelect, onChange, onRemove, onReorder, onSetStop }) {
  const kind = kindOf(section.type)
  const isCta = section.type === 'cta'
  const locked = section.visibility === 'locked'
  const set = (patch) => onChange({ ...section, ...patch })
  const setData = (patch) => onChange({ ...section, data: { ...(section.data || {}), ...patch } })

  return (
    <div
      onFocusCapture={onSelect}
      className={`rounded-xl border bg-paper p-3 transition-colors ${selected ? 'border-ink/40' : 'border-line'} ${!isPublic ? 'bg-surface' : ''}`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] uppercase tracking-wide text-accent-dim font-medium truncate">{labelOf(section.type)}</span>
          {!isPublic && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-line/60 px-1.5 py-0.5 text-[10px] text-muted">
              <Lock size={9} aria-hidden="true" /> {locked ? 'Locked' : 'After stop'}
            </span>
          )}
        </span>
        <div className="flex items-center shrink-0">
          {!isCta && (
            <button
              type="button"
              onClick={() => set({ visibility: locked ? 'free' : 'locked' })}
              aria-label={locked ? 'Make section free' : 'Lock section (full version only)'}
              aria-pressed={locked}
              title={locked ? 'Locked — click to make free' : 'Free — click to lock'}
              className="text-muted hover:text-ink p-1"
            >
              {locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          )}
          {!isCta && (
            <button
              type="button"
              onClick={onSetStop}
              aria-label={isStop ? 'Remove stopping point' : 'End the free preview after this section'}
              aria-pressed={isStop}
              title={isStop ? 'Free preview ends here — click to remove' : 'End free preview after this section'}
              className={`p-1 ${isStop ? 'text-accent-dim' : 'text-muted hover:text-ink'}`}
            >
              <Scissors size={14} />
            </button>
          )}
          <button type="button" disabled={index === 0} onClick={() => onReorder(index, index - 1)} aria-label="Move section up" className="text-muted hover:text-ink disabled:opacity-30 p-1">
            <ChevronUp size={14} />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onReorder(index, index + 1)} aria-label="Move section down" className="text-muted hover:text-ink disabled:opacity-30 p-1">
            <ChevronDown size={14} />
          </button>
          <button type="button" onClick={onRemove} aria-label="Remove section" className="text-muted hover:text-accent-dim p-1">
            <X size={14} />
          </button>
        </div>
      </div>

      <input
        value={section.heading || ''}
        onChange={(e) => set({ heading: e.target.value })}
        placeholder="Heading"
        aria-label="Section heading"
        maxLength={200}
        className="w-full text-sm font-medium text-ink bg-transparent outline-none mb-1.5 border-b border-transparent focus:border-line"
      />

      {['text', 'excerpt', 'cta', 'steps', 'pairs', 'download', 'list'].includes(kind) && (
        <textarea
          value={section.body || ''}
          onChange={(e) => set({ body: e.target.value })}
          rows={kind === 'excerpt' ? 8 : 3}
          aria-label={kind === 'excerpt' ? 'Excerpt text' : 'Section text'}
          placeholder={kind === 'excerpt' ? 'Paste the passage from your product exactly as written' : kind === 'list' ? 'Optional intro' : 'Text'}
          maxLength={kind === 'excerpt' ? 12000 : 3000}
          className="w-full resize-y bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
        />
      )}
      {kind === 'excerpt' && <p className="mt-1 text-[11px] text-muted">Excerpts should be your own words, copied from your product.</p>}

      {kind === 'list' && <ListEditor items={section.data?.items || []} onChange={(items) => setData({ items })} />}
      {kind === 'steps' && <StepsEditor steps={section.data?.steps || []} onChange={(steps) => setData({ steps })} />}
      {kind === 'pairs' && <PairsEditor pairs={section.data?.pairs || []} onChange={(pairs) => setData({ pairs })} />}
      {kind === 'faq' && <FaqEditor items={section.data?.items || []} onChange={(items) => setData({ items })} />}
      {kind === 'quiz' && <QuizEditor questions={section.data?.questions || []} onChange={(questions) => setData({ questions })} />}
      {kind === 'exercise' && (
        <div className="flex flex-col gap-2 mt-1">
          <textarea value={section.data?.prompt || ''} onChange={(e) => setData({ prompt: e.target.value })} rows={3} placeholder="What should the visitor try?" aria-label="Exercise prompt" className={fieldCls} />
          <input value={section.data?.placeholder || ''} onChange={(e) => setData({ placeholder: e.target.value })} placeholder="Answer box hint (optional)" aria-label="Answer box hint" className={fieldCls} />
        </div>
      )}
      {kind === 'cta' && (
        <input value={section.data?.buttonText || ''} onChange={(e) => setData({ buttonText: e.target.value })} maxLength={60} placeholder="Button text (the editor's Button text takes priority)" aria-label="Button text" className={`${fieldCls} mt-1`} />
      )}
      {kind === 'gallery' && <AssetPicker multiple deliverables={deliverables} value={section.data?.assetIds || []} onChange={(assetIds) => setData({ assetIds })} imagesOnly />}
      {kind === 'download' && <AssetPicker name={`asset-${section.id || index}`} deliverables={deliverables} value={section.data?.assetId ? [section.data.assetId] : []} onChange={(ids) => setData({ assetId: ids[0] || '' })} />}
      {afterStop && !locked && <p className="mt-2 text-[11px] text-muted">Hidden from visitors because it comes after the stopping point.</p>}
    </div>
  )
}

function Rows({ rows, onAdd, onRemove, render, addLabel, max = 20 }) {
  return (
    <div className="flex flex-col gap-2 mt-1">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <div className="flex-1 flex flex-col gap-1.5">{render(row, i)}</div>
          <button type="button" onClick={() => onRemove(i)} aria-label="Remove item" className="mt-2 text-muted hover:text-accent-dim p-0.5">
            <X size={13} />
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" onClick={onAdd} className="self-start text-xs text-muted hover:text-ink flex items-center gap-1">
          <Plus size={12} aria-hidden="true" /> {addLabel}
        </button>
      )}
    </div>
  )
}

const replaceAt = (arr, i, v) => arr.map((x, j) => (j === i ? v : x))
const removeAt = (arr, i) => arr.filter((_, j) => j !== i)

function ListEditor({ items, onChange }) {
  return (
    <Rows
      rows={items}
      addLabel="Add item"
      onAdd={() => onChange([...items, ''])}
      onRemove={(i) => onChange(removeAt(items, i))}
      render={(item, i) => <input value={item} onChange={(e) => onChange(replaceAt(items, i, e.target.value))} placeholder={`Item ${i + 1}`} aria-label={`Item ${i + 1}`} className={fieldCls} />}
    />
  )
}

function StepsEditor({ steps, onChange }) {
  return (
    <Rows
      rows={steps}
      max={8}
      addLabel="Add step"
      onAdd={() => onChange([...steps, { title: '', body: '' }])}
      onRemove={(i) => onChange(removeAt(steps, i))}
      render={(s, i) => (
        <>
          <input value={s.title} onChange={(e) => onChange(replaceAt(steps, i, { ...s, title: e.target.value }))} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1} title`} className={fieldCls} />
          <textarea value={s.body} onChange={(e) => onChange(replaceAt(steps, i, { ...s, body: e.target.value }))} rows={2} placeholder="Details" aria-label={`Step ${i + 1} details`} className={fieldCls} />
        </>
      )}
    />
  )
}

function PairsEditor({ pairs, onChange }) {
  return (
    <Rows
      rows={pairs}
      addLabel="Add row"
      onAdd={() => onChange([...pairs, { label: '', value: '' }])}
      onRemove={(i) => onChange(removeAt(pairs, i))}
      render={(p, i) => (
        <div className="grid grid-cols-2 gap-1.5">
          <input value={p.label} onChange={(e) => onChange(replaceAt(pairs, i, { ...p, label: e.target.value }))} placeholder="Label" aria-label={`Row ${i + 1} label`} className={fieldCls} />
          <input value={p.value} onChange={(e) => onChange(replaceAt(pairs, i, { ...p, value: e.target.value }))} placeholder="Value" aria-label={`Row ${i + 1} value`} className={fieldCls} />
        </div>
      )}
    />
  )
}

function FaqEditor({ items, onChange }) {
  return (
    <Rows
      rows={items}
      max={10}
      addLabel="Add question"
      onAdd={() => onChange([...items, { question: '', answer: '' }])}
      onRemove={(i) => onChange(removeAt(items, i))}
      render={(q, i) => (
        <>
          <input value={q.question} onChange={(e) => onChange(replaceAt(items, i, { ...q, question: e.target.value }))} placeholder="Question" aria-label={`Question ${i + 1}`} className={fieldCls} />
          <textarea value={q.answer} onChange={(e) => onChange(replaceAt(items, i, { ...q, answer: e.target.value }))} rows={2} placeholder="Answer" aria-label={`Answer ${i + 1}`} className={fieldCls} />
        </>
      )}
    />
  )
}

function QuizEditor({ questions, onChange }) {
  return (
    <Rows
      rows={questions}
      max={6}
      addLabel="Add question"
      onAdd={() => onChange([...questions, { question: '', options: ['', ''], answerIndex: 0, explanation: '' }])}
      onRemove={(i) => onChange(removeAt(questions, i))}
      render={(q, i) => (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
          <input value={q.question} onChange={(e) => onChange(replaceAt(questions, i, { ...q, question: e.target.value }))} placeholder="Question" aria-label={`Quiz question ${i + 1}`} className={fieldCls} />
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`answer-${i}`}
                checked={q.answerIndex === oi}
                onChange={() => onChange(replaceAt(questions, i, { ...q, answerIndex: oi }))}
                aria-label={`Mark option ${oi + 1} as correct`}
                className="accent-[var(--sp-accent)]"
              />
              <input value={opt} onChange={(e) => onChange(replaceAt(questions, i, { ...q, options: replaceAt(q.options, oi, e.target.value) }))} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} className={fieldCls} />
              {q.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => onChange(replaceAt(questions, i, { ...q, options: removeAt(q.options, oi), answerIndex: q.answerIndex === oi ? 0 : q.answerIndex > oi ? q.answerIndex - 1 : q.answerIndex }))}
                  aria-label="Remove option"
                  className="text-muted hover:text-accent-dim p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {q.options.length < 5 && (
            <button type="button" onClick={() => onChange(replaceAt(questions, i, { ...q, options: [...q.options, ''] }))} className="self-start text-xs text-muted hover:text-ink">
              + Option
            </button>
          )}
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={q.answerIndex === -1}
              onChange={(e) => onChange(replaceAt(questions, i, { ...q, answerIndex: e.target.checked ? -1 : 0 }))}
              className="accent-[var(--sp-accent)]"
            />
            No single right answer (reflection question)
          </label>
          <input value={q.explanation || ''} onChange={(e) => onChange(replaceAt(questions, i, { ...q, explanation: e.target.value }))} placeholder="Shown after answering (optional)" aria-label="Explanation" className={fieldCls} />
        </div>
      )}
    />
  )
}

function AssetPicker({ deliverables, value, onChange, multiple = false, imagesOnly = false, name = 'asset-picker' }) {
  const options = deliverables.filter((d) => d.access === 'free' && (!imagesOnly || d.mimeType?.startsWith('image/')))
  if (!options.length) {
    return (
      <p className="mt-1 text-xs text-muted">
        Upload a {imagesOnly ? 'free image' : 'file marked Free'} under Files &amp; downloads in the editor, then choose it here.
      </p>
    )
  }
  return (
    <fieldset className="mt-1 flex flex-col gap-1.5">
      <legend className="sr-only">Choose {multiple ? 'images' : 'a file'}</legend>
      {options.map((d) => {
        const checked = value.includes(d._id)
        return (
          <label key={d._id} className="flex items-center gap-2 text-xs text-ink">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={multiple ? undefined : name}
              checked={checked}
              onChange={() => {
                if (multiple) onChange(checked ? value.filter((v) => v !== d._id) : [...value, d._id].slice(0, 8))
                else onChange([d._id])
              }}
              className="accent-[var(--sp-accent)]"
            />
            <span className="truncate">{d.title}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
