const STYLES = {
  published: ['bg-accent-soft text-accent-dim', 'bg-accent', 'Published'],
  draft: ['bg-surface text-muted border border-line', 'bg-muted', 'Draft'],
  archived: ['bg-surface text-muted border border-dashed border-line', 'bg-line', 'Archived'],
}

export default function StatusBadge({ status }) {
  const [cls, dot, label] = STYLES[status] || STYLES.draft
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
