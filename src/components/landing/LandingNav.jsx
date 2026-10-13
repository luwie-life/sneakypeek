import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import RevealMark from '../RevealMark'
import Button from '../ui/Button'
import { useAuth } from '../../context/AuthContext'

export default function LandingNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const links = [
    { href: '#how-it-works', label: 'How it works' },
    { href: '#pricing', label: 'Pricing' },
  ]

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-sm border-b border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" aria-label="Sneaky Peek home">
          <RevealMark size={24} variant="wordmark" />
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted hover:text-ink transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Button variant="accent" size="sm" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </Button>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted hover:text-ink transition-colors">
                Sign in
              </Link>
              <Button variant="accent" size="sm" onClick={() => navigate('/signup')}>
                Create your Sneaky Peek
              </Button>
            </>
          )}
        </div>

        <button
          className="md:hidden text-ink p-1"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-line px-5 py-4 flex flex-col gap-4 bg-paper">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm text-ink">
              {l.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            {user ? (
              <Button variant="accent" size="sm" onClick={() => navigate('/dashboard')}>
                Go to dashboard
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button variant="accent" size="sm" onClick={() => navigate('/signup')}>
                  Create your Sneaky Peek
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
