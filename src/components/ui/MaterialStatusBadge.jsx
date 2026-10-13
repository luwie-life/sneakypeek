const STYLES = {
  pending: { dot: 'bg-muted', text: 'text-muted', label: 'Pending' },
  processing: { dot: 'bg-accent animate-pulse', text: 'text-accent-dim', label: 'Processing' },
  ready: { dot: 'bg-accent', text: 'text-accent-dim', label: 'Ready' },
  failed: { dot: 'bg-ink', text: 'text-ink', label: 'Failed' },
}

export default function MaterialStatusBadge({ status }) {
  const style = STYLES[status] || STYLES.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
