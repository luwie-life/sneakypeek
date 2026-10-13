export default function UsageBar({ label, used, limit }) {
  const unlimited = limit === -1
  const pct = unlimited ? 0 : Math.min((used / Math.max(limit, 1)) * 100, 100)
  const nearLimit = !unlimited && used >= limit

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted">{label}</span>
        <span className={nearLimit ? 'text-accent-dim font-medium' : 'text-ink'}>
          {used} {unlimited ? '' : `/ ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 bg-surface rounded-pill overflow-hidden">
          <div
            className={`h-full rounded-pill transition-all ${nearLimit ? 'bg-accent-dim' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
