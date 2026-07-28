import { apiClient } from '../../api/client'
import Avatar from '../shared/Avatar'
import { useAuthStore } from '../../store/authStore'
import { Bell, Search, Settings, User, LogOut, Key, Palette } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function TopBar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => { logout(); navigate('/login') }

  const fetchUnreadCount = async () => {
    try { const res = await apiClient.get('/notifications/unread_count/'); setUnreadCount(res.data.count) } catch {}
  }

  useEffect(() => {
    fetchUnreadCount()
    apiClient.get('/auth/users/me/').then(res => { useAuthStore.getState().setUser(res.data) }).catch(() => {})
    const i = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(i)
  }, [])

  const fetchNotificationList = async () => {
    try { const res = await apiClient.get('/notifications/?page_size=10'); setNotifications(res.data.results || []) } catch {}
  }

  // Mark a single notification read when the user clicks it. Unread ones stay
  // counted until opened, so the badge reflects what's actually unseen.
  const markOneRead = async (id: string, alreadyRead: boolean) => {
    if (alreadyRead) return
    try {
      await apiClient.patch(`/notifications/${id}/`, { is_read: true })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch {}
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

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <header style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: 'white' }}>
      <div style={{ width: 40 }} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 12, width: '100%', maxWidth: 480 }}>
          <Search size={16} color="#9ca3af" />
          <input type="text" placeholder="Search KPIs, departments, results..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button onClick={handleBellClick} style={{ position: 'relative', padding: 8, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <Bell size={20} color="#6b7280" />
            {unreadCount > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {showNotifications && (
            <div style={{ position: 'absolute', right: 0, top: 44, width: 340, borderRadius: 14, backgroundColor: 'white', border: '1px solid #e5e7eb', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Notifications</span>
                <button onClick={markAllRead} style={{ fontSize: 12, color: '#4f46e5', border: 'none', background: 'none', cursor: 'pointer' }}>Mark all read</button>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {notifications.length === 0 ? <p style={{ padding: 24, textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>No notifications</p> : notifications.map((n: any) => (
                  <div
                    key={n.id}
                    onClick={() => markOneRead(n.id, n.is_read)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', backgroundColor: n.is_read ? 'white' : '#f5f3ff', cursor: n.is_read ? 'default' : 'pointer' }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0' }}>{n.message}</p>
                    <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>{n.time_ago || (n.created_at ? new Date(n.created_at).toLocaleString() : '')}</p>
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
            <div style={{ position: 'absolute', right: 0, top: 44, width: 240, borderRadius: 14, backgroundColor: 'white', border: '1px solid #e5e7eb', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{user?.full_name}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{user?.email}</p>
              </div>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}><User size={16} color="#6b7280" /> Profile</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}><Settings size={16} color="#6b7280" /> Settings</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}><Key size={16} color="#6b7280" /> Password</button>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}><Palette size={16} color="#6b7280" /> Appearance</button>
              <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 4 }} />
              <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}><LogOut size={16} color="#ef4444" /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}