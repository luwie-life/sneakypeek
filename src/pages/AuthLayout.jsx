import RevealMark from '../components/RevealMark'

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <RevealMark size={36} variant="wordmark" animated animationState="idle" />
        </div>
        <div className="bg-paper border border-line rounded-2xl shadow-soft p-8">
          <h1 className="font-serif text-3xl text-ink mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-muted mb-6">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
