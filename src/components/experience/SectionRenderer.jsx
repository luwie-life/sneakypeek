import { useState } from 'react'
import { Lock, Download, FileText, Check, ArrowRight } from 'lucide-react'
import { kindOf, labelOf, formatBytes } from '../../lib/sectionTypes'

/**
 * Renders one section for visitors (and for the creator's live preview).
 * Accepts the PUBLIC section shape from the server (locked sections arrive
 * as placeholders with no body/data). `size="sm"` is the compact preview.
 */
export default function SectionRenderer({ section, size = 'lg', onInteraction, cta, preview = false }) {
  const kind = kindOf(section.type)
  const h2 = size === 'sm' ? 'font-serif text-xl text-ink mb-2' : 'font-serif text-2xl md:text-[1.7rem] text-ink mb-3 leading-snug'
  const bodyCls = size === 'sm' ? 'text-sm text-muted leading-relaxed whitespace-pre-line' : 'text-[1.05rem] text-muted leading-relaxed whitespace-pre-line'

  if (section.locked) return <LockedSection section={section} size={size} />

  const heading = section.heading ? <h2 className={h2}>{section.heading}</h2> : null
  const d = section.data || {}

  switch (kind) {
    case 'excerpt':
      return (
        <div>
          {heading}
          <blockquote className={`border-l-2 border-accent/60 pl-5 font-serif ${size === 'sm' ? 'text-[0.95rem]' : 'text-lg'} text-ink/90 leading-[1.8] whitespace-pre-line`}>
            {section.body}
          </blockquote>
          {d.source && <p className="mt-3 text-xs uppercase tracking-widest text-muted">{d.source}</p>}
        </div>
      )
    case 'list':
      return (
        <div>
          {heading}
          {d.items?.length ? (
            <ul className="space-y-2.5">
              {d.items.map((item, i) => (
                <li key={i} className={`flex gap-3 ${size === 'sm' ? 'text-sm' : ''} text-ink/85`}>
                  <Check size={16} className="text-accent mt-1 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={bodyCls}>{section.body}</p>
          )}
        </div>
      )
    case 'steps':
      return (
        <div>
          {heading}
          {section.body && <p className={`${bodyCls} mb-4`}>{section.body}</p>}
          <ol className="space-y-4">
            {(d.steps || []).map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-xs font-medium text-ink">{i + 1}</span>
                <div>
                  {step.title && <p className="font-medium text-ink">{step.title}</p>}
                  {step.body && <p className={`${size === 'sm' ? 'text-sm' : ''} text-muted leading-relaxed`}>{step.body}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )
    case 'quiz':
      return <Quiz section={section} heading={heading} size={size} onInteraction={onInteraction} />
    case 'exercise':
      return <Exercise section={section} heading={heading} size={size} onInteraction={onInteraction} />
    case 'pairs':
      return (
        <div>
          {heading}
          {section.body && <p className={`${bodyCls} mb-4`}>{section.body}</p>}
          <dl className="divide-y divide-line rounded-xl border border-line">
            {(d.pairs || []).map((p, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3">
                <dt className="text-sm font-medium text-ink">{p.label}</dt>
                <dd className="sm:col-span-2 text-sm text-muted whitespace-pre-line">{p.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )
    case 'faq':
      return (
        <div>
          {heading}
          <div className="divide-y divide-line border-y border-line">
            {(d.items || []).map((item, i) => (
              <details key={i} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded">
                  {item.question}
                  <span className="text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className={`mt-2 ${size === 'sm' ? 'text-sm' : ''} text-muted leading-relaxed whitespace-pre-line`}>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )
    case 'gallery':
      return (
        <div>
          {heading}
          <div className={`grid gap-3 ${(d.images || []).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {(d.images || []).map((img) => (
              <figure key={img.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                {img.url ? (
                  <img src={img.url} alt={img.title || ''} loading="lazy" className="w-full h-auto object-cover" />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center text-xs text-muted p-4 text-center">{img.title || 'Image'}</div>
                )}
              </figure>
            ))}
          </div>
        </div>
      )
    case 'download': {
      const asset = d.asset
      if (!asset) return null
      return (
        <div>
          {heading}
          {section.body && <p className={`${bodyCls} mb-4`}>{section.body}</p>}
          <FileCard asset={asset} preview={preview} />
        </div>
      )
    }
    case 'cta':
      return cta ? cta(section) : null
    default:
      return (
        <div>
          {heading}
          {section.body && <p className={bodyCls}>{section.body}</p>}
        </div>
      )
  }
}

export function FileCard({ asset, preview = false }) {
  const isFree = asset.access === 'free' && asset.url
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface border border-line">
        {isFree ? <FileText size={18} className="text-ink" aria-hidden="true" /> : <Lock size={16} className="text-muted" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{asset.title}</span>
        <span className="block text-xs text-muted">
          {isFree ? `Free download${asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ''}` : 'Included with purchase'}
        </span>
      </span>
      {isFree && <Download size={16} className="text-muted" aria-hidden="true" />}
    </>
  )
  const cls = 'flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left transition-colors'
  if (isFree && !preview) {
    const sid = (() => {
      try {
        return sessionStorage.getItem('sp_session') || ''
      } catch {
        return ''
      }
    })()
    return (
      <a href={`${asset.url}?download=1${sid ? `&sid=${encodeURIComponent(sid)}` : ''}`} className={`${cls} hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`} download>
        {content}
      </a>
    )
  }
  return <div className={cls}>{content}</div>
}

function LockedSection({ section, size }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6">
      <div className="flex items-start gap-3">
        <Lock size={16} className="text-muted mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1">{section.label || labelOf(section.type)} · in the full version</p>
          {section.heading ? (
            <p className={`font-serif ${size === 'sm' ? 'text-lg' : 'text-xl'} text-ink/70`}>{section.heading}</p>
          ) : (
            <p className="text-sm text-muted">This part is included with the full product.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Quiz({ section, heading, size, onInteraction }) {
  const questions = section.data?.questions || []
  const [answers, setAnswers] = useState({})
  const done = Object.keys(answers).length === questions.length && questions.length > 0

  function choose(qi, oi) {
    if (answers[qi] !== undefined) return
    const next = { ...answers, [qi]: oi }
    setAnswers(next)
    if (Object.keys(next).length === questions.length) onInteraction?.(section)
  }

  return (
    <div>
      {heading}
      {section.body && <p className="text-muted mb-4">{section.body}</p>}
      <div className="space-y-6">
        {questions.map((q, qi) => {
          const picked = answers[qi]
          return (
            <fieldset key={qi}>
              <legend className={`font-medium text-ink mb-3 ${size === 'sm' ? 'text-sm' : ''}`}>{q.question}</legend>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const isPicked = picked === oi
                  const isRight = q.answerIndex === oi
                  const reveal = picked !== undefined && q.answerIndex >= 0
                  let state = 'border-line hover:border-ink'
                  if (reveal && isRight) state = 'border-accent bg-accent-soft/40'
                  else if (reveal && isPicked) state = 'border-line bg-surface opacity-80'
                  else if (isPicked) state = 'border-ink'
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => choose(qi, oi)}
                      disabled={picked !== undefined}
                      aria-pressed={isPicked}
                      className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm text-ink transition-colors disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${state}`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
              {picked !== undefined && (
                <p className="mt-3 text-sm text-muted" role="status">
                  {q.answerIndex >= 0 ? (picked === q.answerIndex ? 'That’s right. ' : 'Not quite. ') : ''}
                  {q.explanation}
                </p>
              )}
            </fieldset>
          )
        })}
      </div>
      {done && <p className="mt-5 text-sm text-ink">Nice — the full version goes deeper.</p>}
    </div>
  )
}

function Exercise({ section, heading, size, onInteraction }) {
  const d = section.data || {}
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const id = `ex-${section.id || section.index}`
  return (
    <div>
      {heading}
      {(d.prompt || section.body) && <p className={`${size === 'sm' ? 'text-sm' : ''} text-muted leading-relaxed mb-4 whitespace-pre-line`}>{d.prompt || section.body}</p>}
      {submitted ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink" role="status">
          Saved on this device only — nothing you type here is sent anywhere.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            setSubmitted(true)
            onInteraction?.(section)
          }}
          className="space-y-3"
        >
          <label htmlFor={id} className="sr-only">Your answer</label>
          <textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder={d.placeholder || 'Write your answer…'}
            className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <button type="submit" disabled={!value.trim()} className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40">
            Done <ArrowRight size={14} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
