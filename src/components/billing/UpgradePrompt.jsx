import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'
import { Card } from '../ui/Card'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { getVariant } from '../../lib/experiments'

const LIMIT_LABELS = {
  maxExperiences: 'experiences',
  aiGenerationsPerMonth: 'AI generations this month',
  analyticsRetentionDays: 'analytics history',
}

function formatPrice(cents) {
  if (!cents) return 'Free'
  return `$${(cents / 100).toFixed(0)}/mo`
}

export default function UpgradePrompt({ error }) {
  const { user } = useAuth()
  const [recommendedPlan, setRecommendedPlan] = useState(null)
  const label = LIMIT_LABELS[error.limitKey] || 'this limit'
  const copyVariant = getVariant('upgradePromptCopy', user?._id)

  useEffect(() => {
    api.trackEvent('upgrade_prompt_viewed', error.limitKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.getPlans()
      .then(({ plans }) => {
        // Cheapest active plan that actually satisfies this limit — -1 means unlimited.
        const candidates = plans
          .filter((p) => p.active && p.slug !== error.plan)
          .filter((p) => {
            const limit = p.limits?.[error.limitKey]
            return limit === -1 || (typeof limit === 'number' && limit > (error.limit ?? 0))
          })
          .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents)
        setRecommendedPlan(candidates[0] || null)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUpgradeClick() {
    api.trackEvent('upgrade_started', error.limitKey)
  }

  return (
    <Card hover={false} className="text-center py-10 flex flex-col items-center gap-3">
      <RevealMark size={28} />
      <p className="font-serif text-xl text-ink">You've reached your plan's limit</p>
      <p className="text-sm text-muted max-w-sm">
        {copyVariant === 'specific' && recommendedPlan
          ? `${error.current ?? 0} of ${error.limit} ${label} used. ${recommendedPlan.name} (${formatPrice(recommendedPlan.monthlyPriceCents)}) unlocks more.`
          : error.current !== null && error.current !== undefined
          ? `You've used ${error.current} of ${error.limit} ${label} on your current plan. Upgrade to keep going.`
          : `Your current plan doesn't include ${label}. Upgrade to keep going.`}
      </p>
      <Link to="/dashboard/billing" onClick={handleUpgradeClick}>
        <Button variant="accent" size="sm">
          {recommendedPlan ? `Upgrade to ${recommendedPlan.name}` : 'View plans'}
        </Button>
      </Link>
    </Card>
  )
}
