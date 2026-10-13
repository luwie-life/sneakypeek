import { motion } from 'framer-motion'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'

const TYPE_LABEL = {
  book: 'Book', course: 'Course', guide: 'Guide', audio: 'Audio',
  template: 'Template', digital: 'Digital asset', physical: 'Product', other: 'Experience',
}

export default function StudioPreview({ experience }) {
  return (
    <div className="h-full overflow-y-auto bg-paper rounded-2xl border border-line">
      <header className="flex items-center justify-center py-6 border-b border-line">
        <RevealMark size={22} />
      </header>

      <div className="max-w-md mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-widest text-accent-dim font-medium mb-3 text-center">
          {TYPE_LABEL[experience.productType] || 'Experience'}
        </p>

        <h1 className="font-serif text-3xl text-ink text-center leading-tight mb-4">
          {experience.title || 'Untitled experience'}
        </h1>

        {experience.hook && (
          <p className="text-muted text-center leading-relaxed mb-8">{experience.hook}</p>
        )}

        {(!experience.sections || experience.sections.length === 0) && (
          <p className="text-muted text-sm text-center italic py-10">
            No sections yet — generate a first draft from the AI panel.
          </p>
        )}

        {experience.sections?.map((section, i) => (
          <motion.section
            key={i}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            {section.heading && (
              <h2 className="font-serif text-xl text-ink mb-1.5">{section.heading}</h2>
            )}
            {section.body && <p className="text-sm text-muted leading-relaxed">{section.body}</p>}
          </motion.section>
        ))}

        <div className="flex justify-center pt-2">
          <Button variant="accent" size="md" disabled>
            Get it now
          </Button>
        </div>
      </div>
    </div>
  )
}
