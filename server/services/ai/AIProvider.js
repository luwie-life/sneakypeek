/**
 * AIProvider — the contract every AI backend must satisfy.
 *
 * Swapping providers (Anthropic, OpenAI, a local model, ...) should never
 * require touching generateExperience.js, sectionActions.js, or any route.
 * Only providers/index.js needs to change.
 */
export class AIProvider {
  /**
   * Ask the model for a response and get raw text back.
   * @param {object} params
   * @param {string} params.system - system prompt
   * @param {string} params.prompt - user prompt
   * @param {number} [params.maxTokens]
   * @returns {Promise<string>} raw text response
   */
  // eslint-disable-next-line no-unused-vars
  async complete({ system, prompt, maxTokens }) {
    throw new Error('complete() not implemented by this provider')
  }

  /**
   * Ask the model for a response and get it back as parsed JSON.
   * Providers are responsible for instructing the model to emit only JSON
   * and for stripping any stray markdown fencing before parsing.
   * @param {object} params
   * @param {string} params.system
   * @param {string} params.prompt
   * @param {number} [params.maxTokens]
   * @returns {Promise<any>} parsed JSON
   */
  // eslint-disable-next-line no-unused-vars
  async completeJSON({ system, prompt, maxTokens }) {
    throw new Error('completeJSON() not implemented by this provider')
  }
}
