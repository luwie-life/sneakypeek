import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, MANUSCRIPT } from './helpers.js'
import { isExcerptGrounded, pickExcerpt, validateGenerated, buildFallbackExperience } from '../services/ai/generateExperience.js'
import { getSectionFlow } from '../services/ai/templates.js'

test('excerpt grounding: verbatim passages pass, invented ones fail', () => {
  const real = 'He set the envelope on the table beside the lamp and did not open it. Outside, the sea kept its own counsel, grey and patient, folding itself against the rocks below.'
  assert.equal(isExcerptGrounded(real, MANUSCRIPT), true)
  assert.equal(isExcerptGrounded(real.replace(/\s+/g, '  '), MANUSCRIPT), true, 'whitespace differences tolerated')
  const invented = 'The keeper drew his sword and charged into the burning castle while dragons circled overhead in the crimson sky.'
  assert.equal(isExcerptGrounded(invented, MANUSCRIPT), false)
  assert.equal(isExcerptGrounded(real, ''), false, 'no material → nothing can be grounded')
})

test('pickExcerpt returns real paragraphs only', () => {
  const ex = pickExcerpt(MANUSCRIPT, 400)
  assert.ok(ex.length > 80 && ex.length <= 400)
  assert.equal(isExcerptGrounded(ex, MANUSCRIPT), true)
  assert.equal(pickExcerpt('too short'), '')
})

test('validateGenerated replaces an invented excerpt and drops it when there is no material', () => {
  const flow = getSectionFlow('book')
  const parsed = {
    hook: 'A hook',
    sections: [
      { type: 'hook', heading: 'Hi', body: 'Opening line.' },
      { type: 'excerpt', heading: 'Sample', body: 'Completely invented prose that never appeared anywhere in the manuscript at all, honestly.' },
      { type: 'made_up_type', heading: 'X', body: 'Body text' },
    ],
  }
  const withMaterial = validateGenerated(parsed, flow, MANUSCRIPT)
  const excerpt = withMaterial.sections.find((s) => s.type === 'excerpt')
  assert.equal(isExcerptGrounded(excerpt.body, MANUSCRIPT), true)
  assert.ok(withMaterial.notes.some((n) => /directly from your material/.test(n)))
  assert.ok(withMaterial.sections.some((s) => s.type === 'cta'), 'a CTA is always added')
  assert.ok(withMaterial.sections.every((s) => s.visibility === 'free'))

  const noMaterial = validateGenerated(parsed, flow, '')
  assert.ok(!noMaterial.sections.some((s) => s.type === 'excerpt'), 'never keeps invented excerpt text')
  assert.throws(() => validateGenerated({ sections: [] }, flow, ''), /no usable sections/)
})

test('product types get different flows', () => {
  const types = (pt) => getSectionFlow(pt).map((s) => s.type).join(',')
  assert.notEqual(types('book'), types('course'))
  assert.ok(getSectionFlow('course').some((s) => s.type === 'quiz' || s.type === 'mini_lesson'))
  assert.ok(getSectionFlow('template').some((s) => s.type === 'template_preview'))
  assert.ok(!getSectionFlow('book').some((s) => s.type === 'social_proof'), 'no invented testimonials section')
})

test('fallback draft uses only creator-provided facts', () => {
  const draft = buildFallbackExperience(
    { title: 'Budget Sheet', productType: 'template', description: 'A spreadsheet for monthly budgets.', keyBenefits: ['Simple', 'Fast'], promise: 'Know where your money goes.' },
    { materialsText: '' }
  )
  const text = JSON.stringify(draft.sections)
  assert.ok(text.includes('A spreadsheet for monthly budgets.'))
  assert.ok(!/testimonial|5 stars|thousands of/i.test(text))
  assert.ok(draft.sections.some((s) => s.type === 'cta'))
  assert.ok(draft.notes[0].includes('AI was unavailable'))
})

let t
before(async () => {
  t = await startTestServer()
})
after(async () => {
  await t.stop()
})

test('AI outage: empty experience gets a starter draft; existing sections are kept', async () => {
  const admin = await t.signup({ name: 'Admin' })
  await t.mongoose.model('User').updateOne({ _id: admin.user._id ?? admin.user.id }, { $set: { role: 'admin' } })
  const u = await t.signup()
  await t.api('POST', `/api/admin/users/${u.user._id ?? u.user.id}/grant-access`, { token: admin.token, body: { planSlug: 'creator', durationDays: 30, reason: 'beta' } })
  const exp = (await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'Outage Guide', productType: 'guide', description: 'How to plan a garden.' } })).data.experience

  process.env.MOCK_AI_FAIL = 'true'
  try {
    const first = await t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token })
    assert.equal(first.status, 200)
    assert.equal(first.data.fallback, true)
    assert.equal(first.data.experience.generationSource, 'fallback')
    const second = await t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token })
    assert.equal(second.status, 502, 'never overwrites existing work with a fallback')
    const after = await t.api('GET', `/api/experiences/${exp._id}`, { token: u.token })
    assert.equal(after.data.experience.sections.length, first.data.experience.sections.length)
  } finally {
    delete process.env.MOCK_AI_FAIL
  }
  const s = await t.api('GET', '/api/billing/subscription', { token: u.token })
  assert.equal(s.data.usage.aiGenerations.used, 0, 'failed AI calls are not counted')

  // Once the provider recovers, generation works again.
  const ok = await t.api('POST', `/api/experiences/${exp._id}/generate`, { token: u.token })
  assert.equal(ok.status, 200)
})
