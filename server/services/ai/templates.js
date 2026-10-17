/**
 * Each product type gets its own journey instead of one generic template.
 * "type" is a key from services/experience/sections.js SECTION_TYPES (which
 * also determines the structured `data` shape the model must return);
 * "guidance" tells the model what that section is for in this journey.
 *
 * Journey shape for every type: capture attention → relevance → a real
 * taste of the value (excerpt / mini-lesson / sample / specs) → an
 * interactive or practical element where it fits → curiosity → objections
 * → purchase CTA.
 */
export const SECTION_FLOWS = {
  book: [
    { type: 'hook', guidance: 'One or two lines that create immediate curiosity about the book.' },
    { type: 'context', guidance: 'Who this book is for and the question or itch it addresses.' },
    { type: 'excerpt', guidance: 'A real passage the reader can read now — copied VERBATIM from the supplied material, ending at a natural cliffhanger. Omit this section if no manuscript text was supplied.' },
    { type: 'insight', guidance: 'One genuinely interesting idea from the book, stated plainly.' },
    { type: 'curiosity_gap', guidance: 'Open a question the rest of the book answers — the natural stopping point.' },
    { type: 'faq', guidance: '2-4 questions a hesitant buyer would ask, answered ONLY from facts provided (length, format, who it is for). Omit questions you cannot answer from the facts.' },
    { type: 'cta', guidance: 'A short, confident invitation to get the full book.' },
  ],
  course: [
    { type: 'problem', guidance: 'The specific problem or frustration this course solves.' },
    { type: 'mini_lesson', guidance: 'A small, real lesson from the course in 2-4 steps the visitor can use immediately.' },
    { type: 'quiz', guidance: '2-3 multiple-choice questions that check understanding of the mini lesson, each with a short explanation.' },
    { type: 'exercise', guidance: 'A short reflection or practice prompt that applies the mini lesson to the visitor\'s own situation.' },
    { type: 'what_they_will_learn', guidance: 'What the full course covers, as a short list — only topics supported by the material.' },
    { type: 'result', guidance: 'The concrete outcome a student can expect after finishing.' },
    { type: 'faq', guidance: '2-4 likely objections (time, level, format) answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident invitation to enroll.' },
  ],
  guide: [
    { type: 'problem', guidance: 'The problem this guide solves, stated concretely.' },
    { type: 'tips', guidance: '3-5 actionable tips from the guide the reader can apply today.' },
    { type: 'framework', guidance: 'The guide\'s core framework or process as 3-6 named steps, each with one sentence.' },
    { type: 'excerpt', guidance: 'A short sample section copied VERBATIM from the supplied material. Omit if no guide text was supplied.' },
    { type: 'what_they_will_learn', guidance: 'What the complete guide covers, as a short list.' },
    { type: 'faq', guidance: '2-4 likely questions answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident invitation to get the full guide.' },
  ],
  template: [
    { type: 'problem', guidance: 'The tedious or hard problem this template removes.' },
    { type: 'template_preview', guidance: 'A realistic filled-in sample of the template as 4-8 label/value pairs (e.g. field name → example entry).' },
    { type: 'whats_included', guidance: 'Exactly what is included (files, pages, formats) — only items supported by the facts.' },
    { type: 'result', guidance: 'The intended outcome of using the template, with an example use case.' },
    { type: 'faq', guidance: '2-4 practical questions (tools required, customization) answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident invitation to get the template.' },
  ],
  audio: [
    { type: 'hook', guidance: 'A hook that captures the tone and appeal of this audio in one or two lines.' },
    { type: 'audio_preview', guidance: 'Describe a compelling moment from the audio, in words.' },
    { type: 'insight', guidance: 'One key idea listeners take away.' },
    { type: 'why_it_matters', guidance: 'Why this matters to the listener right now.' },
    { type: 'cta', guidance: 'A short, confident invitation to listen.' },
  ],
  digital: [
    { type: 'hook', guidance: 'What makes this digital product worth a closer look.' },
    { type: 'preview', guidance: 'A concrete description of the product in use.' },
    { type: 'benefits', guidance: 'The 3-5 clearest benefits, as a list.' },
    { type: 'whats_included', guidance: 'What the buyer receives — only items supported by the facts.' },
    { type: 'faq', guidance: '2-4 practical questions answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident invitation to get it.' },
  ],
  physical: [
    { type: 'hook', guidance: 'What makes this product desirable, in one or two lines.' },
    { type: 'preview', guidance: 'A concrete, sensory description of the product and how it is used.' },
    { type: 'benefits', guidance: 'The clearest practical benefits of owning it, as a list.' },
    { type: 'specs', guidance: 'Specifications as label/value pairs (size, materials, contents...) — ONLY values stated in the facts; omit the section if none are given.' },
    { type: 'faq', guidance: '2-4 buyer questions (shipping, care, sizing) answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident invitation to buy it.' },
  ],
  other: [
    { type: 'hook', guidance: 'A hook that creates curiosity about this offering.' },
    { type: 'introduction', guidance: 'What it is and who it is for.' },
    { type: 'benefits', guidance: 'The clearest benefits, as a list.' },
    { type: 'faq', guidance: '2-3 likely questions answered ONLY from facts provided.' },
    { type: 'cta', guidance: 'A short, confident call to action.' },
  ],
}

export function getSectionFlow(productType) {
  return SECTION_FLOWS[productType] || SECTION_FLOWS.other
}
