import { Link } from 'react-router-dom'
import RevealMark from '../RevealMark'

export default function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <RevealMark size={20} variant="wordmark" />

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href="#how-it-works" className="hover:text-ink transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link to="/contact" className="hover:text-ink transition-colors">Contact</Link>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-8 text-xs text-muted">
        © {new Date().getFullYear()} Sneaky Peek.
      </div>
    </footer>
  )
}
