export function Select({ label, options, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-1.5 font-sans">
      {label && <span className="text-sm text-muted">{label}</span>}
      <select
        className={`rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink
          outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
