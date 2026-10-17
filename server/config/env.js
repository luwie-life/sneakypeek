/**
 * Boot-time configuration checks. Fails fast on settings that would make the
 * app insecure (missing JWT secret, mock billing in production) rather than
 * discovering them at request time.
 */
export function validateEnv(env = process.env) {
  const errors = []
  const warnings = []
  const isProd = env.NODE_ENV === 'production'

  if (!env.JWT_SECRET) errors.push('JWT_SECRET is required')
  else if (isProd && env.JWT_SECRET.length < 32) errors.push('JWT_SECRET must be at least 32 characters in production')

  if (!env.MONGODB_URI) errors.push('MONGODB_URI is required')

  const billing = env.BILLING_PROVIDER || 'flutterwave'
  if (isProd && billing === 'mock' && env.ALLOW_MOCK_BILLING !== 'true') {
    errors.push('BILLING_PROVIDER=mock is not allowed in production (it grants paid plans without payment)')
  }
  if (billing === 'flutterwave') {
    if (!env.FLW_SECRET_KEY) warnings.push('FLW_SECRET_KEY is not set — paid checkout will fail')
    if (!env.FLW_SECRET_HASH) warnings.push('FLW_SECRET_HASH is not set — Flutterwave webhooks will be rejected')
  }

  const ai = env.AI_PROVIDER || 'anthropic'
  if (isProd && ai === 'mock' && env.ALLOW_MOCK_AI !== 'true') {
    errors.push('AI_PROVIDER=mock is not allowed in production')
  }
  if (ai === 'anthropic' && !env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY is not set — AI generation will fall back to the non-AI starter draft')

  if (isProd && !env.APP_URL) errors.push('APP_URL is required in production (used for payment redirects and CORS)')

  return { errors, warnings }
}
