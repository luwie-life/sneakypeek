/**
 * Every event Sneaky Peek's public experience can emit.
 *
 * Deliberately excludes "purchase": we have no reliable purchase signal
 * (no checkout webhook yet), so we never claim one happened. When a real
 * checkout integration lands, add it here and start emitting it from that
 * integration only — never inferred from a click.
 */
export const EVENT_TYPES = [
  'experience_viewed',
  'experience_started',
  'section_viewed',
  'section_completed',
  'cta_viewed',
  'cta_clicked',
  'checkout_clicked',
  'experience_completed',
  // A visitor finished an interactive element (quiz answered, exercise done).
  'interaction_completed',
  // Recorded server-side by the public download endpoint, never by the client.
  'asset_downloaded',
  // Public storefront page view (stored with `user` = the storefront owner).
  'storefront_viewed',
  // Monetization/lifecycle — account-level, see MONETIZATION_* splits below
  'upgrade_prompt_viewed',
  'upgrade_started',
  'checkout_started',
  'checkout_completed',
  'trial_started',
  'trial_expiring',
  'payment_failed',
  'subscription_reactivated',
  'cancellation_started',
  'subscription_canceled',
  'winback_started',
  'winback_completed',
  // AI-specific upgrade signals — kept distinct from the generic
  // upgrade_prompt_* events because AI is the single strongest upgrade
  // driver and deserves its own funnel, not folded into "limits in general."
  'ai_upgrade_prompt_viewed',
  'ai_upgrade_clicked',
  'billing_started',
  'complimentary_access_granted',
  'complimentary_access_revoked',
  'complimentary_access_expired',
]

/**
 * A user's own browser can be asked to report *intent* (they viewed a
 * prompt, they clicked upgrade) — that's just UX telemetry and spoofing it
 * only pollutes their own numbers. It can NEVER be trusted to report that
 * money actually changed hands or a subscription actually changed state;
 * those are only ever written by server code that just did the thing.
 * The /billing/track endpoint enforces this split — see billing.routes.js.
 */
export const CLIENT_SIGNALABLE_EVENTS = [
  'upgrade_prompt_viewed',
  'upgrade_started',
  'checkout_started',
  'cancellation_started',
  'winback_started',
  'ai_upgrade_prompt_viewed',
  'ai_upgrade_clicked',
  'billing_started',
]

export const SERVER_ONLY_EVENTS = [
  'checkout_completed',
  'trial_started',
  'trial_expiring',
  'payment_failed',
  'subscription_reactivated',
  'subscription_canceled',
  'winback_completed',
  'complimentary_access_granted',
  'complimentary_access_revoked',
  'complimentary_access_expired',
]

/**
 * Events an anonymous visitor's browser may report for a public
 * experience. Anything else posted to the public events endpoint is
 * dropped — previously ANY event type (including server-only billing
 * events like checkout_completed) could be written by an anonymous POST.
 */
export const VISITOR_EVENTS = [
  'experience_viewed',
  'experience_started',
  'section_viewed',
  'section_completed',
  'interaction_completed',
  'cta_viewed',
  'cta_clicked',
  'checkout_clicked',
  'experience_completed',
]

/** Events that need a section index to be meaningful. */
export const SECTION_EVENTS = ['section_viewed', 'section_completed', 'interaction_completed']

/**
 * Funnel shown to creators. Each step counts distinct visitor sessions.
 * "Checkout opened" is a click to the creator's external checkout — NOT a
 * confirmed purchase; Sneaky Peek cannot see the creator's sales.
 */
export const FUNNEL_STEPS = [
  { key: 'visitors', eventType: 'experience_viewed', label: 'Visited' },
  { key: 'started', eventType: 'experience_started', label: 'Started reading' },
  { key: 'engaged', eventType: 'section_viewed', label: 'Viewed a section' },
  { key: 'ctaViewed', eventType: 'cta_viewed', label: 'Saw the offer' },
  { key: 'checkoutClicked', eventType: 'checkout_clicked', label: 'Opened checkout' },
]
