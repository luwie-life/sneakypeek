import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import RevealMark from '../components/RevealMark'
import FunnelChart from '../components/analytics/FunnelChart'
import SectionPerformanceTable from '../components/analytics/SectionPerformanceTable'

const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

function Delta({ now, before }) {
  if (before == null) return null
  if (before === 0) return now > 0 ? <span className="text-xs text-muted">new</span> : null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return <span className="text-xs text-muted">no change</span>
  return <span className={`text-xs ${pct > 0 ? 'text-accent-dim' : 'text-muted'}`}>{pct > 0 ? '+' : ''}{pct}% vs previous</span>
}

function Stat({ label, value, sub, delta }) {
  return (
    <Card hover={false}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="font-serif text-3xl text-ink tabular-nums">{value}</p>
      <div className="mt-1 min-h-[1rem] flex flex-wrap gap-x-2">
        {sub && <span className="text-xs text-muted">{sub}</span>}
        {delta}
      </div>
    </Card>
  )
}

function Sparkline({ daily }) {
  if (!daily?.length || daily.length < 2) return null
  const max = Math.max(...daily.map((d) => d.views), 1)
  return (
    <div className="flex items-end gap-[3px] h-16" role="img" aria-label={`Daily views over ${daily.length} days`}>
      {daily.map((d) => (
        <div key={d.date} title={`${d.date}: ${d.views}`} className="flex-1 bg-accent/70 rounded-sm min-h-[2px]" style={{ height: `${Math.max((d.views / max) * 100, d.views ? 6 : 2)}%` }} />
      ))}
    </div>
  )
}

export default function AnalyticsDashboard() {
  const { id } = useParams()
  const [range, setRange] = useState('7d')
  const [allowed, setAllowed] = useState(null)
  const [data, setData] = useState(null)
  const [experienceTitle, setExperienceTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([api.getAnalytics(id, range), api.getExperience(id)])
      .then(([analytics, { experience }]) => {
        if (cancelled) return
        setData(analytics)
        setExperienceTitle(experience.title)
        if (analytics.allowedRanges) setAllowed(analytics.allowedRanges)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 402 && err.data?.allowedRanges) {
          setAllowed(err.data.allowedRanges)
          setRange(err.data.allowedRanges[0] || '7d')
          return
        }
        setError(err.status === 404 ? 'This experience was not found.' : err.message)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, range])

  const s = data?.summary
  const p = data?.previous

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 -mt-2">
        <Link to="/dashboard/analytics" className="text-sm text-muted hover:text-ink flex items-center gap-1.5">
          <ArrowLeft size={14} aria-hidden="true" /> All experiences
        </Link>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="sr-only">Date range</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="text-sm rounded-lg border border-line bg-paper px-3 py-1.5 text-ink">
            {RANGES.map((r) => (
              <option key={r.value} value={r.value} disabled={allowed ? !allowed.includes(r.value) : false}>
                {r.label}{allowed && !allowed.includes(r.value) ? ' (upgrade)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-muted text-sm mb-6 -mt-4">{experienceTitle}</p>

      {loading && !data && <p className="text-muted" role="status">Loading analytics…</p>}
      {error && <p className="text-accent-dim" role="alert">{error}</p>}

      {data && !data.hasData && (
        <Card hover={false} className="text-center py-16 flex flex-col items-center gap-4">
          <RevealMark size={32} />
          <p className="font-serif text-2xl text-ink">No visitors in this period</p>
          <p className="text-muted text-sm max-w-sm">
            Numbers appear here once people open your published experience. Share its link to start collecting data.
          </p>
        </Card>
      )}

      {data && data.hasData && (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Stat label="Views" value={s.views} sub={`${s.uniqueVisitors} unique visitors`} delta={<Delta now={s.views} before={p?.views} />} />
            <Stat label="Read past the opening" value={`${s.engagementRate}%`} sub={`${s.completionRate}% reached the end`} />
            <Stat label="Offer button clicks" value={s.ctaClicks} sub={s.ctaViews ? `${s.ctaClickRate}% of those who saw it` : ''} delta={<Delta now={s.ctaClicks} before={p?.ctaClicks} />} />
            <Stat label="Checkout opened" value={s.checkoutClicks} sub={`${s.checkoutClickRate}% of visitors`} delta={<Delta now={s.checkoutClicks} before={p?.checkoutClicks} />} />
          </div>

          {(s.interactions > 0 || s.freeDownloads > 0) && (
            <p className="text-sm text-muted mb-6">
              {s.interactions > 0 && <>{s.interactions} visitors completed a quiz or exercise. </>}
              {s.freeDownloads > 0 && <>{s.freeDownloads} free downloads.</>}
            </p>
          )}

          {data.biggestDropOff && (
            <Card hover={false} className="mb-8 border-accent/30">
              <p className="text-xs uppercase tracking-widest text-accent-dim mb-1">Biggest drop-off</p>
              <p className="text-ink">
                {data.biggestDropOff.stoppedHere} visitors stopped at “{data.biggestDropOff.heading}” (section {data.biggestDropOff.index + 1}).
              </p>
              <p className="text-xs text-muted mt-1">Try a stronger heading, a shorter section, or moving something more engaging earlier.</p>
            </Card>
          )}

          <Card hover={false} className="mb-8">
            <h2 className="font-sans font-medium text-ink mb-5">Funnel</h2>
            <FunnelChart steps={data.funnel.steps} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-8">
            <Card hover={false}>
              <h2 className="font-sans font-medium text-ink mb-4">Section by section</h2>
              <SectionPerformanceTable sections={data.sections} biggestDropOff={data.biggestDropOff} />
            </Card>
            <div className="flex flex-col gap-6">
              {data.daily?.length > 1 && (
                <Card hover={false}>
                  <h2 className="font-sans font-medium text-ink mb-4">Daily views</h2>
                  <Sparkline daily={data.daily} />
                </Card>
              )}
              <Card hover={false}>
                <h2 className="font-sans font-medium text-ink mb-3">Where visitors came from</h2>
                {data.referrers?.length ? (
                  <ul className="text-sm divide-y divide-line">
                    {data.referrers.map((r) => (
                      <li key={r.source} className="flex justify-between py-1.5">
                        <span className="text-ink truncate">{r.source === 'direct' ? 'Direct / unknown' : r.source}</span>
                        <span className="text-muted tabular-nums">{r.views}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No referrer data yet.</p>
                )}
              </Card>
            </div>
          </div>

          {data.notes?.map((n) => (
            <p key={n} className="flex items-start gap-2 text-xs text-muted">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {n}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
