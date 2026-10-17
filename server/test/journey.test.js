import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, makePdf, PNG_1PX, fileForm, MANUSCRIPT } from './helpers.js'

let t
before(async () => {
  t = await startTestServer()
})
after(async () => {
  await t.stop()
})

const state = {}

test('creator registers, authenticates and gets a Free subscription', async () => {
  const { token, user, email } = await t.signup({ name: 'Ada Writer' })
  assert.ok(token)
  assert.equal(user.passwordHash, undefined, 'password hash must never be returned')
  state.token = token
  state.email = email

  const login = await t.api('POST', '/api/auth/login', { body: { email, password: 'password123' } })
  assert.equal(login.status, 200)
  const bad = await t.api('POST', '/api/auth/login', { body: { email, password: 'wrong-password' } })
  assert.equal(bad.status, 401)

  const me = await t.api('GET', '/api/auth/me', { token })
  assert.equal(me.status, 200)
  assert.equal(me.data.user.email, email)

  const sub = await t.api('GET', '/api/billing/subscription', { token })
  assert.equal(sub.data.plan.slug, 'free')
  assert.equal(sub.data.usage.aiTrial.available, true, 'free plan includes the one-time AI trial')
})

test('creator creates a product, adds source material (text + PDF)', async () => {
  const created = await t.api('POST', '/api/experiences', {
    token: state.token,
    body: {
      title: 'The Keeper',
      productType: 'book',
      description: 'A literary novel about a lighthouse keeper called back to the life he left.',
      targetAudience: 'Readers of quiet literary fiction',
      promise: 'A moving story about returning home.',
      authorName: 'Ada Writer',
      keyBenefits: ['Lyrical prose', 'A slow-burn mystery'],
    },
  })
  assert.equal(created.status, 201)
  state.exp = created.data.experience
  assert.match(state.exp.slug, /^the-keeper-/)

  const text = await t.api('POST', `/api/experiences/${state.exp._id}/materials`, {
    token: state.token,
    body: { type: 'pasted', name: 'Chapter 1', content: MANUSCRIPT },
  })
  assert.equal(text.status, 201)
  assert.equal(text.data.material.status, 'ready')

  const pdf = await t.api('POST', `/api/experiences/${state.exp._id}/materials/upload`, {
    token: state.token,
    form: fileForm(makePdf('Hello Sneaky Peek test PDF'), 'sample.pdf', {}, 'application/pdf'),
  })
  assert.equal(pdf.status, 201, JSON.stringify(pdf.data))
  assert.equal(pdf.data.material.status, 'ready', pdf.data.material.processingError)
  assert.match(pdf.data.material.extractedText, /Hello Sneaky Peek test PDF/)

  // A non-PDF disguised as a PDF is rejected by content, not by its name/mimetype.
  const fake = await t.api('POST', `/api/experiences/${state.exp._id}/materials/upload`, {
    token: state.token,
    form: fileForm(Buffer.from('<html><script>alert(1)</script></html>'), 'evil.pdf', {}, 'application/pdf'),
  })
  assert.equal(fake.status, 400)

  const list = await t.api('GET', `/api/experiences/${state.exp._id}/materials`, { token: state.token })
  assert.equal(list.data.materials.length, 2)
})

test('free AI trial: one analysis + one generation, then blocked server-side', async () => {
  const analyze = await t.api('POST', `/api/experiences/${state.exp._id}/analyze`, { token: state.token })
  assert.equal(analyze.status, 200, JSON.stringify(analyze.data))
  assert.ok(analyze.data.productUnderstanding.missingInformation.length > 0, 'understanding lists facts the creator must provide')

  const gen = await t.api('POST', `/api/experiences/${state.exp._id}/generate`, { token: state.token })
  assert.equal(gen.status, 200, JSON.stringify(gen.data))
  const sections = gen.data.experience.sections
  assert.ok(sections.length >= 4)
  assert.equal(gen.data.experience.generationSource, 'ai')
  assert.ok(sections.every((s) => s.id && s.visibility), 'sections get stable ids and visibility')
  assert.ok(sections.some((s) => s.type === 'cta'))
  const excerpt = sections.find((s) => s.type === 'excerpt')
  assert.ok(excerpt, 'book flow includes an excerpt when manuscript text exists')
  assert.ok(MANUSCRIPT.replace(/\s+/g, ' ').includes(excerpt.body.replace(/\s+/g, ' ').slice(0, 60)), 'excerpt is verbatim from the material')
  const faq = sections.find((s) => s.type === 'faq')
  assert.ok(faq?.data?.items?.length, 'structured data survives validation')

  // Trial is used up: a second generation, a section action, and a trial on another experience are all blocked.
  const again = await t.api('POST', `/api/experiences/${state.exp._id}/generate`, { token: state.token })
  assert.equal(again.status, 402)
  assert.equal(again.data.trialUsed, true)
  const action = await t.api('POST', `/api/experiences/${state.exp._id}/sections/0/action`, { token: state.token, body: { action: 'shorten' } })
  assert.equal(action.status, 402)

  const sub = await t.api('GET', '/api/billing/subscription', { token: state.token })
  assert.equal(sub.data.usage.aiTrial.generateUsed, true)
  assert.equal(sub.data.usage.aiGenerations.used, 0, 'trial usage does not count against the monthly allowance')
  state.exp = gen.data.experience
})

test('non-AI starter draft is always available and refuses to overwrite without confirmation', async () => {
  const res = await t.api('POST', `/api/experiences/${state.exp._id}/starter-draft`, { token: state.token })
  assert.equal(res.status, 409)
  assert.equal(res.data.confirmReplace, true)
})

test('creator edits sections, sets locked content and a stopping point', async () => {
  const sections = state.exp.sections.map((s) => ({ ...s }))
  // Lock the insight section; add a quiz; stop after the excerpt.
  const insight = sections.find((s) => s.type === 'insight')
  insight.visibility = 'locked'
  insight.body = 'SECRET-LOCKED-INSIGHT the twist is revealed here'
  const excerptIndex = sections.findIndex((s) => s.type === 'excerpt')
  sections.splice(excerptIndex + 1, 0, {
    type: 'quiz',
    heading: 'Test yourself',
    data: { questions: [{ question: 'Who wrote the letter?', options: ['His brother', 'A stranger'], answerIndex: 0, explanation: 'Read on.' }] },
  })
  // Garbage that must be normalized away rather than stored.
  sections.push({ type: 'not-a-type', heading: 'x'.repeat(500), body: 'kept as text', data: { evil: { $where: 'x' } } })

  const curiosity = sections.findIndex((s) => s.type === 'curiosity_gap')
  const res = await t.api('PUT', `/api/experiences/${state.exp._id}`, {
    token: state.token,
    body: {
      sections,
      previewSettings: { stopAfterSection: curiosity - 1, lockedMessage: 'The rest is in the full book.', showLockedHeadings: true },
      ctaText: 'Get the book',
    },
  })
  assert.equal(res.status, 200, JSON.stringify(res.data))
  const saved = res.data.experience
  const other = saved.sections.find((s) => s.body === 'kept as text')
  assert.equal(other.type, 'other')
  assert.equal(other.heading.length, 200, 'headings are capped')
  assert.equal(other.data, undefined, 'unknown data is not stored')
  assert.equal(saved.previewSettings.stopAfterSection, curiosity - 1)
  state.exp = saved

  // Invalid stopping point rejected.
  const bad = await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { previewSettings: { stopAfterSection: -3 } } })
  assert.equal(bad.status, 400)
})

test('deliverables: upload free/restricted/private files with server-side type checks', async () => {
  const base = `/api/experiences/${state.exp._id}/deliverables`
  const cover = await t.api('POST', base, { token: state.token, form: fileForm(PNG_1PX, 'cover.png', { title: 'Cover', access: 'free' }, 'image/png') })
  assert.equal(cover.status, 201, JSON.stringify(cover.data))
  assert.equal(cover.data.deliverable.mimeType, 'image/png')

  const sample = await t.api('POST', base, { token: state.token, form: fileForm(makePdf('Free sample chapter'), 'sample.pdf', { title: 'Free sample chapter', access: 'free' }) })
  assert.equal(sample.status, 201)
  const full = await t.api('POST', base, { token: state.token, form: fileForm(makePdf('FULL BOOK CONTENT'), 'full-book.pdf', { title: 'Full book (PDF)', access: 'restricted' }) })
  assert.equal(full.status, 201)
  const priv = await t.api('POST', base, { token: state.token, form: fileForm(Buffer.from('notes only'), 'notes.txt', { title: 'Private notes' }) })
  assert.equal(priv.status, 201)
  assert.equal(priv.data.deliverable.access, 'private', 'files default to private')

  // Active content is refused even when named like an image.
  const svg = await t.api('POST', base, { token: state.token, form: fileForm(Buffer.from('<svg onload="alert(1)"></svg>'), 'x.png', {}, 'image/png') })
  assert.equal(svg.status, 400)
  const html = await t.api('POST', base, { token: state.token, form: fileForm(Buffer.from('<!doctype html><script>x</script>'), 'x.txt') })
  assert.equal(html.status, 400)

  Object.assign(state, { cover: cover.data.deliverable, sample: sample.data.deliverable, full: full.data.deliverable, priv: priv.data.deliverable })

  // Use the cover + a free download section.
  const sections = [...state.exp.sections]
  sections.splice(1, 0, { type: 'free_download', heading: 'Read chapter one offline', data: { assetId: state.sample._id } })
  // Referencing a restricted asset in a gallery is dropped from the public view.
  sections.splice(2, 0, { type: 'gallery', heading: 'Inside', data: { assetIds: [state.cover._id, state.full._id] } })
  const stop = state.exp.previewSettings.stopAfterSection + 2
  const put = await t.api('PUT', `/api/experiences/${state.exp._id}`, {
    token: state.token,
    body: { sections, coverAsset: state.cover._id, previewSettings: { ...state.exp.previewSettings, stopAfterSection: stop } },
  })
  assert.equal(put.status, 200, JSON.stringify(put.data))
  state.exp = put.data.experience

  // Cover must be free.
  const badCover = await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { coverAsset: state.full._id } })
  assert.equal(badCover.status, 400)
})

test('publishing requires a safe http(s) checkout URL', async () => {
  const noUrl = await t.api('POST', `/api/experiences/${state.exp._id}/publish`, { token: state.token })
  assert.equal(noUrl.status, 400)

  const xss = await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { checkoutUrl: 'javascript:alert(document.cookie)' } })
  assert.equal(xss.status, 400)

  const ok = await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { checkoutUrl: 'https://shop.example.com/the-keeper' } })
  assert.equal(ok.status, 200)
  const pub = await t.api('POST', `/api/experiences/${state.exp._id}/publish`, { token: state.token })
  assert.equal(pub.status, 200)
  assert.equal(pub.data.experience.status, 'published')
})

test('visitor sees free preview only — locked content never leaves the server', async () => {
  const res = await t.api('GET', `/api/public/experiences/${state.exp.slug}`)
  assert.equal(res.status, 200)
  const pub = res.data.experience
  const raw = JSON.stringify(res.data)

  assert.ok(!raw.includes('SECRET-LOCKED-INSIGHT'), 'locked section body is not in the public payload')
  assert.ok(!raw.includes('owner'), 'owner id is not exposed')
  assert.ok(!raw.includes('productUnderstanding'), 'AI understanding is not exposed')
  assert.ok(!raw.includes(state.full.fileName || 'full-book.pdf'), 'restricted file name is not exposed')
  assert.ok(!raw.includes(state.priv._id), 'private files are not listed at all')

  const locked = pub.sections.filter((s) => s.locked)
  assert.ok(locked.length >= 2, 'locked + post-stopping-point sections are placeholders')
  for (const s of locked) {
    assert.equal(s.body, undefined)
    assert.equal(s.data, undefined)
  }
  assert.ok(pub.sections.some((s) => s.type === 'cta' && !s.locked), 'CTA is always public')
  assert.equal(pub.ctaText, 'Get the book')
  assert.equal(pub.checkoutUrl, 'https://shop.example.com/the-keeper')
  assert.ok(pub.cover?.url)

  const gallery = pub.sections.find((s) => s.type === 'gallery')
  assert.equal(gallery.data.images.length, 1, 'restricted asset dropped from gallery')
  const dl = pub.sections.find((s) => s.type === 'free_download')
  assert.ok(dl.data.asset.url)

  const restricted = pub.deliverables.find((d) => d.access === 'restricted')
  assert.equal(restricted.url, null)
  assert.equal(restricted.title, 'Full book (PDF)')
  state.public = pub
})

test('visitor downloads free assets; restricted and private are refused', async () => {
  const free = await t.api('GET', `${state.public.deliverables.find((d) => d.access === 'free' && !d.isImage).url}?download=1&sid=sess_abcdefgh1`)
  assert.equal(free.status, 200)
  assert.match(free.headers.get('content-disposition'), /^attachment;/)
  assert.equal(free.headers.get('x-content-type-options'), 'nosniff')

  const cover = await t.api('GET', state.public.cover.url)
  assert.equal(cover.status, 200)
  assert.equal(cover.headers.get('content-type'), 'image/png')

  const restricted = await t.api('GET', `/api/public/experiences/${state.exp.slug}/assets/${state.full._id}`)
  assert.equal(restricted.status, 403)
  const priv = await t.api('GET', `/api/public/experiences/${state.exp.slug}/assets/${state.priv._id}`)
  assert.equal(priv.status, 404)
  const bogus = await t.api('GET', `/api/public/experiences/${state.exp.slug}/assets/../../server.js`)
  assert.equal(bogus.status, 404)
})

test('analytics: visitor events are deduplicated and only visitor event types are accepted', async () => {
  const slug = state.exp.slug
  const post = (body) => t.api('POST', `/api/public/experiences/${slug}/events`, { body })
  const sessions = ['sess_aaaaaaaa1', 'sess_bbbbbbbb2', 'sess_cccccccc3']
  for (const [i, sessionId] of sessions.entries()) {
    const visitorId = `vis_${i}_zzzzzzzz`
    await post({ eventType: 'experience_viewed', sessionId, visitorId })
    await post({ eventType: 'experience_viewed', sessionId, visitorId }) // duplicate
    await post({ eventType: 'experience_started', sessionId, visitorId })
    await post({ eventType: 'section_viewed', sessionId, sectionIndex: 0, sectionType: 'hook' })
    if (i < 2) await post({ eventType: 'section_viewed', sessionId, sectionIndex: 1 })
    if (i === 0) {
      await post({ eventType: 'interaction_completed', sessionId, sectionIndex: 1 })
      await post({ eventType: 'cta_viewed', sessionId })
      await post({ eventType: 'cta_clicked', sessionId })
      await post({ eventType: 'checkout_clicked', sessionId })
      await post({ eventType: 'checkout_clicked', sessionId }) // duplicate
    }
  }
  // Spoofing attempts: server-only event, bad session id, missing section index, bot UA.
  await post({ eventType: 'checkout_completed', sessionId: 'sess_dddddddd4' })
  await post({ eventType: 'experience_viewed', sessionId: 'x' })
  await post({ eventType: 'section_viewed', sessionId: 'sess_eeeeeeee5' })
  await t.api('POST', `/api/public/experiences/${slug}/events`, { body: { eventType: 'experience_viewed', sessionId: 'sess_botbotbot' }, headers: { 'User-Agent': 'Googlebot/2.1' } })
  await new Promise((r) => setTimeout(r, 300)) // events are recorded after the 202

  const res = await t.api('GET', `/api/experiences/${state.exp._id}/analytics?range=7d`, { token: state.token })
  assert.equal(res.status, 200, JSON.stringify(res.data))
  const s = res.data.summary
  assert.equal(s.views, 3)
  assert.equal(s.uniqueVisitors, 3)
  assert.equal(s.checkoutClicks, 1)
  assert.equal(s.ctaClicks, 1)
  assert.equal(s.interactions, 1)
  assert.equal(s.freeDownloads, 1)
  assert.ok(!('purchases' in s) && !('revenue' in s), 'no fabricated sales metrics')
  assert.equal(res.data.funnel.steps[0].count, 3)
  assert.equal(res.data.sections[0].views, 3)
  assert.equal(res.data.sections[1].views, 2)
  assert.equal(res.data.sections[0].stoppedHere, 1, 'one visitor stopped at the first section')
  assert.ok(res.data.notes[0].includes('not confirmed sales'))

  // Free plan retention is 7 days.
  const tooLong = await t.api('GET', `/api/experiences/${state.exp._id}/analytics?range=90d`, { token: state.token })
  assert.equal(tooLong.status, 402)
  assert.deepEqual(tooLong.data.allowedRanges, ['7d'])

  const summary = await t.api('GET', '/api/experiences/analytics/summary', { token: state.token })
  assert.equal(summary.status, 200)
  assert.equal(summary.data.experiences[0].visitors, 3)
})

test('storefront: creator publishes a branded page listing only published products', async () => {
  const sf0 = await t.api('GET', '/api/storefront', { token: state.token })
  assert.equal(sf0.data.storefront.published, false)
  assert.equal(sf0.data.storefront.suggestedSlug, 'ada-writer')

  const reserved = await t.api('PUT', '/api/storefront', { token: state.token, body: { slug: 'admin' } })
  assert.equal(reserved.status, 400)
  const noName = await t.api('PUT', '/api/storefront', { token: state.token, body: { slug: 'ada-writer', published: true } })
  assert.equal(noName.status, 400)
  const badLink = await t.api('PUT', '/api/storefront', { token: state.token, body: { links: [{ label: 'x', url: 'javascript:alert(1)' }] } })
  assert.equal(badLink.status, 400)

  const saved = await t.api('PUT', '/api/storefront', {
    token: state.token,
    body: { slug: 'ada-writer', displayName: 'Ada Writer', headline: 'Quiet novels', bio: 'I write about the sea.', links: [{ label: 'Newsletter', url: 'https://ada.example.com' }], published: true },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))

  // A second creator can't take the same slug, and has their own unpublished draft.
  const other = await t.signup({ name: 'Other' })
  const taken = await t.api('PUT', '/api/storefront', { token: other.token, body: { slug: 'ada-writer', displayName: 'Imposter' } })
  assert.equal(taken.status, 409)
  const draft = await t.api('POST', '/api/experiences', { token: state.token, body: { title: 'Unreleased', productType: 'guide' } })
  assert.equal(draft.status, 402, 'free plan allows one experience')

  const pub = await t.api('GET', '/api/public/storefronts/ada-writer')
  assert.equal(pub.status, 200)
  assert.equal(pub.data.products.length, 1)
  assert.equal(pub.data.products[0].slug, state.exp.slug)
  assert.ok(pub.data.products[0].coverUrl)
  const raw = JSON.stringify(pub.data)
  assert.ok(!raw.includes(state.email), 'account email never exposed')
  assert.ok(!raw.includes('"_id"'), 'no internal ids exposed')

  const missing = await t.api('GET', '/api/public/storefronts/no-such-creator')
  assert.equal(missing.status, 404)

  // The experience page links back to the storefront.
  const exp = await t.api('GET', `/api/public/experiences/${state.exp.slug}`)
  assert.equal(exp.data.experience.storefront.slug, 'ada-writer')

  // Hidden from storefront, then unpublished, then archived → handled gracefully.
  await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { showOnStorefront: false } })
  assert.equal((await t.api('GET', '/api/public/storefronts/ada-writer')).data.products.length, 0)
  await t.api('PUT', `/api/experiences/${state.exp._id}`, { token: state.token, body: { showOnStorefront: true } })
  await t.api('POST', `/api/experiences/${state.exp._id}/unpublish`, { token: state.token })
  assert.equal((await t.api('GET', '/api/public/storefronts/ada-writer')).data.products.length, 0)
  assert.equal((await t.api('GET', `/api/public/experiences/${state.exp.slug}`)).status, 404, 'unpublished experience is not public')
  assert.equal((await t.api('GET', `/api/public/experiences/${state.exp.slug}/assets/${state.sample._id}`)).status, 404, 'files of unpublished experiences are not public')
  await t.api('POST', `/api/experiences/${state.exp._id}/archive`, { token: state.token })
  const list = await t.api('GET', '/api/experiences', { token: state.token })
  assert.equal(list.data.experiences.length, 0, 'archived experiences are hidden from the default list')
  const restore = await t.api('POST', `/api/experiences/${state.exp._id}/restore`, { token: state.token })
  assert.equal(restore.status, 200)
  await t.api('POST', `/api/experiences/${state.exp._id}/publish`, { token: state.token })
})

test('cross-user access is denied by ownership checks', async () => {
  const intruder = await t.signup({ name: 'Intruder' })
  const id = state.exp._id
  const attempts = [
    ['GET', `/api/experiences/${id}`],
    ['PUT', `/api/experiences/${id}`, { title: 'pwned' }],
    ['DELETE', `/api/experiences/${id}`],
    ['POST', `/api/experiences/${id}/publish`],
    ['GET', `/api/experiences/${id}/analytics`],
    ['GET', `/api/experiences/${id}/materials`],
    ['GET', `/api/experiences/${id}/deliverables`],
    ['GET', `/api/experiences/${id}/deliverables/${state.full._id}/download`],
    ['PATCH', `/api/experiences/${id}/deliverables/${state.full._id}`, { access: 'free' }],
    ['DELETE', `/api/experiences/${id}/deliverables/${state.full._id}`],
  ]
  for (const [method, url, body] of attempts) {
    const res = await t.api(method, url, { token: intruder.token, body })
    assert.equal(res.status, 404, `${method} ${url} should be 404 for another user (got ${res.status})`)
  }
  // Moving someone else's material into your own experience by id manipulation also fails.
  const mine = await t.api('POST', '/api/experiences', { token: intruder.token, body: { title: 'Mine' } })
  const hijack = await t.api('GET', `/api/experiences/${mine.data.experience._id}/deliverables/${state.full._id}/download`, { token: intruder.token })
  assert.equal(hijack.status, 404)

  // Unauthenticated access.
  assert.equal((await t.api('GET', '/api/experiences')).status, 401)
  assert.equal((await t.api('GET', '/api/experiences', { token: 'not.a.jwt' })).status, 401)
  // Malformed ids return 404 promptly (previously the request hung on a CastError).
  assert.equal((await t.api('GET', '/api/experiences/not-an-id', { token: intruder.token })).status, 404)
})

test('deleting a deliverable removes its public references (no broken links)', async () => {
  const del = await t.api('DELETE', `/api/experiences/${state.exp._id}/deliverables/${state.sample._id}`, { token: state.token })
  assert.equal(del.status, 200)
  const exp = await t.api('GET', `/api/experiences/${state.exp._id}`, { token: state.token })
  assert.ok(!exp.data.experience.sections.some((s) => s.type === 'free_download'))
  const pub = await t.api('GET', `/api/public/experiences/${state.exp.slug}`)
  assert.ok(!JSON.stringify(pub.data).includes(state.sample._id))

  // Making the cover non-free unsets it.
  await t.api('PATCH', `/api/experiences/${state.exp._id}/deliverables/${state.cover._id}`, { token: state.token, body: { access: 'restricted' } })
  const after = await t.api('GET', `/api/experiences/${state.exp._id}`, { token: state.token })
  assert.equal(after.data.experience.coverAsset, null)
})

test('deleting an experience removes its files, materials and events', async () => {
  const ProductMaterial = t.mongoose.model('ProductMaterial')
  const Event = t.mongoose.model('Event')
  const res = await t.api('DELETE', `/api/experiences/${state.exp._id}`, { token: state.token })
  assert.equal(res.status, 200)
  assert.equal(await ProductMaterial.countDocuments({ experience: state.exp._id }), 0)
  assert.equal(await Event.countDocuments({ experience: state.exp._id }), 0)
})
