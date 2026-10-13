export default function SectionPerformanceTable({ sections }) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted">This experience has no sections yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-line">
            <th className="pb-2 font-medium">Section</th>
            <th className="pb-2 font-medium text-right">Views</th>
            <th className="pb-2 font-medium text-right">Completed</th>
            <th className="pb-2 font-medium text-right">Drop-off</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.index} className="border-b border-line last:border-0">
              <td className="py-2.5 text-ink capitalize">{s.heading}</td>
              <td className="py-2.5 text-right text-muted">{s.views}</td>
              <td className="py-2.5 text-right text-muted">{s.completions}</td>
              <td className="py-2.5 text-right">
                <span className={s.dropOffRate >= 50 ? 'text-accent-dim font-medium' : 'text-muted'}>
                  {s.views === 0 ? '—' : `${s.dropOffRate}%`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
