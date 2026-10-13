import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import { useExperiences } from '../hooks/useExperiences'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Overview() {
  const { user } = useAuth()
  const { experiences, loading } = useExperiences()
  const navigate = useNavigate()
  const [planName, setPlanName] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getSubscription()
      .then((res) => !cancelled && setPlanName(res.plan.name))
      .catch(() => !cancelled && setPlanName(null))
    return () => { cancelled = true }
  }, [])

  const publishedCount = experiences.filter((e) => e.status === 'published').length

  return (
    <div>
      <p className="text-muted mb-8 -mt-4">Welcome back, {user?.name?.split(' ')[0]}.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <Card hover={false}>
          <p className="text-xs text-muted mb-1">Experiences</p>
          <p className="font-serif text-3xl text-ink">{loading ? '—' : experiences.length}</p>
        </Card>
        <Card hover={false}>
          <p className="text-xs text-muted mb-1">Published</p>
          <p className="font-serif text-3xl text-ink">{loading ? '—' : publishedCount}</p>
        </Card>
        <Card hover={false} className="hidden md:block">
          <p className="text-xs text-muted mb-1">Plan</p>
          <p className="font-serif text-3xl text-ink">{planName ?? '—'}</p>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans font-medium text-ink">Recent experiences</h2>
        <Button variant="accent" size="sm" icon={Plus} onClick={() => navigate('/dashboard/experiences/new')}>
          New experience
        </Button>
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : experiences.length === 0 ? (
        <p className="text-muted text-sm">
          No experiences yet — create your first one to see it here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.slice(0, 5).map((exp) => (
            <Card
              key={exp._id}
              className="flex items-center justify-between cursor-pointer"
              onClick={() => navigate(`/dashboard/experiences/${exp._id}`)}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-sans text-ink">{exp.title}</span>
                <StatusBadge status={exp.status} />
              </div>
              <span className="text-xs text-muted capitalize">{exp.productType}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
