import RevealMark from '../RevealMark'

export default function AdminTable({ columns, rows, loading, error, emptyLabel, onRowClick }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RevealMark size={24} animated animationState="thinking" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-accent-dim py-8 text-center">{error}</p>
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted py-12 text-center">{emptyLabel || 'Nothing here yet.'}</p>
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-line">
            {columns.map((col) => (
              <th key={col.key} className="pb-2.5 px-1 font-medium whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-line last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="py-2.5 px-1 text-ink whitespace-nowrap">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
