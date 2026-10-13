import { motion } from 'framer-motion'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, Users, Sparkles, CreditCard, Receipt, Tag, Cpu, FileText, Settings, ScrollText, ArrowLeft,
} from 'lucide-react'
import RevealMark from '../RevealMark'
import { useAuth } from '../../context/AuthContext'
import { useDocumentMeta } from '../../lib/useDocumentMeta'

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/experiences', label: 'Experiences', icon: Sparkles },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/payments', label: 'Payments', icon: Receipt },
  { to: '/admin/plans', label: 'Plans', icon: Tag },
  { to: '/admin/ai-usage', label: 'AI Usage', icon: Cpu },
  { to: '/admin/materials', label: 'Materials', icon: FileText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
]

export default function AdminShell({ title, children }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  useDocumentMeta({ noindex: true })

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="w-56 shrink-0 border-r border-line bg-paper flex flex-col p-4 hidden md:flex">
        <div className="mb-6 px-1 flex items-center gap-2">
          <RevealMark size={22} />
          <span className="font-sans font-semibold text-sm text-ink">Control Center</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <span className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm">
                  {isActive && (
                    <motion.span
                      layoutId="admin-nav-active"
                      className="absolute inset-0 bg-surface rounded-lg"
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <Icon size={15} className={`relative z-10 ${isActive ? 'text-accent' : 'text-muted'}`} />
                  <span className={`relative z-10 ${isActive ? 'text-ink font-medium' : 'text-muted'}`}>{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 flex flex-col gap-1">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={13} /> Back to creator app
          </button>
          <button onClick={logout} className="px-2.5 py-1 text-xs text-muted hover:text-ink transition-colors text-left">
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 md:p-8">
        {title && (
          <header className="mb-6">
            <h1 className="font-serif text-3xl text-ink">{title}</h1>
          </header>
        )}
        {children}
      </main>
    </div>
  )
}
