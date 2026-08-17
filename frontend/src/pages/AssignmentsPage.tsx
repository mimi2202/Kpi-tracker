// frontend/src/pages/AssignmentsPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { Search, Users, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

interface KPIRow { id: string; code: string; name: string; department: string; department_name: string }
interface Member { id: string; full_name: string; email: string; department_ids: string[] }
interface Assignment { id: string; kpi: string; user: string }

const chip = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
    active
      ? 'bg-indigo-600 border-indigo-600 text-white'
      : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400'
  }`

export default function AssignmentsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'

  const [kpis, setKpis] = useState<KPIRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  // kpiId -> Set of assigned userIds (live edit state)
  const [assigned, setAssigned] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [savingKpi, setSavingKpi] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toast = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text }); setTimeout(() => setMessage(null), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [kpiRes, memberRes, assignRes] = await Promise.all([
        apiClient.get('/kpis/', { params: { page_size: 500, is_active: true } }),
        apiClient.get('/auth/users/my_team/'),
        apiClient.get('/kpi-assignments/', { params: { page_size: 1000, is_active: true } }),
      ])
      const kpiList: KPIRow[] = kpiRes.data.results ?? kpiRes.data
      setKpis(kpiList)
      setMembers(memberRes.data ?? [])
      const map: Record<string, Set<string>> = {}
      for (const k of kpiList) map[k.id] = new Set()
      const assignments: Assignment[] = assignRes.data.results ?? assignRes.data
      for (const a of assignments) {
        if (!map[a.kpi]) map[a.kpi] = new Set()
        map[a.kpi].add(a.user)
      }
      setAssigned(map)
    } catch (err) {
      console.error(err)
      toast('error', 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (kpiId: string, userId: string) => {
    setAssigned(prev => {
      const next = new Set(prev[kpiId] ?? [])
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return { ...prev, [kpiId]: next }
    })
  }

  const setAll = (kpiId: string, userIds: string[], on: boolean) => {
    setAssigned(prev => ({ ...prev, [kpiId]: new Set(on ? userIds : []) }))
  }

  const saveKpi = async (kpiId: string) => {
    setSavingKpi(kpiId)
    try {
      await apiClient.post('/kpi-assignments/set_for_kpi/', {
        kpi_id: kpiId,
        user_ids: Array.from(assigned[kpiId] ?? []),
      })
      toast('success', 'Assignments saved')
    } catch (err: any) {
      toast('error', err.response?.data?.detail || 'Save failed')
    } finally {
      setSavingKpi(null)
    }
  }

  const toggleGroup = (departmentId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(departmentId) ? next.delete(departmentId) : next.add(departmentId)
      return next
    })
  }

  const filtered = kpis.filter(k => {
    const q = search.trim().toLowerCase()
    return !q || k.code.toLowerCase().includes(q) || k.name.toLowerCase().includes(q) || k.department_name?.toLowerCase().includes(q)
  })

  // Group KPIs by department, preserving each department's first-seen order.
  const groups = useMemo(() => {
    const byDept = new Map<string, { departmentName: string; kpis: KPIRow[] }>()
    for (const k of filtered) {
      if (!byDept.has(k.department)) byDept.set(k.department, { departmentName: k.department_name, kpis: [] })
      byDept.get(k.department)!.kpis.push(k)
    }
    return Array.from(byDept.entries()).sort((a, b) => a[1].departmentName.localeCompare(b[1].departmentName))
  }, [filtered])

  // Only members belonging to a given department should ever be selectable
  // for a KPI in that department, not the whole org.
  const membersByDept = useMemo(() => {
    const map = new Map<string, Member[]>()
    for (const m of members) {
      for (const deptId of m.department_ids) {
        if (!map.has(deptId)) map.set(deptId, [])
        map.get(deptId)!.push(m)
      }
    }
    return map
  }, [members])

  if (!canManage) {
    return <div className="card p-8 text-center text-gray-500">Only admins and team leaders can assign KPIs.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KPI Assignments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign who reports each KPI. Applies to every future period automatically.</p>
        </div>
        <button onClick={load} className="btn btn-ghost text-sm" disabled={loading}><RefreshCw className="h-4 w-4" /></button>
      </div>

      {message && (
        <div className={'p-3 rounded-xl text-sm ' + (message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
          {message.text}
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-2 max-w-md">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search KPIs..." className="input-field border flex-1" />
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">No KPIs match your search.</div>
      ) : (
        <div className="space-y-4">
          {groups.map(([departmentId, group]) => {
            const isCollapsed = collapsed.has(departmentId)
            const deptMembers = membersByDept.get(departmentId) ?? []
            return (
              <div key={departmentId} className="card overflow-hidden">
                <button
                  onClick={() => toggleGroup(departmentId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'hsl(var(--surface-ground))', border: 'none', cursor: 'pointer' }}
                >
                  <span className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'hsl(var(--text-primary))' }}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    {group.departmentName}
                  </span>
                  <span className="text-xs text-gray-500">{group.kpis.length} KPI{group.kpis.length === 1 ? '' : 's'} · {deptMembers.length} member{deptMembers.length === 1 ? '' : 's'}</span>
                </button>

                {!isCollapsed && (
                  <div className="p-4 space-y-3">
                    {group.kpis.map(kpi => {
                      const set = assigned[kpi.id] ?? new Set<string>()
                      const allOn = deptMembers.length > 0 && deptMembers.every(m => set.has(m.id))
                      return (
                        <div key={kpi.id} className="border border-gray-100 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{kpi.code}</span>
                                <span className="text-sm text-gray-700">{kpi.name}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                <Users className="h-3 w-3" /> {set.size} assigned
                              </p>
                            </div>
                            <button
                              onClick={() => saveKpi(kpi.id)}
                              disabled={savingKpi === kpi.id}
                              className="btn btn-primary text-xs py-1.5 px-3 shrink-0"
                            >
                              {savingKpi === kpi.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>

                          {deptMembers.length === 0 ? (
                            <span className="text-sm text-gray-400">No members in this department yet.</span>
                          ) : (
                            <>
                              <button
                                onClick={() => setAll(kpi.id, deptMembers.map(m => m.id), !allOn)}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium mb-2"
                              >
                                {allOn ? 'Clear all' : 'Select all'}
                              </button>
                              <div className="flex flex-wrap gap-2">
                                {deptMembers.map(m => {
                                  const on = set.has(m.id)
                                  return (
                                    <button key={m.id} onClick={() => toggle(kpi.id, m.id)} className={chip(on)} title={m.email}>
                                      {on ? <Check className="h-3 w-3 inline mr-1" /> : null}
                                      {m.full_name}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}