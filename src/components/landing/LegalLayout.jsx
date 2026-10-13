import { Link } from 'react-router-dom'
import RevealMark from '../RevealMark'

export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 h-16 flex items-center">
          <Link to="/" aria-label="Sneaky Peek home">
            <RevealMark size={22} variant="wordmark" />
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-14">
        <h1 className="font-serif text-3xl text-ink mb-2">{title}</h1>
        {updated && <p className="text-xs text-muted mb-10">Last updated {updated}</p>}
        <div className="flex flex-col gap-6 text-sm text-muted leading-relaxed [&_h2]:font-sans [&_h2]:font-medium [&_h2]:text-ink [&_h2]:text-base [&_h2]:mt-2">
          {children}
        </div>
        <Link to="/" className="inline-block mt-12 text-sm text-ink underline">
          ← Back to Sneaky Peek
        </Link>
      </main>
    </div>
  )
}
