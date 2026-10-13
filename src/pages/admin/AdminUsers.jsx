import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useAdminList } from '../../hooks/useAdminList'
import AdminTable from '../../components/admin/AdminTable'
import Pagination from '../../components/admin/Pagination'
import { SearchInput, FilterSelect } from '../../components/admin/Filters'

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'creator', label: 'Creator' },
  { value: 'pro', label: 'Pro' },
  { value: 'business', label: 'Business' },
]
const STATUS_OPTIONS = ['trialing', 'active', 'past_due', 'canceled', 'expired'].map((s) => ({ value: s, label: s }))
const ROLE_OPTIONS = [{ value: 'user', label: 'Creator' }, { value: 'admin', label: 'Admin' }]

export default function AdminUsers() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { items, pagination, loading, error } = useAdminList(adminApi.listUsers, { search, role, plan, status, page })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search name or email…" />
        <FilterSelect value={role} onChange={(v) => { setRole(v); setPage(1) }} placeholder="All roles" options={ROLE_OPTIONS} />
        <FilterSelect value={plan} onChange={(v) => { setPlan(v); setPage(1) }} placeholder="All plans" options={PLAN_OPTIONS} />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1) }} placeholder="All statuses" options={STATUS_OPTIONS} />
      </div>

      <AdminTable
        loading={loading}
        error={error}
        emptyLabel="No users match these filters."
        onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'role', label: 'Role', render: (r) => r.role === 'admin' ? 'Admin' : 'Creator' },
          { key: 'planName', label: 'Plan', render: (r) => r.planName || '—' },
          { key: 'subscriptionStatus', label: 'Status', render: (r) => r.subscriptionStatus || '—' },
          { key: 'experienceCount', label: 'Experiences' },
          { key: 'createdAt', label: 'Joined', render: (r) => new Date(r.createdAt).toLocaleDateString() },
        ]}
        rows={items}
      />
      <Pagination {...pagination} onChange={setPage} />
    </div>
  )
}
