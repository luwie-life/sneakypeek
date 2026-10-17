import Plan from '../../models/Plan.js'
import { PLAN_DEFAULTS } from './planDefaults.js'

/**
 * Inserts each default plan only if its slug doesn't exist yet. Safe to
 * call on every boot — never overwrites a plan that already exists, so
 * price/limit edits made directly in the database always stick.
 */
export async function ensurePlansSeeded() {
  for (const defaults of PLAN_DEFAULTS) {
    const exists = await Plan.exists({ slug: defaults.slug })
    if (!exists) {
      await Plan.create(defaults)
      console.log(`Seeded plan: ${defaults.slug}`)
    }
  }

  // Additive, non-destructive migration: plans created before the AI trial
  // existed have no `limits.aiTrialExperiences` at all. Fill in the default
  // only where the field is missing — never overwrite an admin's value.
  for (const defaults of PLAN_DEFAULTS) {
    const trial = defaults.limits.aiTrialExperiences
    if (trial === undefined) continue
    await Plan.updateOne(
      { slug: defaults.slug, 'limits.aiTrialExperiences': { $exists: false } },
      { $set: { 'limits.aiTrialExperiences': trial } }
    )
  }
}

export async function getFreePlan() {
  const plan = await Plan.findOne({ slug: 'free' })
  if (!plan) throw new Error('Free plan is not seeded — check server boot logs')
  return plan
}
