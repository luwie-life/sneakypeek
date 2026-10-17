import { Lock } from 'lucide-react'

export default function SectionPerformanceTable({ sections, biggestDropOff }) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted">This experience has no sections yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">How far visitors got through each section</caption>
        <thead>
          <tr className="text-left text-xs text-muted border-b border-line">
            <th scope="col" className="pb-2 font-medium">Section</th>
            <th scope="col" className="pb-2 font-medium text-right">Reached</th>
            <th scope="col" className="pb-2 font-medium text-right hidden sm:table-cell">Interacted</th>
            <th scope="col" className="pb-2 font-medium text-right">Stopped here</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const isWorst = biggestDropOff?.index === s.index
            return (
              <tr key={s.index} className={`border-b border-line last:border-0 ${isWorst ? 'bg-accent-soft/30' : ''}`}>
                <td className="py-2.5 pr-3 text-ink">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-muted w-5 shrink-0">{s.index + 1}</span>
                    <span className="truncate max-w-[16rem]">{s.heading}</span>
                    {s.visibility === 'locked' && <Lock size={11} className="text-muted shrink-0" aria-label="Locked section" />}
                  </span>
                </td>
                <td className="py-2.5 text-right text-muted whitespace-nowrap">
                  {s.views} <span className="text-xs">({s.reachRate}%)</span>
                </td>
                <td className="py-2.5 text-right text-muted hidden sm:table-cell">{s.interactions || '—'}</td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  <span className={isWorst ? 'text-accent-dim font-medium' : 'text-muted'}>
                    {s.views === 0 ? '—' : `${s.stoppedHere} (${s.dropOffRate}%)`}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
