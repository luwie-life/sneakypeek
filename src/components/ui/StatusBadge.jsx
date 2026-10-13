export default function StatusBadge({ status }) {
  const isPublished = status === 'published'
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill
        ${isPublished ? 'bg-accent-soft text-accent-dim' : 'bg-surface text-muted border border-line'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-accent' : 'bg-muted'}`}
      />
      {isPublished ? 'Published' : 'Draft'}
    </span>
  )
}
