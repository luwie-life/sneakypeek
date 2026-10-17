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
  expired: { text: 'Expired', tone: 'warn' },
}

const PAYMENT_STATUS = { successful: 'Paid', failed: 'Failed', pending: 'Pending' }

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

function formatMoney(amount, currency) {
  const c = (currency || 'usd').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(amount)
  } catch {
    return `${c} ${amount}`
  }
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
  const [payments, setPayments] = useState([])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [sub, { plans }, pay] = await Promise.all([api.getSubscription(), api.getPlans(), api.listPayments().catch(() => ({ payments: [] }))])
      setSubscription(sub)
      setPlans(plans)
      setPayments(pay.payments || [])

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

      if (status === 'cancelled' && !transactionId) {
        setNotice('Checkout was cancelled. You have not been charged.')
        setSearchParams({}, { replace: true })
      } else if (transactionId) {
        // The redirect itself proves nothing — the server re-verifies the
        // transaction with Flutterwave before changing anything.
        setNotice('Confirming your payment…')
        try {
          const result = await api.verifyCheckout(transactionId)
          if (result.applied && result.status !== 'failed') {
            setNotice(result.reactivated ? `Welcome back — you're on the ${cap(result.plan)} plan again.` : `Payment confirmed. You're on the ${cap(result.plan)} plan.`)
          } else if (result.duplicate) {
            setNotice('Payment confirmed. Your plan is active.')
          } else if (result.reason === 'amount_mismatch' || result.reason === 'currency_mismatch') {
            setNotice("That payment didn't match the plan price, so it wasn't applied. Contact support if you were charged.")
          } else if (result.status === 'failed' || status === 'failed') {
            setNotice('The payment did not go through. You have not been upgraded.')
          } else {
            setNotice("We couldn't confirm that payment yet. If you completed it, it will appear here within a few minutes.")
          }
        } catch (err) {
          setNotice(err.status === 403 ? 'That payment belongs to a different account.' : `We couldn't confirm the payment: ${err.message}`)
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
        // Same route, so the mount effect won't re-run — show the outcome here.
        if (result.redirect.includes('trial=started')) setNotice('Your 30-day free trial has started. No card needed.')
        else if (result.redirect.includes('downgraded=free')) setNotice("You're now on the Free plan.")
        navigate('/dashboard/billing', { replace: true })
        await loadAll()
        setBusyPlan(null)
      }
    } catch (err) {
      setError(err.status === 409 ? "You're already on that plan." : err.message)
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

  const sub = subscription.subscription
  let statusInfo = STATUS_LABEL[sub.status] || { text: sub.status, tone: 'muted' }
  if (sub.status === 'active' && sub.cancelAtPeriodEnd) statusInfo = { text: 'Ends soon', tone: 'muted' }
  if (sub.status === 'active' && sub.isComplimentary) statusInfo = { text: 'Complimentary', tone: 'ok' }
  const isPaidPlan = subscription.plan.monthlyPriceCents > 0
  const needsPayment = sub.status === 'expired' || sub.status === 'past_due'
  const isLapsed = sub.status === 'canceled'
  const limitedToFree = isPaidPlan && subscription.effectivePlan?.slug !== subscription.plan.slug

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

          {isPaidPlan && sub.status === 'active' && !sub.cancelAtPeriodEnd && !sub.isComplimentary && (
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
                {sub.status === 'expired' ? (sub.trialEnd && !sub.lastPaymentAt ? 'Your trial has ended' : 'Your subscription has expired') : 'Your last renewal payment failed'}
              </p>
              <p className="text-xs text-muted">
                {sub.status === 'past_due'
                  ? `${sub.lastPaymentError ? `Reason: ${sub.lastPaymentError}. ` : ''}Flutterwave will retry your card. You keep ${subscription.plan.name} features until ${formatDate(sub.graceEndsAt) || 'the grace period ends'}; after that your account moves to Free limits. You can also subscribe again below.`
                  : `You're on Free plan limits now. Subscribe to get your ${subscription.plan.name} features back — your experiences are kept.`}
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

        {sub.status === 'trialing' && (
          <p className="text-xs text-muted mb-5">
            Free trial ends {formatDate(sub.trialEnd)}. No card was taken — subscribe before then to keep these features.
          </p>
        )}
        {sub.status === 'active' && sub.currentPeriodEnd && (
          <p className="text-xs text-muted mb-5">
            {sub.isComplimentary
              ? `Complimentary access until ${formatDate(sub.grantExpiresAt || sub.currentPeriodEnd)}.`
              : sub.cancelAtPeriodEnd
                ? `Cancelled — automatic renewal is off. You keep access until ${formatDate(sub.currentPeriodEnd)}, then move to Free.`
                : sub.autoRenews
                  ? `Renews automatically on ${formatDate(sub.currentPeriodEnd)}.`
                  : `Current period ends ${formatDate(sub.currentPeriodEnd)}.`}
          </p>
        )}
        {limitedToFree && !needsPayment && !isLapsed && sub.status !== 'trialing' && (
          <p className="text-xs text-accent-dim mb-5">Free plan limits currently apply.</p>
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
          {subscription.usage.storage && (
            <UsageBar label="File storage (MB)" used={subscription.usage.storage.usedMB} limit={subscription.usage.storage.limitMB} />
          )}
        </div>
        {subscription.effectivePlan?.slug === 'free' && subscription.usage.aiTrial?.available && (
          <p className="mt-4 text-xs text-muted">
            {subscription.usage.aiTrial.generateUsed
              ? 'Your free AI trial has been used.'
              : 'Free AI trial: one product analysis and one generated experience, for one experience.'}
          </p>
        )}
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
            disabled={Boolean(busyPlan)}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Paid plans are monthly card subscriptions processed by Flutterwave and renew automatically until you cancel. Cancelling stops future renewals; you keep access until the end of the period you paid for.
      </p>

      {payments.length > 0 && (
        <Card hover={false} className="mt-10">
          <h2 className="font-sans font-medium text-ink mb-4">Payment history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-line">
                  <th scope="col" className="pb-2 font-medium">Date</th>
                  <th scope="col" className="pb-2 font-medium">Plan</th>
                  <th scope="col" className="pb-2 font-medium">Type</th>
                  <th scope="col" className="pb-2 font-medium text-right">Amount</th>
                  <th scope="col" className="pb-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id} className="border-b border-line last:border-0">
                    <td className="py-2.5 text-muted whitespace-nowrap">{formatDate(p.createdAt)}</td>
                    <td className="py-2.5 text-ink">{p.plan?.name || '—'}</td>
                    <td className="py-2.5 text-muted">{p.kind === 'renewal' ? 'Renewal' : 'First payment'}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className={`py-2.5 text-right ${p.status === 'failed' ? 'text-accent-dim' : 'text-muted'}`}>{PAYMENT_STATUS[p.status] || p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CancelSubscriptionDialog
        open={cancelOpen}
        planName={subscription.plan.name}
        accessEndsLabel={formatDate(sub.currentPeriodEnd)}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
