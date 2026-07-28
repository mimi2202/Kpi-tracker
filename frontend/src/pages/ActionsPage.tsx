import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'
import { AlertTriangle, Plus, Search, CheckCircle2, Clock, XCircle, User, Calendar, RefreshCw } from 'lucide-react'

export default function ActionsPage() {
  const [actions, setActions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newAction, setNewAction] = useState({ title: '', description: '', owner: '', due_date: '', priority: 'medium' })

  useEffect(() => {
    apiClient.get('/actions/?page_size=50').then(res => {
      setActions(res.data.results || res.data || [])
    }).catch(() => {
      setActions([
        { id: 1, title: 'Investigate budget variance', description: 'Finance KPIs showing 15% over budget', status: 'open', priority: 'high', owner_name: 'Sarah Johnson', due_date: '2026-07-30', created_at: '2026-07-24' },
        { id: 2, title: 'Improve SLA response time', description: 'PM-W-001 dropped to AT_RISK', status: 'in_progress', priority: 'medium', owner_name: 'John Doe', due_date: '2026-08-05', created_at: '2026-07-22' },
        { id: 3, title: 'Update training materials', description: 'QA-Q-001 requires updated docs', status: 'closed', priority: 'low', owner_name: 'Daniel Ulokaji', due_date: '2026-07-20', created_at: '2026-07-15' },
      ])
    }).finally(() => setLoading(false))
  }, [])

  const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    closed: 'bg-green-100 text-green-700',
  }

  const priorityColors: Record<string, string> = {
    high: 'text-red-600',
    medium: 'text-yellow-600',
    low: 'text-gray-500',
  }

  const filtered = actions
    .filter((a: any) => filter === 'all' || a.status === filter)
    .filter((a: any) =>
      (a.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.owner_name || '').toLowerCase().includes(search.toLowerCase())
    )

  const createAction = async () => {
    try {
      await apiClient.post('/actions/', newAction)
      setShowCreate(false)
      setNewAction({ title: '', description: '', owner: '', due_date: '', priority: 'medium' })
      window.location.reload()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Corrective Actions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and resolve issues</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> New Action</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, maxWidth: 400 }}>
          <Search className="h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search actions..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14 }} />
        </div>
        <div className="tab-bar">
          {['all', 'open', 'in_progress', 'closed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`tab-item ${filter === f ? 'active' : ''}`}>{f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: '100px 16px 16px 16px' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">New Corrective Action</h2>
            <div className="space-y-3">
              <input value={newAction.title} onChange={(e) => setNewAction(p => ({ ...p, title: e.target.value }))} placeholder="Action title" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
              <textarea value={newAction.description} onChange={(e) => setNewAction(p => ({ ...p, description: e.target.value }))} placeholder="Description" rows={3} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
              <input value={newAction.owner} onChange={(e) => setNewAction(p => ({ ...p, owner: e.target.value }))} placeholder="Owner name" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
              <input type="date" value={newAction.due_date} onChange={(e) => setNewAction(p => ({ ...p, due_date: e.target.value }))} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }} />
              <select value={newAction.priority} onChange={(e) => setNewAction(p => ({ ...p, priority: e.target.value }))} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none' }}>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={createAction} className="btn btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Actions List */}
      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No actions found.</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary mt-4"><Plus className="h-4 w-4" /> Create first action</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(action => (
            <div key={action.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-lg ${action.status === 'open' ? 'bg-red-50' : action.status === 'in_progress' ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    {action.status === 'closed' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : action.status === 'in_progress' ? <Clock className="h-5 w-5 text-yellow-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{action.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><User size={12} /> {action.owner_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={12} /> Due: {action.due_date}</span>
                      <span className={`font-medium ${priorityColors[action.priority]}`}>● {action.priority.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${statusColors[action.status]}`}>
                  {action.status === 'in_progress' ? 'In Progress' : action.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
