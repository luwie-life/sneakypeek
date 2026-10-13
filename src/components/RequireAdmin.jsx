import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RevealMark from './RevealMark'

/**
 * This check exists only to avoid flashing admin UI at someone who isn't
 * an admin. It grants nothing: every admin API call is independently
 * authorized server-side by requireAdmin, which is the actual security
 * boundary. A creator who edits local state to bypass this component gets
 * exactly nowhere — every request they make still comes back 403.
 */
export default function RequireAdmin({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <RevealMark size={32} animated animationState="thinking" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />

  return children
}
