import { useState } from 'react'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { FilterSelect } from '../../components/admin/Filters'
import MaterialStatusBadge from '../../components/ui/MaterialStatusBadge'

const TYPE_OPTIONS = ['text', 'pasted', 'existing_description', 'url', 'pdf', 'image', 'audio', 'video'].map((t) => ({ value: t, label: t }))
const STATUS_OPTIONS = ['pending', 'processing', 'ready', 'failed'].map((s) => ({ value: s, label: s }))

export default function AdminMaterials() {
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listMaterials, { type, status, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterSelect value={type} onChange={(v) => { setType(v); setPage(1) }} placeholder="All types" options={TYPE_OPTIONS} />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1) }} placeholder="All statuses" options={STATUS_OPTIONS} />
      </div>

      <p className="text-xs text-muted mb-4">
        Metadata only — creator material content is private and is never shown here.
      </p>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No materials match these filters."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type' },
          { key: 'owner', label: 'Owner', render: (r) => r.owner?.email || '—' },
          { key: 'experience', label: 'Experience', render: (r) => r.experience?.title || '—' },
          { key: 'status', label: 'Status', render: (r) => <MaterialStatusBadge status={r.status} /> },
          { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
