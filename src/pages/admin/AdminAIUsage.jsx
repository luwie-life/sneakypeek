import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import { RangeSelect } from '../../components/admin/Filters'
import RevealMark from '../../components/RevealMark'

export default function AdminAIUsage() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi.getAiUsage(range)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [range])

  return (
    <div>
      <div className="flex justify-end mb-6 -mt-2">
        <RangeSelect value={range} onChange={setRange} />
      </div>

      {loading && <div className="flex justify-center py-16"><RevealMark size={28} animated animationState="thinking" /></div>}
      {error && <p className="text-accent-dim">{error}</p>}

      {data && (
        <div className="flex flex-col gap-6">
          <Card hover={false}>
            <p className="text-xs text-muted mb-1">Total generations</p>
            <p className="font-serif text-3xl text-ink">{data.total}</p>
            <p className="text-xs text-muted mt-2">{data.breakdownByOperation}</p>
          </Card>

          <div className="grid sm:grid-cols-2 gap-5">
            <Card hover={false}>
              <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Usage by plan</h3>
              {data.byPlan.length === 0 ? (
                <p className="text-sm text-muted">No usage in this range.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.byPlan.map((row) => (
                    <li key={row.plan} className="flex justify-between text-sm">
                      <span className="text-muted capitalize">{row.plan}</span>
                      <span className="text-ink">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card hover={false}>
              <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Top users</h3>
              {data.topUsers.length === 0 ? (
                <p className="text-sm text-muted">No usage in this range.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.topUsers.map((u) => (
                    <li key={u.userId} className="flex justify-between text-sm">
                      <span className="text-muted">{u.email}</span>
                      <span className="text-ink">{u.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card hover={false}>
            <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Usage by day</h3>
            {data.byDay.length === 0 ? (
              <p className="text-sm text-muted">No usage in this range.</p>
            ) : (
              <div className="flex items-end gap-1 h-24">
                {data.byDay.map((row) => {
                  const max = Math.max(...data.byDay.map((r) => r.count), 1)
                  return (
                    <div key={row.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${row.date}: ${row.count}`}>
                      <div className="w-full bg-accent rounded-sm" style={{ height: `${(row.count / max) * 100}%`, minHeight: row.count > 0 ? '2px' : 0 }} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
