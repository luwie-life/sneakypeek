import { motion } from 'framer-motion'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  Sparkles,
  BarChart3,
  Plug,
  CreditCard,
  Settings,
  Plus,
  LogOut,
} from 'lucide-react'
import RevealMark from './RevealMark'
import Button from './ui/Button'
import { useAuth } from '../context/AuthContext'
import { useDocumentMeta } from '../lib/useDocumentMeta'

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/dashboard/experiences', label: 'Experiences', icon: Sparkles },
  { to: '/dashboard/ai-studio', label: 'AI Studio', icon: Sparkles },
  { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { to: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function DashboardShell({ title, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // Signals crawlers away from private pages — not a security boundary on
  // its own. requireAuth + owner-scoped backend checks are what actually
  // keep this data private.
  useDocumentMeta({ noindex: true })

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-line bg-paper flex flex-col p-5 hidden md:flex">
        <div className="mb-8 px-1">
          <RevealMark size={28} variant="wordmark" animated animationState="idle" />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <span className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium">
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 bg-surface rounded-xl"
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <Icon size={17} className={`relative z-10 ${isActive ? 'text-accent' : 'text-muted'}`} />
                  <span className={`relative z-10 ${isActive ? 'text-ink' : 'text-muted'}`}>{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-5 flex flex-col gap-3">
          <Button
            variant="accent"
            size="md"
            icon={Plus}
            className="w-full"
            onClick={() => navigate('/dashboard/experiences/new')}
          >
            Create Sneaky Peek
          </Button>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-ink transition-colors"
          >
            <LogOut size={15} />
            <span className="truncate">{user?.name ?? 'Log out'}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 md:p-10">
        {title && (
          <header className="mb-8">
            <h1 className="font-serif text-4xl text-ink">{title}</h1>
          </header>
        )}
        {children}
      </main>
    </div>
  )
}
