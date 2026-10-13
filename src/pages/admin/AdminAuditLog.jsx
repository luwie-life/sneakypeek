import { useState } from 'react'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { FilterSelect } from '../../components/admin/Filters'

const ACTION_OPTIONS = [
  'plan_updated', 'user_role_changed', 'account_disabled', 'account_enabled', 'setting_changed',
].map((a) => ({ value: a, label: a.replace(/_/g, ' ') }))

function summarizeMetadata(entry) {
  if (!entry.metadata || Object.keys(entry.metadata).length === 0) return '—'
  try {
    return JSON.stringify(entry.metadata).slice(0, 80)
  } catch {
    return '—'
  }
}

export default function AdminAuditLog() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listAuditLog, { action, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterSelect value={action} onChange={(v) => { setAction(v); setPage(1) }} placeholder="All actions" options={ACTION_OPTIONS} />
      </div>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No admin actions recorded yet."
        columns={[
          { key: 'admin', label: 'Admin', render: (r) => r.admin?.email || '—' },
          { key: 'action', label: 'Action', render: (r) => <span className="capitalize">{r.action.replace(/_/g, ' ')}</span> },
          { key: 'targetType', label: 'Target', render: (r) => `${r.targetType}${r.targetId ? ` (${r.targetId.slice(-6)})` : ''}` },
          { key: 'metadata', label: 'Details', render: (r) => <span className="font-mono text-xs text-muted">{summarizeMetadata(r)}</span> },
          { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
