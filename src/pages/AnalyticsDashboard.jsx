import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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

export default function AnalyticsDashboard() {
  const { id } = useParams()
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [experienceTitle, setExperienceTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.getAnalytics(id, range), api.getExperience(id)])
      .then(([analytics, { experience }]) => {
        if (cancelled) return
        setData(analytics)
        setExperienceTitle(experience.title)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, range])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 -mt-2">
        <Link to="/dashboard/analytics" className="text-sm text-muted hover:text-ink flex items-center gap-1.5">
          <ArrowLeft size={14} /> All experiences
        </Link>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="text-sm rounded-lg border border-line bg-paper px-3 py-1.5"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <p className="text-muted text-sm mb-6 -mt-4">{experienceTitle}</p>

      {loading && <p className="text-muted">Loading analytics…</p>}
      {error && <p className="text-accent-dim">{error}</p>}

      {data && !data.funnel.hasData && (
        <Card hover={false} className="text-center py-16 flex flex-col items-center gap-4">
          <RevealMark size={32} />
          <p className="font-serif text-2xl text-ink">No visitors yet</p>
          <p className="text-muted text-sm max-w-sm">
            Analytics will appear here once people start viewing this experience. Share its
            public link to start collecting data.
          </p>
        </Card>
      )}

      {data && data.funnel.hasData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card hover={false}>
              <p className="text-xs text-muted mb-1">Visitors</p>
              <p className="font-serif text-3xl text-ink">{data.funnel.summary.visitors}</p>
            </Card>
            <Card hover={false}>
              <p className="text-xs text-muted mb-1">Engagement</p>
              <p className="font-serif text-3xl text-ink">{data.funnel.summary.engagementRate}%</p>
            </Card>
            <Card hover={false}>
              <p className="text-xs text-muted mb-1">CTA click rate</p>
              <p className="font-serif text-3xl text-ink">{data.funnel.summary.ctaClickRate}%</p>
            </Card>
            <Card hover={false}>
              <p className="text-xs text-muted mb-1">Checkout rate</p>
              <p className="font-serif text-3xl text-ink">{data.funnel.summary.checkoutClickRate}%</p>
            </Card>
          </div>

          <Card hover={false} className="mb-8">
            <h2 className="font-sans font-medium text-ink mb-5">Funnel</h2>
            <FunnelChart steps={data.funnel.steps} />
          </Card>

          <Card hover={false}>
            <h2 className="font-sans font-medium text-ink mb-4">Section performance</h2>
            <SectionPerformanceTable sections={data.sections} />
          </Card>
        </>
      )}
    </div>
  )
}
