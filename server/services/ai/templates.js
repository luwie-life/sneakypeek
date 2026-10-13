/**
 * Each product type gets its own section flow instead of one generic
 * template. "type" is a stable machine key (used by the frontend to pick
 * an icon/label); "guidance" tells the model what that section is for.
 */
export const SECTION_FLOWS = {
  book: [
    { type: 'hook', guidance: 'A one- or two-line hook that creates immediate curiosity about the book.' },
    { type: 'context', guidance: 'Brief context: who this book is for and the problem or itch it addresses.' },
    { type: 'chapter_preview', guidance: 'A short preview of a compelling chapter or excerpt — a real taste, not a summary of the whole book.' },
    { type: 'insight', guidance: 'One genuinely interesting insight or idea from the book, stated plainly.' },
    { type: 'curiosity_gap', guidance: 'A statement that opens a gap the reader wants closed — raises a question the book answers.' },
    { type: 'cta', guidance: 'A short, confident call to action to get the book.' },
  ],
  course: [
    { type: 'problem', guidance: 'The specific problem or frustration this course solves.' },
    { type: 'mini_lesson', guidance: 'A small, real piece of teaching from the course — something the visitor can use immediately.' },
    { type: 'exercise', guidance: 'A short interactive-feeling exercise or reflection prompt tied to the mini lesson.' },
    { type: 'result', guidance: 'The concrete result or transformation a student gets from finishing the course.' },
    { type: 'course_promise', guidance: 'The course\'s core promise — what it guarantees the student will be able to do.' },
    { type: 'cta', guidance: 'A short, confident call to action to enroll.' },
  ],
  template: [
    { type: 'problem', guidance: 'The tedious or hard problem this template removes.' },
    { type: 'interactive_preview', guidance: 'Describe what the template looks like in use — concrete and visual.' },
    { type: 'result', guidance: 'The end result someone gets by using the template.' },
    { type: 'whats_included', guidance: 'A plain-language rundown of what is included in the template.' },
    { type: 'cta', guidance: 'A short, confident call to action to get the template.' },
  ],
  audio: [
    { type: 'hook', guidance: 'A hook that captures the tone and appeal of this audio/podcast in one or two lines.' },
    { type: 'audio_preview', guidance: 'Describe a compelling moment or clip from the audio, in words (no audio playback yet).' },
    { type: 'insight', guidance: 'One key insight or memorable moment from the episode/series.' },
    { type: 'why_it_matters', guidance: 'Why this matters to the listener right now.' },
    { type: 'cta', guidance: 'A short, confident call to action to listen.' },
  ],
  guide: [
    { type: 'problem', guidance: 'The problem this guide solves, stated concretely.' },
    { type: 'preview', guidance: 'A short preview of what is inside the guide.' },
    { type: 'insight', guidance: 'One useful, standalone insight from the guide.' },
    { type: 'what_they_will_learn', guidance: 'A plain list-style summary of what the reader will walk away knowing.' },
    { type: 'cta', guidance: 'A short, confident call to action to get the guide.' },
  ],
  digital: [
    { type: 'hook', guidance: 'A hook that captures what makes this digital product worth a second look.' },
    { type: 'preview', guidance: 'A concrete preview of the product itself.' },
    { type: 'benefits', guidance: 'The 2-3 clearest benefits of using this product.' },
    { type: 'cta', guidance: 'A short, confident call to action to get it.' },
  ],
  physical: [
    { type: 'hook', guidance: 'A hook that captures what makes this product desirable.' },
    { type: 'preview', guidance: 'A concrete, sensory description of the product.' },
    { type: 'benefits', guidance: 'The clearest practical benefits of owning it.' },
    { type: 'social_proof', guidance: 'A believable, non-fabricated framing of why people trust this product (do not invent specific quotes or numbers).' },
    { type: 'cta', guidance: 'A short, confident call to action to buy it.' },
  ],
  other: [
    { type: 'hook', guidance: 'A hook that creates curiosity about this offering.' },
    { type: 'introduction', guidance: 'A brief introduction to what it is and who it is for.' },
    { type: 'benefits', guidance: 'The clearest benefits of this offering.' },
    { type: 'cta', guidance: 'A short, confident call to action.' },
  ],
}

export function getSectionFlow(productType) {
  return SECTION_FLOWS[productType] || SECTION_FLOWS.other
}
