// frontend/src/components/layout/Sidebar.tsx
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  Target,
  Building2,
  Library,
  Clock,
  AlertTriangle,
  FileText,
  Upload,
  Bell,
  History,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  ClipboardList,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Weekly Performance', href: '/weekly', icon: Calendar },
  { name: 'Monthly Performance', href: '/monthly', icon: Calendar },
  { name: 'Quarterly Performance', href: '/quarterly', icon: Calendar },
  { name: 'Annual Performance', href: '/annual', icon: Calendar },
  { name: 'Trend Analysis', href: '/history', icon: TrendingUp },
  { name: 'Department Scorecard', href: '/scorecard', icon: Activity },
  { name: 'KPI Library', href: '/kpis', icon: Library },
  { name: 'Reporting Periods', href: '/periods', icon: Clock },
  { name: 'Corrective Actions', href: '/actions', icon: AlertTriangle },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Imports', href: '/imports', icon: Upload },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Audit Trail', href: '/audit', icon: History },
  { name: 'Users & Roles', href: '/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <span className="font-semibold text-sm">IPS KPI System</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 hover:bg-gray-100"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t p-4">
          <p className="text-xs text-gray-400">IPS Quality & Performance</p>
          <p className="text-xs text-gray-400">Management System v1.0</p>
        </div>
      )}
    </aside>
  )
}