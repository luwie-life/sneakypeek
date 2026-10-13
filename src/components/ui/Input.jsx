export function Input({ label, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-1.5 font-sans">
      {label && <span className="text-sm text-muted">{label}</span>}
      <input
        className={`rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink
          placeholder:text-muted/70 outline-none transition-all
          focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
        {...props}
      />
    </label>
  )
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-1.5 font-sans">
      {label && <span className="text-sm text-muted">{label}</span>}
      <textarea
        className={`rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink
          placeholder:text-muted/70 outline-none transition-all resize-none
          focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
        {...props}
      />
    </label>
  )
}
