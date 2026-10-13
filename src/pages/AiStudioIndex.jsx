import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import { useExperiences } from '../hooks/useExperiences'

export default function AiStudioIndex() {
  const { experiences, loading, error } = useExperiences()
  const navigate = useNavigate()

  if (loading) return <p className="text-muted">Loading…</p>
  if (error) return <p className="text-accent-dim">{error}</p>

  if (experiences.length === 0) {
    return (
      <Card hover={false} className="text-center py-14">
        <p className="font-serif text-2xl text-ink mb-2">Create an experience first</p>
        <p className="text-muted text-sm mb-6">
          AI Studio works on an existing experience — create one, then open it here.
        </p>
        <Button variant="accent" onClick={() => navigate('/dashboard/experiences/new')}>
          Create Sneaky Peek
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted mb-2">Choose an experience to open in the AI Studio.</p>
      {experiences.map((exp) => (
        <Card key={exp._id} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-sans text-ink">{exp.title}</span>
            <StatusBadge status={exp.status} />
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={Sparkles}
            onClick={() => navigate(`/dashboard/studio/${exp._id}`)}
          >
            Open in Studio
          </Button>
        </Card>
      ))}
    </div>
  )
}
