import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { Search, Shield, Calendar, User, RefreshCw, AlertTriangle } from 'lucide-react'

interface AuditLog {
  id: string
  user: string | null
  user_name: string
  action: string
  target: string
  ip_address: string | null
  created_at: string
}

export default function AuditPage() {
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.role === 'ADMIN'

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    setLoadError(false)
    apiClient.get('/audit-logs/?page_size=100')
      .then(res => setLogs(res.data.results ?? res.data ?? []))
      .catch(() => { setLogs([]); setLoadError(true) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (isAdmin) { load() } else { setLoading(false) } }, [isAdmin])

  const filtered = logs.filter((l) =>
    (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.target || '').toLowerCase().includes(search.toLowerCase())
  )

  if (!isAdmin) {
    return <div className="card p-8 text-center text-gray-500">Only admins can view the audit trail.</div>
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every tracked action in the system, recorded</p>
        </div>
        <button onClick={load} className="btn btn-ghost text-sm" disabled={loading}><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: 'hsl(var(--surface-ground))', border: '1px solid hsl(var(--border-subtle))', borderRadius: 12, maxWidth: 400 }}>
        <Search className="h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by user, action, or target..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'hsl(var(--text-primary))' }} />
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
      ) : loadError ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-red-300" />
          <p className="text-gray-700 font-medium">Could not load the audit trail.</p>
          <p className="text-sm text-gray-500 mt-1">Check that the backend is running and reachable.</p>
          <button onClick={load} className="btn btn-ghost mt-4">Retry</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Date/Time</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                          <User size={12} />
                        </div>
                        <span className="text-sm font-medium">{log.user_name || 'System'}</span>
                      </div>
                    </td>
                    <td><span className="text-sm">{log.action}</span></td>
                    <td><span className="text-sm font-mono">{log.target || '—'}</span></td>
                    <td>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar size={12} />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td><span className="text-xs text-gray-400 font-mono">{log.ip_address || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>{logs.length === 0 ? 'No audit activity recorded yet.' : 'No audit logs match your search.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}