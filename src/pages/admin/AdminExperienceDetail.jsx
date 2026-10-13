import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import RevealMark from '../../components/RevealMark'

export default function AdminExperienceDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    adminApi.getExperience(id)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [id])

  if (loading) return <div className="flex justify-center py-16"><RevealMark size={28} animated animationState="thinking" /></div>
  if (error) return <p className="text-accent-dim">{error}</p>
  if (!data) return null

  const { experience, materialCount, analytics } = data

  return (
    <div className="max-w-2xl">
      <Link to="/admin/experiences" className="text-sm text-muted hover:text-ink flex items-center gap-1.5 mb-5">
        <ArrowLeft size={14} /> All experiences
      </Link>

      <Card hover={false} className="mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">{experience.title}</h2>
            <p className="text-sm text-muted capitalize">{experience.productType} · {experience.status}</p>
          </div>
          {experience.publicUrl && (
            <a href={experience.publicUrl} target="_blank" rel="noreferrer" className="text-sm text-accent-dim flex items-center gap-1 hover:underline shrink-0">
              View live <ExternalLink size={13} />
            </a>
          )}
        </div>
        <p className="text-xs text-muted">
          Owner: {experience.owner ? `${experience.owner.name} (${experience.owner.email})` : '—'}
        </p>
        <p className="text-xs text-muted mt-1">
          Created {new Date(experience.createdAt).toLocaleDateString()}
          {experience.publishedAt && ` · Published ${new Date(experience.publishedAt).toLocaleDateString()}`}
        </p>
        {experience.productUnderstandingGeneratedAt && (
          <p className="text-xs text-muted mt-1">
            AI product understanding generated {new Date(experience.productUnderstandingGeneratedAt).toLocaleDateString()}
          </p>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <Card hover={false}>
          <p className="text-xs text-muted mb-1">Sections</p>
          <p className="font-serif text-2xl text-ink">{experience.sections?.length || 0}</p>
        </Card>
        <Card hover={false}>
          <p className="text-xs text-muted mb-1">Materials</p>
          <p className="font-serif text-2xl text-ink">{materialCount}</p>
        </Card>
      </div>

      <Card hover={false}>
        <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Analytics (all time)</h3>
        {!analytics.funnel.hasData ? (
          <p className="text-sm text-muted">No visitor data yet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Visitors</dt><dd className="text-ink">{analytics.funnel.summary.visitors}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Engagement</dt><dd className="text-ink">{analytics.funnel.summary.engagementRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted">CTA click rate</dt><dd className="text-ink">{analytics.funnel.summary.ctaClickRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Checkout rate</dt><dd className="text-ink">{analytics.funnel.summary.checkoutClickRate}%</dd></div>
          </dl>
        )}
      </Card>
    </div>
  )
}
