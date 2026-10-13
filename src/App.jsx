import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import DashboardShell from './components/DashboardShell'
import AdminShell from './components/admin/AdminShell'
import RevealMark from './components/RevealMark'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import Overview from './pages/Overview'
import Experiences from './pages/Experiences'
import ExperienceEditor from './pages/ExperienceEditor'
import ComingSoon from './pages/ComingSoon'
import PublicExperience from './pages/PublicExperience'
import AiStudioIndex from './pages/AiStudioIndex'
import AnalyticsIndex from './pages/AnalyticsIndex'
import AnalyticsDashboard from './pages/AnalyticsDashboard'

// Lazy-loaded: AI Studio (heaviest single creator page, not visited every
// session) and the entire admin section (only ever used by admins, not
// regular creators) — these are the routes where deferring the bundle
// actually benefits the people who never visit them.
const AiStudio = lazy(() => import('./pages/AiStudio'))
const Billing = lazy(() => import('./pages/Billing'))
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'))
const AdminExperiences = lazy(() => import('./pages/admin/AdminExperiences'))
const AdminExperienceDetail = lazy(() => import('./pages/admin/AdminExperienceDetail'))
const AdminSubscriptions = lazy(() => import('./pages/admin/AdminSubscriptions'))
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'))
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans'))
const AdminAIUsage = lazy(() => import('./pages/admin/AdminAIUsage'))
const AdminMaterials = lazy(() => import('./pages/admin/AdminMaterials'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'))
const Privacy = lazy(() => import('./pages/legal/Privacy'))
const Terms = lazy(() => import('./pages/legal/Terms'))
const Contact = lazy(() => import('./pages/legal/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteFallback() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <RevealMark size={28} animated animationState="thinking" />
    </div>
  )
}

function DashboardPage({ title, children }) {
  return (
    <RequireAuth>
      <DashboardShell title={title}>{children}</DashboardShell>
    </RequireAuth>
  )
}

function RootRoute() {
  const { user, loading } = useAuth()
  if (loading) return <RouteFallback />
  if (user) return <Navigate to="/dashboard" replace />
  return <Landing />
}

function AdminPage({ title, children }) {
  return (
    <RequireAdmin>
      <AdminShell title={title}>{children}</AdminShell>
    </RequireAdmin>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

            <Route path="/dashboard" element={<DashboardPage title="Overview"><Overview /></DashboardPage>} />
            <Route
              path="/dashboard/experiences"
              element={<DashboardPage title="Experiences"><Experiences /></DashboardPage>}
            />
            <Route
              path="/dashboard/experiences/:id"
              element={<DashboardPage title="Edit experience"><ExperienceEditor /></DashboardPage>}
            />
            <Route
              path="/dashboard/ai-studio"
              element={<DashboardPage title="AI Studio"><AiStudioIndex /></DashboardPage>}
            />
            <Route
              path="/dashboard/studio/:id"
              element={<RequireAuth><AiStudio /></RequireAuth>}
            />
            <Route
              path="/dashboard/analytics"
              element={<DashboardPage title="Analytics"><AnalyticsIndex /></DashboardPage>}
            />
            <Route
              path="/dashboard/analytics/:id"
              element={<DashboardPage title="Analytics"><AnalyticsDashboard /></DashboardPage>}
            />
            <Route
              path="/dashboard/integrations"
              element={<DashboardPage title="Integrations"><ComingSoon label="Integrations" /></DashboardPage>}
            />
            <Route
              path="/dashboard/billing"
              element={<DashboardPage title="Billing"><Billing /></DashboardPage>}
            />
            <Route
              path="/dashboard/settings"
              element={<DashboardPage title="Settings"><ComingSoon label="Settings" /></DashboardPage>}
            />

            <Route path="/admin" element={<AdminPage title="Overview"><AdminOverview /></AdminPage>} />
            <Route path="/admin/users" element={<AdminPage title="Users"><AdminUsers /></AdminPage>} />
            <Route path="/admin/users/:id" element={<AdminPage title="User"><AdminUserDetail /></AdminPage>} />
            <Route path="/admin/experiences" element={<AdminPage title="Experiences"><AdminExperiences /></AdminPage>} />
            <Route path="/admin/experiences/:id" element={<AdminPage title="Experience"><AdminExperienceDetail /></AdminPage>} />
            <Route path="/admin/subscriptions" element={<AdminPage title="Subscriptions"><AdminSubscriptions /></AdminPage>} />
            <Route path="/admin/payments" element={<AdminPage title="Payments"><AdminPayments /></AdminPage>} />
            <Route path="/admin/plans" element={<AdminPage title="Plans"><AdminPlans /></AdminPage>} />
            <Route path="/admin/ai-usage" element={<AdminPage title="AI Usage"><AdminAIUsage /></AdminPage>} />
            <Route path="/admin/materials" element={<AdminPage title="Materials"><AdminMaterials /></AdminPage>} />
            <Route path="/admin/settings" element={<AdminPage title="Settings"><AdminSettings /></AdminPage>} />
            <Route path="/admin/audit-log" element={<AdminPage title="Audit Log"><AdminAuditLog /></AdminPage>} />

            <Route path="/p/:slug" element={<PublicExperience />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
