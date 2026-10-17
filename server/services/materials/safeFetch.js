import dns from 'dns/promises'
import net from 'net'

/**
 * Fetches a creator-supplied URL for text extraction without letting it be
 * used for SSRF: only http(s), only public IP addresses (checked after DNS
 * resolution and again on every redirect hop), bounded size and time.
 *
 * Note: there is a small DNS-rebinding window between our lookup and
 * fetch()'s own lookup. For an MVP that only extracts text (the response
 * body is never returned verbatim to anyone but the creator's AI prompt),
 * this check removes the practical attack (cloud metadata, localhost,
 * private network) without adding a custom HTTP agent.
 */

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10000
const MAX_REDIRECTS = 3

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    return false
  }
  return true
}

async function assertPublicHost(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs can be fetched')
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^localhost$/i.test(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('That address is not publicly reachable')
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That address is not publicly reachable')
  }
}

export async function safeFetchText(rawUrl, { fetchImpl = fetch, resolveCheck = assertPublicHost } = {}) {
  let url = new URL(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await resolveCheck(url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res
    try {
      res = await fetchImpl(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'SneakyPeekBot/1.0 (+material extraction)' } })
    } catch (err) {
      clearTimeout(timer)
      throw new Error(err.name === 'AbortError' ? 'Fetching URL timed out' : 'Could not reach that URL')
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer)
      url = new URL(res.headers.get('location'), url)
      continue
    }
    if (!res.ok) {
      clearTimeout(timer)
      throw new Error(`Fetching URL failed (${res.status})`)
    }
    const type = res.headers.get('content-type') || ''
    if (type && !/text\/|application\/(xhtml\+xml|xml|json)/i.test(type)) {
      clearTimeout(timer)
      throw new Error('That URL is not a web page or text document')
    }
    // Read with a hard byte cap rather than trusting Content-Length.
    const reader = res.body?.getReader?.()
    if (!reader) {
      const text = await res.text()
      clearTimeout(timer)
      return text.slice(0, MAX_BYTES)
    }
    const chunks = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > MAX_BYTES) {
          chunks.push(value.subarray(0, value.length - (total - MAX_BYTES)))
          await reader.cancel().catch(() => {})
          break
        }
        chunks.push(value)
      }
    } finally {
      clearTimeout(timer)
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
  }
  throw new Error('Too many redirects')
}
