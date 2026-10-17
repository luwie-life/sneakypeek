import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, PNG_1PX } from './helpers.js'
import { isPrivateAddress, safeFetchText } from '../services/materials/safeFetch.js'
import { detectFileType, contentDisposition } from '../services/materials/fileTypes.js'
import { validateCheckoutUrl, normalizeSections, MAX_SECTIONS } from '../services/experience/sections.js'
import { validateEnv } from '../config/env.js'

let t
before(async () => {
  t = await startTestServer()
})
after(async () => {
  await t.stop()
})

async function makeAdmin() {
  const a = await t.signup({ name: 'Admin' })
  await t.mongoose.model('User').updateOne({ _id: a.user._id ?? a.user.id }, { $set: { role: 'admin' } })
  return a
}

test('SSRF guard: private, loopback, link-local and metadata addresses are refused', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip)

  await assert.rejects(safeFetchText('http://localhost:5000/api/health'), /not publicly reachable/)
  await assert.rejects(safeFetchText('http://169.254.169.254/latest/meta-data/'), /not publicly reachable/)
  await assert.rejects(safeFetchText('file:///etc/passwd'), /Only http/)
  await assert.rejects(safeFetchText('http://user:pass@example.com/'), /credentials/)

  // A public URL that redirects to an internal address is refused at the redirect hop.
  const fetchImpl = async (url) =>
    String(url).startsWith('https://public.example')
      ? new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
      : new Response('secret', { status: 200, headers: { 'content-type': 'text/plain' } })
  const resolveCheck = async (url) => {
    if (url.hostname === '127.0.0.1') throw new Error('That address is not publicly reachable')
  }
  await assert.rejects(safeFetchText('https://public.example/page', { fetchImpl, resolveCheck }), /not publicly reachable/)
})

test('URL material pointing at the API itself fails safely', async () => {
  const u = await t.signup()
  const exp = (await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'SSRF probe' } })).data.experience
  const res = await t.api('POST', `/api/experiences/${exp._id}/materials`, { token: u.token, body: { type: 'url', url: `${t.base}/api/health` } })
  assert.equal(res.status, 201)
  assert.equal(res.data.material.status, 'failed')
  assert.match(res.data.material.processingError, /not publicly reachable/)
  const bad = await t.api('POST', `/api/experiences/${exp._id}/materials`, { token: u.token, body: { type: 'file', content: 'x' } })
  assert.equal(bad.status, 400, 'deliverable-only material types cannot be created as source text')
})

test('file type detection uses content, not names or client mimetypes', () => {
  assert.equal(detectFileType(PNG_1PX, 'cover.png').mime, 'image/png')
  assert.equal(detectFileType(Buffer.from('%PDF-1.4 ...'), 'x.bin').ext, 'pdf')
  assert.equal(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.svg'), null)
  assert.equal(detectFileType(Buffer.from('<!DOCTYPE html><html></html>'), 'page.txt'), null)
  assert.equal(detectFileType(Buffer.from('<html><body>hi</body></html>'), 'notes.md'), null)
  assert.equal(detectFileType(Buffer.from('MZ\x90\x00binary'), 'tool.exe'), null)
  assert.equal(detectFileType(Buffer.from('plain words only'), 'notes.txt').mime, 'text/plain')
  assert.match(contentDisposition('résumé "final".pdf'), /^attachment; filename="r_sum_ _final_.pdf"; filename\*=UTF-8''r%C3%A9sum%C3%A9/)
})

test('checkout URLs and section payloads are validated', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example', 'ftp://x.example', 'https://']) {
    assert.throws(() => validateCheckoutUrl(bad), undefined, bad)
  }
  assert.equal(validateCheckoutUrl(' https://gumroad.com/l/book '), 'https://gumroad.com/l/book')
  assert.equal(validateCheckoutUrl(''), '')
  assert.throws(() => normalizeSections(Array.from({ length: MAX_SECTIONS + 1 }, () => ({ type: 'hook', body: 'x' }))), /at most/)
  const [quiz] = normalizeSections([{ type: 'quiz', data: { questions: [{ question: 'Q?', options: ['a', 'b'], answerIndex: 7 }] } }])
  assert.ok(quiz.data.questions[0].answerIndex < 2, 'out-of-range quiz answers are clamped/removed')
})

test('JSON parse errors, unknown routes and invalid ids return clean errors (no hangs)', async () => {
  const bad = await t.api('POST', '/api/auth/login', { body: '{not json', headers: {} })
  assert.equal(bad.status, 400)
  assert.equal((await t.api('GET', '/api/nope')).status, 404)
  const u = await t.signup()
  assert.equal((await t.api('GET', '/api/experiences/123/materials', { token: u.token })).status, 404)
  const res = await t.api('GET', '/api/health')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('x-powered-by'), null)
})

test('auth input validation rejects NoSQL operators and weak input', async () => {
  const op = await t.api('POST', '/api/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } })
  assert.equal(op.status, 400)
  const short = await t.api('POST', '/api/auth/signup', { body: { name: 'x', email: 'x@example.com', password: '123' } })
  assert.equal(short.status, 400)
  const email = await t.api('POST', '/api/auth/signup', { body: { name: 'x', email: 'not-an-email', password: 'password123' } })
  assert.equal(email.status, 400)
  // Forged token signed with another secret / alg none.
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: '0'.repeat(24) })).toString('base64url') + '.'
  assert.equal((await t.api('GET', '/api/auth/me', { token: none })).status, 401)
})

test('login is rate limited', async () => {
  delete process.env.DISABLE_RATE_LIMIT
  try {
    let last
    for (let i = 0; i < 22; i++) {
      last = await t.api('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'wrong-password' } })
    }
    assert.equal(last.status, 429)
    assert.ok(last.headers.get('retry-after'))
  } finally {
    process.env.DISABLE_RATE_LIMIT = 'true'
  }
})

test('a disabled account loses access immediately, including existing tokens', async () => {
  const admin = await makeAdmin()
  const u = await t.signup()
  assert.equal((await t.api('GET', '/api/experiences', { token: u.token })).status, 200)
  const dis = await t.api('PATCH', `/api/admin/users/${u.user._id ?? u.user.id}/disabled`, { token: admin.token, body: { disabled: true } })
  assert.equal(dis.status, 200)
  assert.equal((await t.api('GET', '/api/experiences', { token: u.token })).status, 401)
  assert.equal((await t.api('POST', '/api/auth/login', { body: { email: u.email, password: 'password123' } })).status, 403)
})

test('non-admins cannot reach admin APIs', async () => {
  const u = await t.signup()
  for (const path of ['/api/admin/users', '/api/admin/plans', '/api/admin/settings', '/api/admin/overview', '/api/admin/payments']) {
    assert.equal((await t.api('GET', path, { token: u.token })).status, 403, path)
  }
  assert.equal((await t.api('GET', '/api/admin/users')).status, 401)
})

test('maintenance mode is enforced server-side (admins and webhooks still work)', async () => {
  const admin = await makeAdmin()
  const u = await t.signup()
  const on = await t.api('PATCH', '/api/admin/settings', { token: admin.token, body: { maintenanceMode: true } })
  assert.equal(on.status, 200, JSON.stringify(on.data))
  try {
    const blocked = await t.api('GET', '/api/experiences', { token: u.token })
    assert.equal(blocked.status, 503)
    assert.equal(blocked.data.maintenance, true)
    assert.equal((await t.api('GET', '/api/experiences', { token: admin.token })).status, 200)
    assert.equal((await t.api('GET', '/api/health')).status, 200)
    assert.notEqual((await t.api('POST', '/api/billing/webhook', { body: { event: 'noop', data: {} } })).status, 503)
  } finally {
    await t.api('PATCH', '/api/admin/settings', { token: admin.token, body: { maintenanceMode: false } })
  }
  assert.equal((await t.api('GET', '/api/experiences', { token: u.token })).status, 200)
})

test('concurrent AI requests from one account: one runs, the other gets 409', async () => {
  const { _setAIProvider, getAIProvider } = await import('../services/ai/index.js')
  const real = getAIProvider()
  const slow = Object.create(real)
  slow.completeStructured = async (args) => {
    await new Promise((r) => setTimeout(r, 400))
    return real.completeStructured(args)
  }
  _setAIProvider(slow)
  try {
    const admin = await makeAdmin()
    const u = await t.signup()
    await t.api('POST', `/api/admin/users/${u.user._id ?? u.user.id}/grant-access`, { token: admin.token, body: { planSlug: 'creator', durationDays: 30, reason: 'beta' } })
    const exp = (await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'Race', productType: 'guide', description: 'A guide.' } })).data.experience
    const [a, b] = await Promise.all([
      t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token }),
      t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token }),
    ])
    const statuses = [a.status, b.status].sort()
    assert.deepEqual(statuses, [200, 409])
    assert.equal([a, b].find((r) => r.status === 409).data.aiBusy, true)
    const s = await t.api('GET', '/api/billing/subscription', { token: u.token })
    assert.equal(s.data.usage.aiGenerations.used, 1, 'only the request that ran is counted')
    // Lock released after completion.
    const again = await t.api('POST', `/api/experiences/${exp._id}/sections/0/action`, { token: u.token, body: { action: 'shorten' } })
    assert.equal(again.status, 200, JSON.stringify(again.data))
  } finally {
    _setAIProvider(real)
  }
})

test('production hides internal error details and refuses unsafe configuration', async () => {
  const prev = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  process.env.MOCK_AI_FAIL = 'true'
  try {
    const admin = await makeAdmin()
    const u = await t.signup()
    await t.api('POST', `/api/admin/users/${u.user._id ?? u.user.id}/grant-access`, { token: admin.token, body: { planSlug: 'creator', durationDays: 30, reason: 'beta' } })
    const exp = (await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'Prod', productType: 'guide', description: 'A guide.' } })).data.experience
    await t.api('POST', `/api/experiences/${exp._id}/starter-draft`, { token: u.token })
    const res = await t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token })
    assert.equal(res.status, 502)
    assert.equal(res.data.detail, undefined, 'raw provider error not leaked in production')
    const s = await t.api('GET', '/api/billing/subscription', { token: u.token })
    assert.equal(s.data.usage.aiGenerations.used, 0, 'failed AI calls are not billed')
  } finally {
    process.env.NODE_ENV = prev
    delete process.env.MOCK_AI_FAIL
  }

  const base = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), MONGODB_URI: 'mongodb://db', APP_URL: 'https://app.example', ANTHROPIC_API_KEY: 'k', FLW_SECRET_KEY: 'k', FLW_SECRET_HASH: 'h' }
  assert.deepEqual(validateEnv(base).errors, [])
  assert.ok(validateEnv({ ...base, BILLING_PROVIDER: 'mock' }).errors.some((e) => /mock/.test(e)))
  assert.ok(validateEnv({ ...base, AI_PROVIDER: 'mock' }).errors.some((e) => /mock/.test(e)))
  assert.ok(validateEnv({ ...base, JWT_SECRET: 'short' }).errors.length)
  assert.ok(validateEnv({ ...base, APP_URL: '' }).errors.length)
})

test('storage quota is enforced on uploads', async () => {
  const u = await t.signup()
  const exp = (await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'Big files' } })).data.experience
  await t.mongoose.model('Plan').updateOne({ slug: 'free' }, { $set: { 'limits.storageMB': 0.001 } })
  try {
    const form = new FormData()
    form.append('file', new Blob([Buffer.alloc(4096, 'a')]), 'big.txt')
    const res = await t.api('POST', `/api/experiences/${exp._id}/deliverables`, { token: u.token, form })
    assert.equal(res.status, 402)
    assert.equal(res.data.limitKey, 'storageMB')
  } finally {
    await t.mongoose.model('Plan').updateOne({ slug: 'free' }, { $set: { 'limits.storageMB': 100 } })
  }
})
