// frontend/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import TrendsPage from './pages/TrendsPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import WeeklyEntryPage from './pages/WeeklyEntryPage'
import MonthlyEntryPage from './pages/MonthlyEntryPage'
import QuarterlyEntryPage from './pages/QuarterlyEntryPage'
import AnnualEntryPage from './pages/AnnualEntryPage'
import ScorecardPage from './pages/ScorecardPage'
import KPIsPage from './pages/KPIsPage'
import AssignmentsPage from './pages/AssignmentsPage'
import DepartmentsPage from './pages/DepartmentsPage'
import PeriodsPage from './pages/PeriodsPage'
import UsersPage from './pages/UsersPage'
import AuditPage from './pages/AuditPage'
import ActionsPage from './pages/ActionsPage'
import ImportsPage from './pages/ImportsPage'
import SettingsPage from './pages/SettingsPage'
import ReportsPage from './pages/ReportsPage'
import ChatJoinPage from './pages/ChatJoinPage'
import { useAuthStore } from './store/authStore'
import PresetsPage from './pages/PresetsPage'   
import KPIReviewPage from './pages/KPIReviewPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  if (!hasHydrated) return null
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  // Gate the whole app until persist finishes rehydrating from localStorage.
  // This is what prevents a mid-hydration login from being clobbered back to null.
  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-ground))]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--accent))] border-t-transparent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="weekly" element={<WeeklyEntryPage />} />
        <Route path="monthly" element={<MonthlyEntryPage />} />
        <Route path="quarterly" element={<QuarterlyEntryPage />} />
        <Route path="annual" element={<AnnualEntryPage />} />
        <Route path="scorecard" element={<ScorecardPage />} />
        <Route path="kpis" element={<KPIsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="presets" element={<PresetsPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="periods" element={<PeriodsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="/kpi-review/:resultId" element={<KPIReviewPage />} />
        <Route path="chat/join/:token" element={<ChatJoinPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}