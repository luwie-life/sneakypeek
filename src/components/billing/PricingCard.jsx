import { Check } from 'lucide-react'
import Button from '../ui/Button'
import { Card } from '../ui/Card'

function formatPrice(cents, currency) {
  if (cents === 0) return 'Free'
  const amount = (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const symbol = (currency || 'usd').toUpperCase() === 'USD' ? '$' : `${(currency || '').toUpperCase()} `
  return `${symbol}${amount}/mo`
}

function limitLine(label, value) {
  if (value === -1) return `Unlimited ${label}`
  return `${value} ${label}`
}

export default function PricingCard({ plan, isCurrent, onSelect, busy, disabled = false }) {
  const unavailable = !isCurrent && plan.monthlyPriceCents > 0 && plan.recurringReady === false
  return (
    <Card hover={!isCurrent} className={`flex flex-col ${isCurrent ? 'border-accent border-2' : ''}`}>
      <div className="mb-4">
        <h3 className="font-serif text-2xl text-ink mb-1">{plan.name}</h3>
        <p className="text-2xl font-sans font-medium text-ink">
          {formatPrice(plan.monthlyPriceCents, plan.currency)}
        </p>
        {plan.description && <p className="text-sm text-muted mt-2">{plan.description}</p>}
      </div>

      <ul className="flex flex-col gap-2 mb-6 flex-1">
        <li className="flex items-start gap-2 text-sm text-muted">
          <Check size={15} className="text-accent shrink-0 mt-0.5" />
          {limitLine('experiences', plan.limits.maxExperiences)}
        </li>
        <li className="flex items-start gap-2 text-sm text-muted">
          <Check size={15} className="text-accent shrink-0 mt-0.5" />
          {plan.limits.aiGenerationsPerMonth === 0 && plan.limits.aiTrialExperiences > 0
            ? 'One-time AI trial (1 experience)'
            : limitLine('AI generations/mo', plan.limits.aiGenerationsPerMonth)}
        </li>
        <li className="flex items-start gap-2 text-sm text-muted">
          <Check size={15} className="text-accent shrink-0 mt-0.5" />
          {plan.limits.analyticsRetentionDays === -1
            ? 'Full analytics history'
            : `${plan.limits.analyticsRetentionDays}-day analytics history`}
        </li>
        {plan.limits.storageMB > 0 && (
          <li className="flex items-start gap-2 text-sm text-muted">
            <Check size={15} className="text-accent shrink-0 mt-0.5" />
            {plan.limits.storageMB >= 1000 ? `${Math.round(plan.limits.storageMB / 1000)} GB` : `${plan.limits.storageMB} MB`} file storage
          </li>
        )}
        {plan.limits.maxTeamMembers > 1 && (
          <li className="flex items-start gap-2 text-sm text-muted">
            <Check size={15} className="text-accent shrink-0 mt-0.5" />
            {limitLine('team members', plan.limits.maxTeamMembers)}
          </li>
        )}
      </ul>

      <Button
        variant={isCurrent ? 'outline' : 'accent'}
        disabled={isCurrent || busy || unavailable || disabled}
        onClick={() => onSelect(plan.slug)}
        className="w-full"
        title={unavailable ? 'This plan is not available for purchase yet' : undefined}
      >
        {isCurrent ? 'Current plan' : busy ? 'Please wait…' : unavailable ? 'Not available yet' : `Choose ${plan.name}`}
      </Button>
    </Card>
  )
}
