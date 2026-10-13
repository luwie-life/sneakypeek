import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import { RangeSelect } from '../../components/admin/Filters'
import RevealMark from '../../components/RevealMark'

function Stat({ label, value, sub }) {
  return (
    <Card hover={false}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="font-serif text-2xl text-ink">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </Card>
  )
}

function money(cents) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function AdminOverview() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .getOverview(range)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [range])

  return (
    <div>
      <div className="flex justify-end mb-6 -mt-2">
        <RangeSelect value={range} onChange={setRange} />
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <RevealMark size={28} animated animationState="thinking" />
        </div>
      )}
      {error && <p className="text-accent-dim">{error}</p>}

      {data && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Users</h2>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total" value={data.users.total} />
              <Stat label="New" value={data.users.new} />
              <Stat label="Active" value={data.users.active} sub="Based on recorded activity" />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Experiences</h2>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total" value={data.experiences.total} />
              <Stat label="Published" value={data.experiences.published} />
              <Stat label="Drafts" value={data.experiences.draft} />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Billing</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Stat label="Active" value={data.billing.active} />
              <Stat label="Trialing" value={data.billing.trialing} />
              <Stat label="Past due" value={data.billing.pastDue} />
              <Stat label="Canceled/expired" value={data.billing.canceledOrExpired} />
              <Stat label="MRR" value={money(data.billing.mrrCents)} sub="Active + trialing plans" />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">AI</h2>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Generations" value={data.ai.generations} />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Engagement</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Views" value={data.engagement.totalViews} />
              <Stat label="CTA clicks" value={data.engagement.ctaClicks} />
              <Stat label="Checkout clicks" value={data.engagement.checkoutClicks} />
              <Stat label="Completion rate" value={`${data.engagement.completionRate}%`} />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Monetization</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Upgrade prompts seen" value={data.monetization.upgradePromptViews} />
              <Stat label="Checkouts completed" value={data.monetization.checkoutCompleted} />
              <Stat
                label="Prompt → paid"
                value={data.monetization.promptToCheckoutRate === null ? '—' : `${data.monetization.promptToCheckoutRate}%`}
              />
              <Stat label="Trials started" value={data.monetization.trialStarted} />
              <Stat label="Payment failures" value={data.monetization.paymentFailed} />
              <Stat label="Cancellations" value={data.monetization.canceled} />
              <Stat label="Reactivations" value={data.monetization.reactivated} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
