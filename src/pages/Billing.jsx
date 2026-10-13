import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import RevealMark from '../components/RevealMark'
import PricingCard from '../components/billing/PricingCard'
import UsageBar from '../components/billing/UsageBar'
import CancelSubscriptionDialog from '../components/billing/CancelSubscriptionDialog'

const STATUS_LABEL = {
  trialing: { text: 'Trial', tone: 'accent' },
  active: { text: 'Active', tone: 'ok' },
  past_due: { text: 'Payment failed', tone: 'warn' },
  canceled: { text: 'Canceled', tone: 'muted' },
  expired: { text: 'Trial ended', tone: 'warn' },
}

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatPrice(cents, currency) {
  if (!cents) return 'Free'
  const symbol = (currency || 'usd').toUpperCase() === 'USD' ? '$' : `${(currency || '').toUpperCase()} `
  return `${symbol}${(cents / 100).toFixed(0)}/mo`
}

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [subscription, setSubscription] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyPlan, setBusyPlan] = useState(null)
  const [notice, setNotice] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [sub, { plans }] = await Promise.all([api.getSubscription(), api.getPlans()])
      setSubscription(sub)
      setPlans(plans)

      // Welcome-back signal — fires once per load when landing here with a
      // lapsed subscription, win-back's natural entry point. Subtle: it
      // only changes copy in the existing banner, no extra modal.
      if (sub.subscription.status === 'canceled' || sub.subscription.status === 'expired') {
        api.trackEvent('winback_started', sub.plan.slug)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.trackEvent('billing_started')
    async function init() {
      const transactionId = searchParams.get('transaction_id')
      const status = searchParams.get('status')

      if (transactionId && status === 'successful') {
        try {
          const result = await api.verifyCheckout(transactionId)
          setNotice(
            result.applied
              ? result.reactivated
                ? `Welcome back — you're on the ${result.plan} plan again.`
                : `You're now on the ${result.plan} plan.`
              : "We couldn't confirm that payment yet — it may still be processing."
          )
        } catch (err) {
          setNotice(`Payment verification failed: ${err.message}`)
        }
        setSearchParams({}, { replace: true })
      } else if (searchParams.get('trial') === 'started') {
        setNotice('Your 30-day trial has started.')
        setSearchParams({}, { replace: true })
      } else if (searchParams.get('downgraded') === 'free') {
        setNotice("You're now on the Free plan.")
        setSearchParams({}, { replace: true })
      }

      await loadAll()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSelectPlan(planSlug) {
    setBusyPlan(planSlug)
    setError('')
    api.trackEvent('checkout_started', planSlug)
    try {
      const result = await api.startCheckout(planSlug)
      if (result.url) {
        window.location.href = result.url // external Flutterwave-hosted checkout
      } else if (result.redirect) {
        navigate(result.redirect)
        await loadAll()
      }
    } catch (err) {
      setError(err.message)
      setBusyPlan(null)
    }
  }

  function openCancelDialog() {
    api.trackEvent('cancellation_started', subscription.plan.slug)
    setCancelOpen(true)
  }

  async function handleCancelConfirm(reason) {
    setCancelOpen(false)
    try {
      await api.cancelSubscription(reason || undefined)
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RevealMark size={28} animated animationState="thinking" />
      </div>
    )
  }

  if (error && !subscription) {
    return <p className="text-accent-dim">{error}</p>
  }

  const statusInfo = STATUS_LABEL[subscription.subscription.status] || { text: subscription.subscription.status, tone: 'muted' }
  const isPaidPlan = subscription.plan.monthlyPriceCents > 0
  const needsPayment = subscription.subscription.status === 'expired' || subscription.subscription.status === 'past_due'
  const isLapsed = subscription.subscription.status === 'canceled'

  return (
    <div>
      {notice && (
        <Card hover={false} className="mb-6 py-3 px-4 text-sm text-ink bg-accent-soft border-0">
          {notice}
        </Card>
      )}
      {error && <p className="text-sm text-accent-dim mb-4">{error}</p>}

      <Card hover={false} className="mb-8">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="font-serif text-2xl text-ink">{subscription.plan.name}</h2>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-pill ${
                  statusInfo.tone === 'warn'
                    ? 'bg-accent-soft text-accent-dim'
                    : statusInfo.tone === 'ok' || statusInfo.tone === 'accent'
                    ? 'bg-surface text-ink border border-line'
                    : 'bg-surface text-muted border border-line'
                }`}
              >
                {statusInfo.text}
              </span>
            </div>
            <p className="text-muted text-sm">{formatPrice(subscription.plan.monthlyPriceCents, subscription.plan.currency)}</p>
          </div>

          {isPaidPlan && !needsPayment && !isLapsed && (
            <Button variant="ghost" size="sm" onClick={openCancelDialog}>
              Cancel plan
            </Button>
          )}
        </div>

        {needsPayment && (
          <div className="mb-5 p-4 rounded-xl bg-accent-soft flex items-start gap-3">
            <RevealMark size={20} />
            <div>
              <p className="text-sm font-medium text-ink mb-0.5">
                {subscription.subscription.status === 'expired' ? 'Your trial has ended' : 'Your last payment failed'}
              </p>
              <p className="text-xs text-muted">
                Subscribe now to keep your {subscription.plan.name} plan features.
              </p>
            </div>
          </div>
        )}

        {isLapsed && (
          <div className="mb-5 p-4 rounded-xl bg-surface flex items-start gap-3">
            <RevealMark size={20} />
            <div>
              <p className="text-sm font-medium text-ink mb-0.5">Welcome back</p>
              <p className="text-xs text-muted">
                Pick up right where you left off — your experiences are exactly as you left them.
              </p>
            </div>
          </div>
        )}

        {subscription.subscription.status === 'trialing' && (
          <p className="text-xs text-muted mb-5">
            Trial ends {formatDate(subscription.subscription.trialEnd)}.
          </p>
        )}
        {subscription.subscription.status === 'active' && subscription.subscription.currentPeriodEnd && (
          <p className="text-xs text-muted mb-5">
            {subscription.subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}{' '}
            {formatDate(subscription.subscription.currentPeriodEnd)}.
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-5">
          <UsageBar
            label="Experiences"
            used={subscription.usage.experiences.used}
            limit={subscription.usage.experiences.limit}
          />
          <UsageBar
            label="AI generations this month"
            used={subscription.usage.aiGenerations.used}
            limit={subscription.usage.aiGenerations.limit}
          />
        </div>
      </Card>

      <h2 className="font-sans font-medium text-ink mb-4">
        {needsPayment || isLapsed ? 'Subscribe to continue' : 'Plans'}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {plans.map((plan) => (
          <PricingCard
            key={plan.slug}
            plan={plan}
            isCurrent={plan.slug === subscription.plan.slug && !needsPayment && !isLapsed}
            busy={busyPlan === plan.slug}
            onSelect={handleSelectPlan}
          />
        ))}
      </div>

      <CancelSubscriptionDialog
        open={cancelOpen}
        planName={subscription.plan.name}
        accessEndsLabel={formatDate(subscription.subscription.currentPeriodEnd)}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
