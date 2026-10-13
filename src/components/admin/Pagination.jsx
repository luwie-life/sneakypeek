import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, totalPages, total, onChange }) {
  if (total === 0) return null

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
      <p className="text-xs text-muted">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
