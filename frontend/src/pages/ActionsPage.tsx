import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/authStore'
import Modal from '../components/shared/Modal'
import SearchableSelect from '../components/shared/SearchableSelect'
import { AlertTriangle, Plus, Search, CheckCircle2, Clock, User, Calendar, Pencil } from 'lucide-react'

interface ActionItem {
  id: string
  action_number: string
  kpi_result: string
  kpi_code: string
  kpi_name: string
  department: string
  department_name: string
  problem_statement: string
  root_cause: string
  corrective_action: string
  preventive_action: string
  action_owner: string | null
  action_owner_name: string
  priority: string
  priority_display: string
  status: string
  status_display: string
  date_raised: string
  due_date: string | null
  completion_percentage: number
  closure_notes?: string
  effectiveness_review?: string
}

interface KPIResultOption {
  id: string
  kpi_name: string
  department: string
  department_name: string
  period_label: string
  rag_status: string
}

interface UserOption {
  id: string
  full_name: string
  department_ids?: string[]
}

const STATUS_FILTERS = ['all', 'OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE', 'AWAITING_REVIEW', 'CLOSED', 'CANCELLED', 'OVERDUE']

// Statuses a user can set directly through a plain field edit.
// CLOSED is deliberately excluded, it only happens through the dedicated close endpoint below,
// which also sets closure_date, reviewer, and completion_percentage as side effects.
const EDITABLE_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE', 'AWAITING_REVIEW', 'CANCELLED']

const statusColors: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  AWAITING_EVIDENCE: 'bg-orange-100 text-orange-700',
  AWAITING_REVIEW: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  OVERDUE: 'bg-red-200 text-red-800',
}

const priorityColors: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
}

const emptyForm = {
  kpi_result: '',
  problem_statement: '',
  root_cause: '',
  corrective_action: '',
  preventive_action: '',
  action_owner: '',
  priority: 'MEDIUM',
  due_date: '',
}

// Shared field styling, used by both the create and edit modals.
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid hsl(var(--border-subtle))',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  marginTop: 6,
  backgroundColor: 'hsl(var(--surface-card))',
  color: 'hsl(var(--text-primary))',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'hsl(var(--text-primary))',
  display: 'block',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'hsl(var(--text-tertiary))',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 12,
}

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#6366f1'
    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'hsl(var(--border-subtle))'
    e.target.style.boxShadow = 'none'
  },
}

export default function ActionsPage() {
  const currentUser = useAuthStore((s) => s.user)
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'TEAM_LEADER'
  const [searchParams, setSearchParams] = useSearchParams()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [results, setResults] = useState<KPIResultOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [form, setForm] = useState({ ...emptyForm })
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    const [actionsRes, resultsRes, usersRes] = await Promise.allSettled([
      apiClient.get('/actions/?page_size=50'),
      apiClient.get('/results/?page_size=200'),
      apiClient.get('/auth/users/my_team/'),
    ])

    if (actionsRes.status === 'fulfilled') {
      setActions(actionsRes.value.data.results ?? actionsRes.value.data ?? [])
    } else {
      setActions([])
      setLoadError(true)
    }

    if (resultsRes.status === 'fulfilled') {
      setResults(resultsRes.value.data.results ?? resultsRes.value.data ?? [])
    } else {
      setResults([])
      console.error('Failed to load KPI results for the action form', resultsRes.reason)
    }

    if (usersRes.status === 'fulfilled') {
      setUsers(usersRes.value.data.results ?? usersRes.value.data ?? [])
    } else {
      setUsers([])
      console.error('Failed to load users for the action form', usersRes.reason)
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Arriving from a "Corrective Action Assigned" notification lands here with
  // ?open=<id>. Once actions are loaded, open that one automatically. If it's
  // not in the currently loaded page (pagination, or excluded by a filter),
  // fetch it directly rather than leaving the notification link a dead end.
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || loading) return

    const existing = actions.find(a => a.id === openId)
    if (existing) {
      setEditingAction(existing)
      setSearchParams({}, { replace: true })
      return
    }

    apiClient.get(`/actions/${openId}/`)
      .then(res => setEditingAction(res.data))
      .catch(() => { /* action may have been deleted, or the user lost access to it */ })
      .finally(() => setSearchParams({}, { replace: true }))
  }, [searchParams, actions, loading, setSearchParams])

  const filtered = actions
    .filter((a) => filter === 'all' || a.status === filter)
    .filter((a) =>
      (a.problem_statement || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.action_owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.kpi_name || '').toLowerCase().includes(search.toLowerCase())
    )

  const resultOptions = useMemo(
    () => results.map(r => ({
      value: r.id,
      label: `${r.kpi_name} — ${r.department_name}`,
      sublabel: r.period_label,
    })),
    [results]
  )

  const userOptions = useMemo(
    () => users.map(u => ({ value: u.id, label: u.full_name })),
    [users]
  )

  const selectedResult = useMemo(
    () => results.find(r => r.id === form.kpi_result),
    [results, form.kpi_result]
  )

  // Owner picker for a new action is scoped to the linked KPI result's
  // department — assigning someone outside that department never made sense,
  // this just stops it from being offered as an option in the first place.
  const createOwnerOptions = useMemo(() => {
    if (!selectedResult) return []
    return users
      .filter(u => (u.department_ids || []).includes(selectedResult.department))
      .map(u => ({ value: u.id, label: u.full_name }))
  }, [users, selectedResult])

  const resetForm = () => setForm({ ...emptyForm })

  const createAction = async () => {
    if (!form.kpi_result) { setFormErr('KPI result is required'); return }
    if (!form.problem_statement.trim()) { setFormErr('Problem statement is required'); return }
    if (!form.corrective_action.trim()) { setFormErr('Corrective action is required'); return }
    if (!selectedResult) { setFormErr('Selected KPI result is invalid'); return }

    setCreating(true)
    setFormErr('')
    try {
      const payload = {
        kpi_result: form.kpi_result,
        department: selectedResult.department,
        problem_statement: form.problem_statement,
        root_cause: form.root_cause,
        corrective_action: form.corrective_action,
        preventive_action: form.preventive_action,
        action_owner: form.action_owner || null,
        priority: form.priority,
        due_date: form.due_date || null,
      }
      const res = await apiClient.post('/actions/', payload)
      setActions(prev => [res.data, ...prev])
      setShowCreate(false)
      resetForm()
    } catch (err: any) {
      const data = err.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      setFormErr((Array.isArray(firstError) ? firstError[0] : firstError) || 'Failed to create action')
    } finally {
      setCreating(false)
    }
  }

  // Called by the edit modal after any successful change, so the card list reflects it immediately.
  const applyUpdate = (updated: ActionItem) => {
    setActions(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Corrective Actions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and resolve issues raised against KPI results</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> New Action</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: 'hsl(var(--surface-ground))', border: '1px solid hsl(var(--border-subtle))', borderRadius: 12, maxWidth: 400 }}>
          <Search className="h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search actions..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'hsl(var(--text-primary))' }} />
        </div>
        <div className="tab-bar">
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`tab-item ${filter === f ? 'active' : ''}`}>
              {f === 'all' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal
          open={showCreate}
          onClose={() => { setShowCreate(false); setFormErr('') }}
          title="New Corrective Action"
          size="md"
          footer={
            <>
              <button onClick={() => { setShowCreate(false); setFormErr('') }} className="btn btn-ghost">Cancel</button>
              <button onClick={createAction} disabled={creating} className="btn btn-primary">{creating ? 'Creating…' : 'Create'}</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div>
              <p style={sectionTitleStyle}>Linked KPI result</p>
              <div>
                <label style={labelStyle}>KPI result</label>
                <SearchableSelect
                  value={form.kpi_result}
                  onChange={(v) => setForm(p => ({ ...p, kpi_result: v }))}
                  options={resultOptions}
                  placeholder="Select the KPI result this action addresses…"
                  emptyMessage="No matching KPI results"
                />
                {selectedResult && (
                  <p style={{ fontSize: 12, color: 'hsl(var(--text-tertiary))', marginTop: 6 }}>
                    Department: {selectedResult.department_name}
                  </p>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
              <p style={sectionTitleStyle}>Problem and action</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Problem statement</label>
                  <textarea value={form.problem_statement} onChange={(e) => setForm(p => ({ ...p, problem_statement: e.target.value }))} placeholder="What went wrong" rows={2} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label style={labelStyle}>Root cause</label>
                  <textarea value={form.root_cause} onChange={(e) => setForm(p => ({ ...p, root_cause: e.target.value }))} placeholder="Optional" rows={2} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label style={labelStyle}>Corrective action</label>
                  <textarea value={form.corrective_action} onChange={(e) => setForm(p => ({ ...p, corrective_action: e.target.value }))} placeholder="What will be done to fix it" rows={2} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label style={labelStyle}>Preventive action</label>
                  <textarea value={form.preventive_action} onChange={(e) => setForm(p => ({ ...p, preventive_action: e.target.value }))} placeholder="Optional, how to stop it recurring" rows={2} style={inputStyle} {...focusHandlers} />
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
              <p style={sectionTitleStyle}>Assignment</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Owner</label>
                  <SearchableSelect
                    value={form.action_owner}
                    onChange={(v) => setForm(p => ({ ...p, action_owner: v }))}
                    options={createOwnerOptions}
                    placeholder={selectedResult ? 'Unassigned' : 'Select a KPI result first'}
                    emptyMessage="No members in this department yet"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))} style={inputStyle} {...focusHandlers}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Due date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} {...focusHandlers} />
                </div>
              </div>
            </div>

            {formErr && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{formErr}</p>}
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingAction && (
        <ActionEditModal
          action={editingAction}
          users={users}
          canManage={canManage}
          onClose={() => setEditingAction(null)}
          onUpdated={(updated) => { applyUpdate(updated); setEditingAction(updated) }}
        />
      )}

      {/* Actions List */}
      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
      ) : loadError ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-red-300" />
          <p className="text-gray-700 font-medium">Could not load actions.</p>
          <p className="text-sm text-gray-500 mt-1">Check that the backend is running and reachable.</p>
          <button onClick={load} className="btn btn-ghost mt-4">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No actions found.</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary mt-4"><Plus className="h-4 w-4" /> Create first action</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(action => (
            <div key={action.id} className="card p-5 cursor-pointer" onClick={() => setEditingAction(action)}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-lg ${action.status === 'CLOSED' ? 'bg-green-50' : action.status === 'IN_PROGRESS' ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    {action.status === 'CLOSED' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : action.status === 'IN_PROGRESS' ? <Clock className="h-5 w-5 text-yellow-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{action.problem_statement}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{action.action_number} · {action.kpi_name}</p>
                    {action.corrective_action && <p className="text-sm text-gray-500 mt-1">{action.corrective_action}</p>}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><User size={12} /> {action.action_owner_name || 'Unassigned'}</span>
                      <span className="flex items-center gap-1"><Calendar size={12} /> Due: {action.due_date || '—'}</span>
                      <span className={`font-medium ${priorityColors[action.priority]}`}>● {action.priority_display}</span>
                      {action.completion_percentage > 0 && <span>{action.completion_percentage}% complete</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${statusColors[action.status]}`}>
                    {action.status_display}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-gray-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Edit modal ----
// Three separate save paths, matching the three separate ways the backend allows an action to change:
// details (plain PATCH), progress (POST update_progress), and closing (POST close).
function ActionEditModal({
  action, users, canManage, onClose, onUpdated,
}: {
  action: ActionItem
  users: UserOption[]
  canManage: boolean
  onClose: () => void
  onUpdated: (updated: ActionItem) => void
}) {
  // Owner picker here is scoped to the action's own department, same reasoning
  // as the create form — an owner from another department was never a valid option.
  const ownerOptions = useMemo(
    () => users
      .filter(u => (u.department_ids || []).includes(action.department))
      .map(u => ({ value: u.id, label: u.full_name })),
    [users, action.department]
  )

  const [problemStatement, setProblemStatement] = useState(action.problem_statement)
  const [rootCause, setRootCause] = useState(action.root_cause)
  const [correctiveAction, setCorrectiveAction] = useState(action.corrective_action)
  const [preventiveAction, setPreventiveAction] = useState(action.preventive_action)
  const [owner, setOwner] = useState(action.action_owner || '')
  const [priority, setPriority] = useState(action.priority)
  const [dueDate, setDueDate] = useState(action.due_date || '')
  const [status, setStatus] = useState(action.status)

  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsErr, setDetailsErr] = useState('')

  const [progress, setProgress] = useState(action.completion_percentage)
  const [savingProgress, setSavingProgress] = useState(false)
  const [progressErr, setProgressErr] = useState('')

  const [showClose, setShowClose] = useState(false)
  const [closureNotes, setClosureNotes] = useState('')
  const [effectivenessReview, setEffectivenessReview] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeErr, setCloseErr] = useState('')

  const isClosed = action.status === 'CLOSED' || action.status === 'CANCELLED'

  const saveDetails = async () => {
    setSavingDetails(true)
    setDetailsErr('')
    try {
      const res = await apiClient.patch(`/actions/${action.id}/`, {
        problem_statement: problemStatement,
        root_cause: rootCause,
        corrective_action: correctiveAction,
        preventive_action: preventiveAction,
        action_owner: owner || null,
        priority,
        due_date: dueDate || null,
        status,
      })
      onUpdated(res.data)
    } catch (err: any) {
      const data = err.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      setDetailsErr((Array.isArray(firstError) ? firstError[0] : firstError) || 'Failed to save changes')
    } finally {
      setSavingDetails(false)
    }
  }

  const saveProgress = async () => {
    setSavingProgress(true)
    setProgressErr('')
    try {
      await apiClient.post(`/actions/${action.id}/update_progress/`, { completion_percentage: progress })
      // The endpoint only returns the percentage, refetch the full record so status (auto-bumped
      // from OPEN to IN_PROGRESS server-side) stays in sync with what's shown here.
      const res = await apiClient.get(`/actions/${action.id}/`)
      onUpdated(res.data)
    } catch (err: any) {
      setProgressErr(err.response?.data?.detail || 'Failed to update progress')
    } finally {
      setSavingProgress(false)
    }
  }

  const closeAction = async () => {
    setClosing(true)
    setCloseErr('')
    try {
      await apiClient.post(`/actions/${action.id}/close/`, {
        closure_notes: closureNotes,
        effectiveness_review: effectivenessReview,
      })
      const res = await apiClient.get(`/actions/${action.id}/`)
      onUpdated(res.data)
      onClose()
    } catch (err: any) {
      const data = err.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      setCloseErr((Array.isArray(firstError) ? firstError[0] : firstError) || 'Failed to close action')
    } finally {
      setClosing(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Edit ${action.action_number}`}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          {canManage && (
            <button onClick={saveDetails} disabled={savingDetails} className="btn btn-primary">
              {savingDetails ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div>
          <p style={sectionTitleStyle}>Linked KPI result</p>
          <p style={{ fontSize: 14, color: 'hsl(var(--text-primary))', margin: 0 }}>{action.kpi_name} — {action.department_name}</p>
          <p style={{ fontSize: 12, color: 'hsl(var(--text-tertiary))', marginTop: 2 }}>Set when the action was created, not editable here.</p>
        </div>

        <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
          <p style={sectionTitleStyle}>Problem and action</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Problem statement</label>
              <textarea value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} disabled={!canManage} />
            </div>
            <div>
              <label style={labelStyle}>Root cause</label>
              <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} disabled={!canManage} />
            </div>
            <div>
              <label style={labelStyle}>Corrective action</label>
              <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} disabled={!canManage} />
            </div>
            <div>
              <label style={labelStyle}>Preventive action</label>
              <textarea value={preventiveAction} onChange={(e) => setPreventiveAction(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} disabled={!canManage} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
          <p style={sectionTitleStyle}>Assignment and status</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Owner</label>
              {canManage ? (
                <SearchableSelect value={owner} onChange={setOwner} options={ownerOptions} placeholder="Unassigned" emptyMessage="No members in this department yet" />
              ) : (
                <p style={{ fontSize: 14, color: 'hsl(var(--text-primary))', margin: '6px 0 0' }}>{action.action_owner_name || 'Unassigned'}</p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle} {...focusHandlers} disabled={!canManage}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} {...focusHandlers} disabled={!canManage} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle} {...focusHandlers} disabled={isClosed || !canManage}>
                {EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          {detailsErr && <p style={{ fontSize: 13, color: '#dc2626', marginTop: 10 }}>{detailsErr}</p>}
        </div>

        <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
          <p style={sectionTitleStyle}>Progress</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={0} max={100} value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              disabled={isClosed}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, width: 42, textAlign: 'right', color: 'hsl(var(--text-primary))' }}>{progress}%</span>
            <button onClick={saveProgress} disabled={savingProgress || isClosed} className="btn btn-ghost text-sm">
              {savingProgress ? 'Saving…' : 'Save'}
            </button>
          </div>
          {progress > 0 && action.status === 'OPEN' && (
            <p style={{ fontSize: 12, color: 'hsl(var(--text-tertiary))', marginTop: 6 }}>Saving progress above 0% moves this to In Progress automatically.</p>
          )}
          {progressErr && <p style={{ fontSize: 13, color: '#dc2626', marginTop: 10 }}>{progressErr}</p>}
        </div>

        {!isClosed && canManage && (
          <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
            {!showClose ? (
              <button onClick={() => setShowClose(true)} className="btn btn-ghost text-sm">Close this action…</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={sectionTitleStyle}>Close action</p>
                <div>
                  <label style={labelStyle}>Closure notes</label>
                  <textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} placeholder="What was done" />
                </div>
                <div>
                  <label style={labelStyle}>Effectiveness review</label>
                  <textarea value={effectivenessReview} onChange={(e) => setEffectivenessReview(e.target.value)} rows={2} style={inputStyle} {...focusHandlers} placeholder="Optional, did it work" />
                </div>
                {closeErr && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{closeErr}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowClose(false)} className="btn btn-ghost text-sm">Cancel</button>
                  <button onClick={closeAction} disabled={closing} className="btn btn-primary text-sm">{closing ? 'Closing…' : 'Close action'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {isClosed && (
          <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
            <p style={{ fontSize: 13, color: 'hsl(var(--text-tertiary))', margin: 0 }}>
              This action is {action.status_display.toLowerCase()} and can no longer be edited.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}