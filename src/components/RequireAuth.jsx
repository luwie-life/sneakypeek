import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RevealMark from './RevealMark'

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <RevealMark size={32} animated animationState="thinking" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return children
}
