/**
 * Small, dependency-free security middleware. Deliberately minimal: the
 * API serves JSON only (the SPA is served separately by Vite/static
 * hosting), so a strict default CSP and the usual hardening headers are
 * enough here.
 */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  res.removeHeader('X-Powered-By')
  next()
}

/**
 * Fixed-window in-memory rate limiter keyed by client IP (plus an optional
 * key function). Good enough for a single-instance MVP; behind multiple
 * instances each instance enforces its own window, which still bounds abuse.
 * Set `app.set('trust proxy', ...)` via TRUST_PROXY so req.ip is the real
 * client address behind a load balancer.
 */
export function rateLimit({ windowMs, max, keyFn, message = 'Too many requests — please slow down and try again shortly' }) {
  const hits = new Map()
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
  }, windowMs)
  timer.unref?.()

  return function rateLimitMiddleware(req, res, next) {
    if (process.env.DISABLE_RATE_LIMIT === 'true') return next()
    const key = `${req.ip}|${keyFn ? keyFn(req) : ''}`
    const now = Date.now()
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }
    entry.count += 1
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
      return res.status(429).json({ error: message })
    }
    next()
  }
}

/**
 * In production, 5xx JSON bodies never include `detail` (raw internal error
 * messages, which can contain provider responses, query fragments, etc.).
 * Many existing routes return `{ error, detail: err.message }`; stripping it
 * centrally keeps those handlers unchanged while closing the leak.
 */
export function stripErrorDetailsInProduction(_req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next()
  const json = res.json.bind(res)
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && 'detail' in body) {
      const { detail, ...rest } = body
      return json(rest)
    }
    return json(body)
  }
  next()
}
