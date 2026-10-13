import { useState } from 'react'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { FilterSelect } from '../../components/admin/Filters'

const STATUS_OPTIONS = ['trialing', 'active', 'past_due', 'canceled', 'expired'].map((s) => ({ value: s, label: s }))
const PROVIDER_OPTIONS = [{ value: 'flutterwave', label: 'Flutterwave' }, { value: 'mock', label: 'Mock' }, { value: 'none', label: 'None (Free)' }]
const PLAN_OPTIONS = ['free', 'starter', 'creator', 'pro', 'business'].map((p) => ({ value: p, label: p }))

function money(cents, currency) {
  if (!cents) return 'Free'
  return `${(currency || 'usd').toUpperCase() === 'USD' ? '$' : currency + ' '}${(cents / 100).toFixed(0)}/mo`
}

export default function AdminSubscriptions() {
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [plan, setPlan] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listSubscriptions, { status, provider, plan, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1) }} placeholder="All statuses" options={STATUS_OPTIONS} />
        <FilterSelect value={provider} onChange={(v) => { setProvider(v); setPage(1) }} placeholder="All providers" options={PROVIDER_OPTIONS} />
        <FilterSelect value={plan} onChange={(v) => { setPlan(v); setPage(1) }} placeholder="All plans" options={PLAN_OPTIONS} />
      </div>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No subscriptions match these filters."
        columns={[
          { key: 'user', label: 'User', render: (r) => r.user?.email || '—' },
          { key: 'plan', label: 'Plan', render: (r) => r.plan?.name || '—' },
          { key: 'amount', label: 'Amount', render: (r) => money(r.plan?.monthlyPriceCents, r.plan?.currency) },
          { key: 'provider', label: 'Provider' },
          { key: 'status', label: 'Status' },
          { key: 'trialEnd', label: 'Trial ends', render: (r) => r.trialEnd ? new Date(r.trialEnd).toLocaleDateString() : '—' },
          { key: 'currentPeriodEnd', label: 'Period end', render: (r) => r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString() : '—' },
          { key: 'cancelAtPeriodEnd', label: 'Canceling', render: (r) => r.cancelAtPeriodEnd ? 'Yes' : 'No' },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
