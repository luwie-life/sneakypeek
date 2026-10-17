import Plan from '../../models/Plan.js'

/**
 * Creates a Flutterwave monthly Payment Plan for every active paid plan
 * that doesn't have one yet, and stores its id as `providerPriceId`.
 * Checkout refuses paid plans without a payment plan (it would otherwise
 * be a one-off charge that never renews).
 *
 * Note: a Flutterwave payment plan has a fixed amount and currency. If you
 * change a plan's price, clear its providerPriceId (admin > Plans) and run
 * this again; existing subscribers stay on the old payment plan until they
 * re-subscribe.
 */
export async function syncPaymentPlans({ provider, dryRun = false, log = console.log } = {}) {
  const plans = await Plan.find({ active: true, monthlyPriceCents: { $gt: 0 } }).sort({ order: 1 })
  const results = []
  for (const plan of plans) {
    if (plan.providerPriceId) {
      results.push({ slug: plan.slug, status: 'exists', id: plan.providerPriceId })
      continue
    }
    const amount = plan.monthlyPriceCents / 100
    const currency = (plan.currency || 'usd').toUpperCase()
    if (dryRun) {
      log(`[dry-run] would create "${plan.name}" ${amount} ${currency} monthly`)
      results.push({ slug: plan.slug, status: 'would_create' })
      continue
    }
    const { id } = await provider.createPaymentPlan({ name: `Sneaky Peek ${plan.name} (${currency} ${amount}/mo)`, amount, currency, interval: 'monthly' })
    if (!id) throw new Error(`Provider returned no payment plan id for ${plan.slug}`)
    plan.providerPriceId = String(id)
    await plan.save()
    log(`created payment plan ${id} for ${plan.slug}`)
    results.push({ slug: plan.slug, status: 'created', id: String(id) })
  }
  return results
}
