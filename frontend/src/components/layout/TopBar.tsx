import { apiClient } from '../../api/client'
import Avatar from '../shared/Avatar'
import { useAuthStore } from '../../store/authStore'
import { applyTheme, getCachedPreference, getEffectiveIsDark, watchSystemTheme, type ThemePreference } from '../../lib/theme'
import { Bell, Search, Settings, User, LogOut, Key, Palette, Sun, Moon, Building2, Target, ClipboardList, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface SearchResults {
  departments: { id: string; name: string; code: string }[]
  kpis: { id: string; code: string; name: string; department_name: string }[]
  results: { id: string; kpi_code: string; kpi_name: string; department_name: string; period_label: string; rag_status: string }[]
}

const RAG_COLOR: Record<string, string> = {
  ON_TRACK: 'hsl(var(--status-on-track))',
  AT_RISK: 'hsl(var(--status-at-risk))',
  OFF_TRACK: 'hsl(var(--status-off-track))',
  NO_DATA: 'hsl(var(--status-no-data))',
}

export default function TopBar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [themePref, setThemePref] = useState<ThemePreference>(getCachedPreference())
  const themePrefRef = useRef(themePref)
  themePrefRef.current = themePref
  const notifRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLogout = () => { logout(); navigate('/login') }

  const fetchUnreadCount = async () => {
    try { const res = await apiClient.get('/notifications/unread_count/'); setUnreadCount(res.data.count) } catch {}
  }

  useEffect(() => {
    fetchUnreadCount()
    apiClient.get('/auth/users/me/').then(res => {
      useAuthStore.getState().setUser(res.data)
      // Applies the account's saved preference on every full page load, and
      // keeps following the OS live if the preference is 'system'.
      const pref: ThemePreference = res.data.theme_preference || 'system'
      setThemePref(pref)
      applyTheme(pref)
      watchSystemTheme(() => themePrefRef.current)
    }).catch(() => {})
    const i = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(i)
  }, [])

  // Explicit light/dark toggle, clicking it always picks a concrete choice
  // and moves off 'system', same as most apps handle a manual click.
  const toggleQuickTheme = async () => {
    const next: ThemePreference = getEffectiveIsDark(themePrefRef.current) ? 'light' : 'dark'
    setThemePref(next)
    applyTheme(next)
    try { await apiClient.patch(`/auth/users/${user?.id}/`, { theme_preference: next }) } catch {}
  }

  // Debounced global search — waits 300ms after typing stops before querying,
  // so it's not firing a request on every keystroke.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.get('/search/', { params: { q } })
        setSearchResults(res.data)
      } catch {
        setSearchResults(null)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [query])

  const closeSearch = () => { setShowSearchDropdown(false); setQuery(''); setSearchResults(null) }

  const goToDepartment = () => { closeSearch(); navigate('/departments') }
  const goToKpi = (kpiCode: string) => { closeSearch(); navigate(`/history?q=${encodeURIComponent(kpiCode)}`) }
  const goToResult = (resultId: string) => { closeSearch(); navigate(`/kpi-review/${resultId}`) }

  const hasAnyResults = !!searchResults && (searchResults.departments.length > 0 || searchResults.kpis.length > 0 || searchResults.results.length > 0)

  // Mark a single notification read when the user clicks it, and follow its
  // link if it has one — this is what makes clicking a KPI_SUBMITTED
  // notification actually land on the review screen instead of just closing.
  const markOneRead = async (id: string, alreadyRead: boolean, link?: string) => {
    if (!alreadyRead) {
      try {
        await apiClient.patch(`/notifications/${id}/`, { is_read: true })
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
        setUnreadCount(c => Math.max(0, c - 1))
      } catch {}
    }
    if (link) {
      setShowNotifications(false)
      navigate(link)
    }
  }

  const markAllRead = async () => {
    try {
      await apiClient.post('/notifications/mark_all_read/')
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch {}
  }

  const handleBellClick = () => {
    setShowNotifications(!showNotifications)
    setShowUserMenu(false)
    // Only load the list on open — do NOT mark everything read here, or the
    // badge clears the instant you glance at it.
    if (!showNotifications) fetchNotificationList()
  }

  const fetchNotificationList = async () => {
    try { const res = await apiClient.get('/notifications/?page_size=10'); setNotifications(res.data.results || []) } catch {}
  }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDropdown(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isDark = getEffectiveIsDark(themePref)

  return (
    <header style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid hsl(var(--border-subtle))', backgroundColor: 'hsl(var(--surface-card))', transition: 'background-color 0.3s, border-color 0.3s' }}>
      <div style={{ width: 40 }} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
        <div ref={searchRef} style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', backgroundColor: 'hsl(var(--surface-ground))', border: '1px solid hsl(var(--border-subtle))', borderRadius: 12, width: '100%' }}>
            {searching ? <Loader2 size={16} className="animate-spin" color="hsl(var(--text-tertiary))" /> : <Search size={16} color="hsl(var(--text-tertiary))" />}
            <input
              type="text"
              placeholder="Search KPIs, departments, results..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSearchDropdown(true) }}
              onFocus={() => setShowSearchDropdown(true)}
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'hsl(var(--text-primary))' }}
            />
          </div>

          {showSearchDropdown && query.trim().length >= 2 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 46, borderRadius: 14, backgroundColor: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--border-subtle))', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
              {searching && !searchResults ? (
                <p style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-tertiary))' }}>Searching…</p>
              ) : !hasAnyResults ? (
                <p style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-tertiary))' }}>No matches for "{query}"</p>
              ) : (
                <>
                  {searchResults!.departments.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 16px 4px' }}>Departments</p>
                      {searchResults!.departments.map(d => (
                        <button key={d.id} onClick={goToDepartment} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <Building2 size={14} color="hsl(var(--text-tertiary))" />
                          <span style={{ fontSize: 13, color: 'hsl(var(--text-primary))' }}>{d.name}</span>
                          <span style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))' }}>{d.code}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults!.kpis.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 16px 4px', borderTop: searchResults!.departments.length ? '1px solid hsl(var(--border-subtle))' : 'none' }}>KPIs</p>
                      {searchResults!.kpis.map(k => (
                        <button key={k.id} onClick={() => goToKpi(k.code)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <Target size={14} color="hsl(var(--text-tertiary))" />
                          <span style={{ fontSize: 13, color: 'hsl(var(--text-primary))' }}>{k.name}</span>
                          <span style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))' }}>{k.department_name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults!.results.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 16px 4px', borderTop: (searchResults!.departments.length || searchResults!.kpis.length) ? '1px solid hsl(var(--border-subtle))' : 'none' }}>Results</p>
                      {searchResults!.results.map(r => (
                        <button key={r.id} onClick={() => goToResult(r.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <ClipboardList size={14} color="hsl(var(--text-tertiary))" />
                          <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: RAG_COLOR[r.rag_status] || RAG_COLOR.NO_DATA, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'hsl(var(--text-primary))' }}>{r.kpi_name}</span>
                          <span style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))' }}>{r.department_name} · {r.period_label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={toggleQuickTheme}
          title={isDark ? 'Switch to light' : 'Switch to dark'}
          style={{ padding: 8, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex' }}
        >
          {isDark ? <Sun size={20} color="hsl(var(--text-secondary))" /> : <Moon size={20} color="hsl(var(--text-secondary))" />}
        </button>

        <div ref={notifRef} style={{ position: 'relative' }}>
          <button onClick={handleBellClick} style={{ position: 'relative', padding: 8, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <Bell size={20} color="hsl(var(--text-secondary))" />
            {unreadCount > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid hsl(var(--surface-card))' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {showNotifications && (
            <div style={{ position: 'absolute', right: 0, top: 44, width: 340, borderRadius: 14, backgroundColor: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--border-subtle))', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Notifications</span>
                <button onClick={markAllRead} style={{ fontSize: 12, color: '#4f46e5', border: 'none', background: 'none', cursor: 'pointer' }}>Mark all read</button>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {notifications.length === 0 ? <p style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-tertiary))' }}>No notifications</p> : notifications.map((n: any) => (
                  <div
                    key={n.id}
                    onClick={() => markOneRead(n.id, n.is_read, n.link)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border-subtle))', backgroundColor: n.is_read ? 'transparent' : 'hsl(var(--accent-light))', cursor: (n.is_read && !n.link) ? 'default' : 'pointer' }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'hsl(var(--text-primary))' }}>{n.title}</p>
                    <p style={{ fontSize: 12, color: 'hsl(var(--text-secondary))', margin: '2px 0' }}>{n.message}</p>
                    <p style={{ fontSize: 10, color: 'hsl(var(--text-tertiary))', margin: 0 }}>{n.time_ago || (n.created_at ? new Date(n.created_at).toLocaleString() : '')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={userRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowUserMenu(!showUserMenu)} style={{ border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}>
            <Avatar src={(user as any)?.avatar} name={user?.full_name || ''} size={36} />
          </button>
          {showUserMenu && (
            <div style={{ position: 'absolute', right: 0, top: 44, width: 240, borderRadius: 14, backgroundColor: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--border-subtle))', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'hsl(var(--text-primary))' }}>{user?.full_name}</p>
                <p style={{ fontSize: 12, color: 'hsl(var(--text-secondary))', margin: '2px 0 0' }}>{user?.email}</p>
              </div>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--text-secondary))' }}><User size={16} color="hsl(var(--text-tertiary))" /> Profile</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--text-secondary))' }}><Settings size={16} color="hsl(var(--text-tertiary))" /> Settings</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--text-secondary))' }}><Key size={16} color="hsl(var(--text-tertiary))" /> Password</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--text-secondary))' }}><Palette size={16} color="hsl(var(--text-tertiary))" /> Appearance</button>
              <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', marginTop: 4 }} />
              <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}><LogOut size={16} color="#ef4444" /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}