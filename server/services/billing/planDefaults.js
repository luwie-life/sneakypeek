/**
 * These are only the initial defaults, written to the Plan collection on
 * first boot. After that, the database is the source of truth — change a
 * price or limit there and it takes effect everywhere without a frontend
 * deploy. Re-running the seed only fills in plans that don't exist yet;
 * it never overwrites a plan someone has already edited.
 */
export const PLAN_DEFAULTS = [
  {
    name: 'Free',
    slug: 'free',
    monthlyPriceCents: 0,
    order: 0,
    description: 'Try Sneaky Peek — upgrade to unlock AI.',
    providerPriceId: '',
    // AI remains visible in the UI (AI Studio, section actions, etc. are
    // never hidden) — the server-side limit of 0 is what actually blocks
    // it. See AiUpgradePrompt for the paid-feature upsell this produces.
    features: { aiStudio: true, analytics: true },
    limits: {
      maxExperiences: 1,
      aiGenerationsPerMonth: 0,
      analyticsRetentionDays: 7,
      maxTeamMembers: 1,
      storageMB: 100,
    },
  },
  {
    name: 'Starter',
    slug: 'starter',
    monthlyPriceCents: 500,
    order: 1,
    description: 'For creators publishing their first few experiences.',
    providerPriceId: '',
    features: { aiStudio: true, analytics: true },
    limits: {
      maxExperiences: 5,
      aiGenerationsPerMonth: 50,
      analyticsRetentionDays: 30,
      maxTeamMembers: 1,
      storageMB: 500,
    },
  },
  {
    name: 'Creator',
    slug: 'creator',
    monthlyPriceCents: 1000,
    order: 2,
    description: 'For active creators running a growing catalog.',
    providerPriceId: '',
    features: { aiStudio: true, analytics: true },
    limits: {
      maxExperiences: 20,
      aiGenerationsPerMonth: 200,
      analyticsRetentionDays: 90,
      maxTeamMembers: 2,
      storageMB: 2000,
    },
  },
  {
    name: 'Pro',
    slug: 'pro',
    monthlyPriceCents: 2000,
    order: 3,
    description: 'For businesses that depend on Sneaky Peek daily.',
    providerPriceId: '',
    features: { aiStudio: true, analytics: true },
    limits: {
      maxExperiences: 100,
      aiGenerationsPerMonth: 1000,
      analyticsRetentionDays: -1,
      maxTeamMembers: 5,
      storageMB: 10000,
    },
  },
  {
    name: 'Business',
    slug: 'business',
    monthlyPriceCents: 5000,
    order: 4,
    description: 'For teams and larger catalogs, with no meaningful caps.',
    providerPriceId: '',
    features: { aiStudio: true, analytics: true },
    limits: {
      maxExperiences: -1,
      aiGenerationsPerMonth: -1,
      analyticsRetentionDays: -1,
      maxTeamMembers: 20,
      storageMB: 50000,
    },
  },
]
