import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'
import { Card } from '../ui/Card'
import { api } from '../../lib/api'

/**
 * Shown whenever the backend rejects an AI action for entitlement reasons
 * (limitKey === 'aiGenerationsPerMonth'). AI stays visible everywhere in
 * the UI — this replaces the result of clicking it, never the control
 * itself. Copy is fixed by product decision, not run through the generic
 * experiment system.
 */
export default function AiUpgradePrompt({ onDismiss, trialUsed = false, monthlyLimit = false, onStarterDraft }) {
  useEffect(() => {
    api.trackEvent('ai_upgrade_prompt_viewed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUpgradeClick() {
    api.trackEvent('ai_upgrade_clicked')
  }

  return (
    <Card hover={false} className="text-center py-10 flex flex-col items-center gap-3">
      <RevealMark size={28} />
      <p className="font-serif text-xl text-ink">
        {trialUsed ? 'You’ve used your free AI trial.' : monthlyLimit ? 'You’ve reached this month’s AI limit.' : 'AI creation is available on paid plans.'}
      </p>
      <p className="text-sm text-muted max-w-sm">
        {trialUsed
          ? 'Your trial covered one product analysis and one generated experience. Upgrade to keep generating and refining with AI — you can always keep editing by hand.'
          : monthlyLimit
            ? 'Your allowance resets at the start of your next billing period, or upgrade for more. Manual editing always stays available.'
            : 'Upgrade to let Sneaky Peek understand your product, generate experiences, and help refine every section.'}
      </p>
      <div className="flex items-center gap-3 mt-1">
        <Link to="/dashboard/billing" onClick={handleUpgradeClick}>
          <Button variant="accent" size="sm">Upgrade</Button>
        </Link>
        {onStarterDraft && (
          <button onClick={onStarterDraft} className="text-sm text-ink underline-offset-2 hover:underline">
            Use a starter draft instead
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="text-sm text-muted hover:text-ink">
            Maybe later
          </button>
        )}
      </div>
    </Card>
  )
}
