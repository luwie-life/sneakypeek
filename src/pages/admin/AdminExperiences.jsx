import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { SearchInput, FilterSelect } from '../../components/admin/Filters'

const STATUS_OPTIONS = [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }]
const TYPE_OPTIONS = ['book', 'course', 'guide', 'template', 'audio', 'digital', 'physical', 'other']
  .map((t) => ({ value: t, label: t }))

export default function AdminExperiences() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [productType, setProductType] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listExperiences, { search, status, productType, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search title…" />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1) }} placeholder="All statuses" options={STATUS_OPTIONS} />
        <FilterSelect value={productType} onChange={(v) => { setProductType(v); setPage(1) }} placeholder="All types" options={TYPE_OPTIONS} />
      </div>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No experiences match these filters."
        onRowClick={(row) => navigate(`/admin/experiences/${row.id}`)}
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'owner', label: 'Owner', render: (r) => r.owner?.email || '—' },
          { key: 'productType', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'views', label: 'Views' },
          { key: 'ctaClicks', label: 'CTA clicks' },
          { key: 'checkoutClicks', label: 'Checkout' },
          { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
