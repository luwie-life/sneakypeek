/**
 * Per-type angles the understanding prompt should specifically dig for.
 * Deliberately light — a few sentences of steering, not a rigid template —
 * so the schema stays identical across product types (see productUnderstanding.js).
 */
export const UNDERSTANDING_ANGLES = {
  book: 'Focus on themes, the strongest ideas in the book, chapter opportunities, candidate excerpts worth previewing, and curiosity gaps a reader would want closed.',
  course: 'Focus on learning outcomes, the module/lesson structure, skills taught, the transformation a student undergoes, and the strongest mini-lesson candidates for a preview.',
  guide: 'Focus on the problems it solves, actionable insights, any frameworks it teaches, and material that would make a strong, concrete preview.',
  template: 'Focus on the use case, the transformation it enables, exactly what it helps someone accomplish, and what would make a compelling interactive preview.',
  audio: 'Focus on the strongest topics covered, key insights, the most compelling moments, and material that would make a good audio preview description.',
  digital: 'Infer the most useful structure directly from the supplied material — focus on concrete, specific details rather than generic claims.',
  physical: 'Infer the most useful structure directly from the supplied material — focus on concrete, specific details rather than generic claims.',
  other: 'Infer the most useful structure directly from the supplied material — focus on concrete, specific details rather than generic claims.',
}

export function getUnderstandingAngle(productType) {
  return UNDERSTANDING_ANGLES[productType] || UNDERSTANDING_ANGLES.other
}
