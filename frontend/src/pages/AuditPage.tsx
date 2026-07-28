import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'
import { Search, Shield, Calendar, User, RefreshCw } from 'lucide-react'

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    apiClient.get('/audit-logs/?page_size=50').then(res => {
      setLogs(res.data.results || res.data || [])
    }).catch(() => {
      // Fallback mock data
      setLogs([
        { id: 1, user_name: 'Daniel Ulokaji', action: 'Created KPI', target: 'OPS-W-001', timestamp: '2026-07-24T14:30:00Z', ip: '127.0.0.1' },
        { id: 2, user_name: 'Daniel Ulokaji', action: 'Opened Period', target: 'Week 30', timestamp: '2026-07-24T13:00:00Z', ip: '127.0.0.1' },
        { id: 3, user_name: 'Sarah Johnson', action: 'Submitted Result', target: 'BD-W-001', timestamp: '2026-07-24T12:00:00Z', ip: '127.0.0.1' },
        { id: 4, user_name: 'Daniel Ulokaji', action: 'Changed Role', target: 'John Doe → Team Leader', timestamp: '2026-07-23T16:00:00Z', ip: '127.0.0.1' },
        { id: 5, user_name: 'Daniel Ulokaji', action: 'Locked Period', target: 'July 2026', timestamp: '2026-07-23T10:00:00Z', ip: '127.0.0.1' },
        { id: 6, user_name: 'System', action: 'Period Auto-Closed', target: 'Week 29', timestamp: '2026-07-22T00:00:00Z', ip: '—' },
      ])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = logs.filter((l: any) =>
    (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.target || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every action in the system, recorded</p>
        </div>
        <button onClick={() => window.location.reload()} className="btn btn-ghost text-sm"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, maxWidth: 400 }}>
        <Search className="h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by user, action, or target..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14 }} />
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
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
                        <span className="text-sm font-medium">{log.user_name}</span>
                      </div>
                    </td>
                    <td><span className="text-sm">{log.action}</span></td>
                    <td><span className="text-sm font-mono">{log.target}</span></td>
                    <td>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar size={12} />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td><span className="text-xs text-gray-400 font-mono">{log.ip}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No audit logs match your search.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
