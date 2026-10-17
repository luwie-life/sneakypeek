import { AIProvider } from '../AIProvider.js'

/**
 * Deterministic, offline AI provider for tests and local development
 * without an API key (AI_PROVIDER=mock; refused in production unless
 * ALLOW_MOCK_AI=true). Returns schema-valid output derived from the prompt
 * so the full generate → edit → publish pipeline can be exercised.
 * Set MOCK_AI_FAIL=true to simulate a provider outage.
 */
export class MockAIProvider extends AIProvider {
  constructor() {
    super()
    this.configured = true
    this.calls = 0
  }

  _maybeFail() {
    this.calls += 1
    if (process.env.MOCK_AI_FAIL === 'true') throw new Error('Mock AI provider outage')
  }

  async complete({ prompt }) {
    this._maybeFail()
    return `Mock response for: ${String(prompt).slice(0, 40)}`
  }

  async completeJSON(args) {
    return this.completeStructured(args)
  }

  async completeStructured({ prompt, schemaName }) {
    this._maybeFail()
    const title = (String(prompt).match(/Title: (.+)/) || [])[1] || 'this product'

    if (schemaName === 'product_understanding') {
      return {
        productSummary: `${title} is a focused product described by its creator.`,
        audienceSummary: 'People described in the creator\'s stated audience.',
        coreProblem: 'The problem stated by the creator.',
        corePromise: 'The outcome stated by the creator.',
        whatItContains: ['The contents described by the creator'],
        keyBenefits: ['A clear, practical benefit'],
        keyInsights: ['One specific idea from the material'],
        importantTopics: ['Core topic'],
        differentiators: ['How the creator describes its approach'],
        strongestHooks: [`What if ${title} changed how you work?`],
        objections: ['Is this right for my level?'],
        customerQuestions: ['How long does it take?'],
        curiosityOpportunities: ['What comes after the first step?'],
        demonstrationIdeas: ['Show a short sample of the method'],
        missingInformation: ['Exact length or number of lessons'],
        recommendedSections: [{ type: 'hook', guidance: 'Lead with the core promise.' }],
      }
    }

    if (schemaName === 'experience') {
      const types = [...String(prompt).matchAll(/^\d+\. type: "([a-z_]+)"/gm)].map((m) => m[1])
      const sections = types.map((type) => mockSection(type, title, prompt))
      return { hook: `A closer look at ${title}`, sections, needsCreatorInput: ['Confirm the facts in the Q&A section'] }
    }

    if (schemaName === 'section') {
      const type = (String(prompt).match(/of type "([a-z_]+)"/) || [])[1] || 'other'
      return mockSection(type, title, prompt)
    }

    // section_action
    const body = (String(prompt).match(/Current body: ([\s\S]*?)\n\n/) || [])[1] || 'Updated text.'
    return { heading: 'Refined heading', body: `${body.trim()} (refined)` }
  }
}

function mockSection(type, title, prompt) {
  const base = { type, heading: `${type.replace(/_/g, ' ')}`, body: `About ${title}.` }
  switch (type) {
    case 'excerpt': {
      const material = (String(prompt).match(/"""\n([\s\S]*?)\n"""/) || [])[1]
      if (!material) return null
      // Cut at a sentence end so the deterministic excerpt reads naturally.
      const cut = material.slice(0, 400)
      const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
      return { ...base, body: end > 80 ? cut.slice(0, end + 1) : cut, data: { source: 'From the opening' } }
    }
    case 'quiz':
      return { ...base, data: { questions: [{ question: 'Which step comes first?', options: ['Plan', 'Ship'], answerIndex: 0, explanation: 'Planning first saves time.' }] } }
    case 'exercise':
      return { ...base, data: { prompt: 'Write down one goal.', placeholder: 'My goal is…' } }
    case 'mini_lesson':
    case 'framework':
      return { ...base, data: { steps: [{ title: 'Start', body: 'Begin small.' }, { title: 'Repeat', body: 'Build the habit.' }] } }
    case 'benefits':
    case 'whats_included':
    case 'what_they_will_learn':
    case 'tips':
    case 'checklist':
      return { ...base, data: { items: ['First point', 'Second point'] } }
    case 'template_preview':
    case 'specs':
      return { ...base, data: { pairs: [{ label: 'Example', value: 'Value' }] } }
    case 'faq':
      return { ...base, data: { items: [{ question: 'Who is it for?', answer: 'The audience the creator described.' }] } }
    case 'cta':
      return { ...base, data: { buttonText: 'Get it now' } }
    default:
      return base
  }
}
