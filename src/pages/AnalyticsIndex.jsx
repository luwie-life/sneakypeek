import { useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import { useExperiences } from '../hooks/useExperiences'

export default function AnalyticsIndex() {
  const { experiences, loading, error } = useExperiences()
  const navigate = useNavigate()

  if (loading) return <p className="text-muted">Loading…</p>
  if (error) return <p className="text-accent-dim">{error}</p>

  if (experiences.length === 0) {
    return (
      <Card hover={false} className="text-center py-14">
        <p className="font-serif text-2xl text-ink mb-2">Nothing to measure yet</p>
        <p className="text-muted text-sm mb-6">
          Create and publish an experience, then come back here to see how it performs.
        </p>
        <Button variant="accent" onClick={() => navigate('/dashboard/experiences/new')}>
          Create Sneaky Peek
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted mb-2">Choose an experience to see its funnel.</p>
      {experiences.map((exp) => (
        <Card key={exp._id} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-sans text-ink">{exp.title}</span>
            <StatusBadge status={exp.status} />
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={BarChart3}
            onClick={() => navigate(`/dashboard/analytics/${exp._id}`)}
          >
            View analytics
          </Button>
        </Card>
      ))}
    </div>
  )
}
