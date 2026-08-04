import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { apiClient } from '../../api/client'
import TopBar from './TopBar'
import Avatar from '../shared/Avatar'
import {Sparkles} from 'lucide-react'
import ChatWidget from '../chat/ChatWidget'
import { LayoutDashboard, CalendarCheck, TrendingUp, Trophy, Library, Building2, Clock, AlertTriangle, FileText, Upload, History, Users, ShieldCheck, ChevronLeft, ChevronRight, LogOut, User, X, Target, ClipboardList } from 'lucide-react'

// `manage: true` items are only shown to ADMIN / TEAM_LEADER.
// #6 — ordered by importance / frequency of use: what people do daily first
// (see the dashboard, enter data), then analysis, then setup, then admin.
const navGroups = [
  { label: 'Overview', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/scorecard', label: 'Scorecard', icon: Trophy },
  ]},
  { label: 'Data Entry', items: [
    { to: '/weekly', label: 'Weekly', icon: CalendarCheck },
    { to: '/monthly', label: 'Monthly', icon: CalendarCheck },
    { to: '/quarterly', label: 'Quarterly', icon: CalendarCheck },
    { to: '/annual', label: 'Annual', icon: CalendarCheck },
  ]},
  { label: 'Analysis', items: [
    { to: '/trends', label: 'Trends', icon: TrendingUp },
    { to: '/history', label: 'History', icon: History },
    { to: '/actions', label: 'Actions', icon: AlertTriangle },
    { to: '/reports', label: 'Reports', icon: FileText },
  ]},
  { label: 'Configure', items: [
    { to: '/kpis', label: 'KPI Library', icon: Library, manage: true },
     { to: '/presets', label: 'Preset KPIs', icon: Sparkles, manage: true },
    { to: '/assignments', label: 'Assignments', icon: ClipboardList, manage: true },
    { to: '/departments', label: 'Departments', icon: Building2, manage: true },
    { to: '/periods', label: 'Periods', icon: Clock, manage: true },
    { to: '/imports', label: 'Import', icon: Upload, manage: true },
  ]},
  { label: 'Administration', items: [
    { to: '/users', label: 'Users & Roles', icon: Users, manage: true },
    { to: '/audit', label: 'Audit Trail', icon: ShieldCheck, manage: true },
  ]},
]

// #1 — human-readable role label shown alongside a user's title.
const roleLabel = (role?: string) =>
  role === 'ADMIN' ? 'Administrator' : role === 'TEAM_LEADER' ? 'Team Leader' : role === 'MEMBER' ? 'Member' : ''

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const [orgLogo, setOrgLogo] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const navigate = useNavigate()
  const location = useLocation()

  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'

  // Set org name from user store immediately, then fetch logo
  useEffect(() => {
    const u = user as any
    if (u?.organisation_name) setOrgName(u.organisation_name)
    if (u?.organisation_id || u?.organisation) {
      const orgId = u?.organisation_id || u?.organisation
      apiClient.get(`/auth/organisations/${orgId}/`).then(res => {
        if (res.data.logo) setOrgLogo(res.data.logo)
        if (res.data.name) setOrgName(res.data.name)
      }).catch(() => {})
    }
    // Fetch full user profile to keep store updated
    apiClient.get('/auth/users/me/').then(res => {
      useAuthStore.getState().setUser(res.data)
    }).catch(() => {})
  }, [user?.id])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  const handleLogout = () => { logout(); navigate('/login') }
  const isActive = (path: string) => path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path)

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--surface-ground))]">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-card))] transition-all duration-300 ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-[72px]' : 'w-[260px]'} ${mobileOpen ? 'translate-x-0' : ''}`}>
        <div className="flex h-16 items-center px-4 border-b border-[hsl(var(--border-subtle))]">
          <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? '' : ''}`}>
            {orgLogo ? <img src={orgLogo} alt="" className="h-8 w-8 rounded-lg object-cover flex-shrink-0" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--accent))] flex-shrink-0"><Target className="h-4 w-4 text-white" /></div>}
            <div className="overflow-hidden">{!collapsed && <><h1 className="text-sm font-bold truncate">{orgName || "IPS KPI"}</h1><p className="text-[10px] text-[hsl(var(--text-tertiary))]">Performance</p></>}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5" style={{ scrollbarWidth: 'none' }}>
          {navGroups.map(group => {
            const items = group.items.filter(item => !(item as any).manage || canManage)
            if (items.length === 0) return null
            return (
              <div key={group.label}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-2 px-3 ${collapsed ? 'lg:hidden' : ''}`}>{group.label}</p>
                <ul className="space-y-0.5">
                  {items.map(item => (
                    <li key={item.to}><NavLink to={item.to} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive(item.to) ? 'bg-[hsl(var(--accent-light))] text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-ground))]'}`}><item.icon className="h-5 w-5 flex-shrink-0" /><span className={`${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span></NavLink></li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center h-10 mx-3 mb-1 rounded-xl hover:bg-[hsl(var(--surface-ground))] transition-colors">{collapsed ? <ChevronRight className="h-4 w-4 text-[hsl(var(--text-tertiary))]" /> : <ChevronLeft className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />}</button>
        <div className="border-t border-[hsl(var(--border-subtle))] p-4">
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className={`flex items-center gap-3 w-full rounded-xl p-2 hover:bg-[hsl(var(--surface-ground))] transition-colors ${collapsed ? 'lg:justify-center' : ''}`}>
            <Avatar src={(user as any)?.avatar} name={user?.full_name || 'User'} size={32} />
            <div className={`flex-1 text-left overflow-hidden ${collapsed ? '' : ''}`}><p className="text-sm font-medium truncate">{user?.full_name || 'User'}</p><p className="text-xs text-[hsl(var(--text-tertiary))] truncate">{roleLabel(user?.role)}{(user as any)?.display_title ? ` · ${(user as any).display_title}` : ''}</p></div>
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}><div className="p-6 animate-fade-in-up"><Outlet /></div></main>
        <ChatWidget />
      </div>
    </div>
  )
}