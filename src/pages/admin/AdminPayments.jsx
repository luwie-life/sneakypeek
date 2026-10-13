import { useState } from 'react'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { FilterSelect } from '../../components/admin/Filters'

const STATUS_OPTIONS = [{ value: 'successful', label: 'Successful' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Pending' }]
const PROVIDER_OPTIONS = [{ value: 'flutterwave', label: 'Flutterwave' }, { value: 'mock', label: 'Mock' }]

function money(amount, currency) {
  return `${(currency || 'usd').toUpperCase() === 'USD' ? '$' : currency + ' '}${amount.toFixed(2)}`
}

export default function AdminPayments() {
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listPayments, { status, provider, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1) }} placeholder="All statuses" options={STATUS_OPTIONS} />
        <FilterSelect value={provider} onChange={(v) => { setProvider(v); setPage(1) }} placeholder="All providers" options={PROVIDER_OPTIONS} />
      </div>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No payments recorded yet."
        columns={[
          { key: 'user', label: 'User', render: (r) => r.user?.email || '—' },
          { key: 'amount', label: 'Amount', render: (r) => money(r.amount, r.currency) },
          { key: 'plan', label: 'Plan', render: (r) => r.plan?.name || '—' },
          { key: 'provider', label: 'Provider' },
          { key: 'status', label: 'Status' },
          { key: 'txRef', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.txRef?.slice(0, 20)}</span> },
          { key: 'createdAt', label: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
