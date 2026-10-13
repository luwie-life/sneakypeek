import { Search } from 'lucide-react'

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-line bg-paper outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft w-56"
      />
    </div>
  )
}

export function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm rounded-lg border border-line bg-paper px-3 py-1.5 outline-none focus:border-accent"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

export function RangeSelect({ value, onChange }) {
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      placeholder="Range"
      options={[
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
        { value: 'all', label: 'All time' },
      ]}
    />
  )
}
