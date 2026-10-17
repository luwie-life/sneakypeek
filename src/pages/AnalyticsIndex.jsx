import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import { api } from '../lib/api'

export default function AnalyticsIndex() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getAnalyticsSummary('7d').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="text-accent-dim" role="alert">{error}</p>
  if (!data) return <p className="text-muted" role="status">Loading…</p>

  if (data.experiences.length === 0) {
    return (
      <Card hover={false} className="text-center py-14">
        <p className="font-serif text-2xl text-ink mb-2">Nothing to measure yet</p>
        <p className="text-muted text-sm mb-6">Create and publish an experience, then come back here to see how it performs.</p>
        <Button variant="accent" onClick={() => navigate('/dashboard/experiences/new')}>Create Sneaky Peek</Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="text-sm text-muted">Last 7 days. Choose an experience for its full funnel.</p>
        {data.storefrontViews > 0 && <p className="text-xs text-muted">{data.storefrontViews} storefront visits (all time)</p>}
      </div>
      {data.experiences.map((exp) => (
        <Card key={exp._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-sans text-ink truncate">{exp.title}</span>
            <StatusBadge status={exp.status} />
          </div>
          <div className="flex items-center gap-5">
            <dl className="flex gap-5 text-xs text-muted">
              <div><dt className="sr-only">Visitors</dt><dd><span className="text-ink tabular-nums">{exp.visitors}</span> visitors</dd></div>
              <div><dt className="sr-only">Checkout opened</dt><dd><span className="text-ink tabular-nums">{exp.checkoutClicks}</span> checkout opened</dd></div>
            </dl>
            <Button variant="outline" size="sm" icon={BarChart3} onClick={() => navigate(`/dashboard/analytics/${exp._id}`)}>View</Button>
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted mt-2">“Checkout opened” counts clicks to your checkout page. Sneaky Peek can’t see your sales.</p>
    </div>
  )
}
