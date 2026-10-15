// frontend/src/pages/AssignmentsPage.tsx
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { Search, Users, Check, RefreshCw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

interface KPIRow { id: string; code: string; name: string; department: string; department_name: string }
interface Member { id: string; full_name: string; email: string; department_ids: string[] }
interface Assignment { id: string; kpi: string; user: string }
interface PageData { kpis: KPIRow[]; members: Member[]; assigned: Record<string, string[]> }

const QUERY_KEY = ['assignments-page']

const chip = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
    active
      ? 'bg-indigo-600 border-indigo-600 text-white'
      : 'bg-[hsl(var(--surface-card))] border-[hsl(var(--border-subtle))] text-[hsl(var(--text-secondary))] hover:border-indigo-400'
  }`

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x))

async function fetchPage(): Promise<PageData> {
  const [kpiRes, memberRes, assignRes] = await Promise.all([
    apiClient.get('/kpis/', { params: { page_size: 500, is_active: true } }),
    apiClient.get('/auth/users/my_team/'),
    apiClient.get('/kpi-assignments/', { params: { page_size: 1000, is_active: true } }),
  ])
  const kpis: KPIRow[] = kpiRes.data.results ?? kpiRes.data
  const assigned: Record<string, string[]> = {}
  for (const k of kpis) assigned[k.id] = []
  const assignments: Assignment[] = assignRes.data.results ?? assignRes.data
  for (const a of assignments) (assigned[a.kpi] ??= []).push(a.user)
  return { kpis, members: memberRes.data ?? [], assigned }
}

export default function AssignmentsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'
  const queryClient = useQueryClient()

  // Server state. Refreshes when you come back to the tab and once a minute,
  // so changes made by someone else show up without a manual reload. Your own
  // unsaved edits live in `drafts` and are never overwritten by a refresh.
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPage,
    enabled: canManage,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
  const kpis = data?.kpis ?? []
  const members = data?.members ?? []

  const saved = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const [k, v] of Object.entries(data?.assigned ?? {})) m[k] = new Set(v)
    return m
  }, [data])

  // kpiId -> edited set, only present while it differs from the saved state.
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({})
  const [savingDept, setSavingDept] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState<string | null>(null) // department whose Save button briefly reads "Saved"
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toast = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text }); setTimeout(() => setMessage(null), 3000)
  }

  const current = (kpiId: string) => drafts[kpiId] ?? saved[kpiId] ?? new Set<string>()

  const setDraft = (kpiId: string, next: Set<string>) => {
    setDrafts(prev => {
      const copy = { ...prev }
      if (sameSet(next, saved[kpiId] ?? new Set())) delete copy[kpiId]
      else copy[kpiId] = next
      return copy
    })
  }

  // If a refresh brings in exactly what you edited (e.g. someone made the same
  // change), the draft is no longer a difference, so drop it.
  useEffect(() => {
    setDrafts(prev => {
      let changed = false
      const c = { ...prev }
      for (const id of Object.keys(prev)) {
        if (sameSet(prev[id], saved[id] ?? new Set())) { delete c[id]; changed = true }
      }
      return changed ? c : prev
    })
  }, [saved])

  const toggle = (kpiId: string, userId: string) => {
    const next = new Set(current(kpiId))
    next.has(userId) ? next.delete(userId) : next.add(userId)
    setDraft(kpiId, next)
  }

  const setAll = (kpiId: string, userIds: string[], on: boolean) => setDraft(kpiId, new Set(on ? userIds : []))

  // Which KPIs in each department have unsaved changes.
  const dirtyByDept = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const k of kpis) {
      if (drafts[k.id]) (map.get(k.department) ?? map.set(k.department, []).get(k.department)!).push(k.id)
    }
    return map
  }, [kpis, drafts])
  const totalDirty = [...dirtyByDept.values()].reduce((n, a) => n + a.length, 0)

  // Warn before leaving the tab with unsaved edits.
  useEffect(() => {
    if (totalDirty === 0) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [totalDirty])

  const saveDept = async (departmentId: string) => {
    const ids = dirtyByDept.get(departmentId) ?? []
    if (ids.length === 0) return
    setSavingDept(departmentId)
    const failed: string[] = []
    let ok = 0
    for (const kpiId of ids) {
      const userIds = Array.from(drafts[kpiId] ?? [])
      try {
        await apiClient.post('/kpi-assignments/set_for_kpi/', { kpi_id: kpiId, user_ids: userIds })
        // Update the cached server state in place, then drop the draft, so the
        // pills never flicker back to the old value and nothing reloads.
        queryClient.setQueryData<PageData>(QUERY_KEY, old => old && { ...old, assigned: { ...old.assigned, [kpiId]: userIds } })
        setDrafts(prev => { const c = { ...prev }; delete c[kpiId]; return c })
        ok++
      } catch {
        failed.push(kpis.find(k => k.id === kpiId)?.code ?? kpiId)
      }
    }
    setSavingDept(null)
    if (failed.length === 0) {
      setJustSaved(departmentId)
      setTimeout(() => setJustSaved(d => (d === departmentId ? null : d)), 2500)
    } else toast('error', `Saved ${ok}, failed: ${failed.join(', ')}. Your edits for the failed ones are still here, try Save again.`)
  }

  const discardDept = (departmentId: string) => {
    const ids = new Set(dirtyByDept.get(departmentId) ?? [])
    setDrafts(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))))
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

  const groups = useMemo(() => {
    const byDept = new Map<string, { departmentName: string; kpis: KPIRow[] }>()
    for (const k of filtered) {
      if (!byDept.has(k.department)) byDept.set(k.department, { departmentName: k.department_name, kpis: [] })
      byDept.get(k.department)!.kpis.push(k)
    }
    return Array.from(byDept.entries()).sort((a, b) => a[1].departmentName.localeCompare(b[1].departmentName))
  }, [filtered])

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
        <button onClick={() => refetch()} className="btn btn-ghost text-sm" disabled={isFetching} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
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

      {isPending ? (
        <div className="card p-12 text-center text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">No KPIs match your search.</div>
      ) : (
        <div className="space-y-4">
          {groups.map(([departmentId, group]) => {
            const isCollapsed = collapsed.has(departmentId)
            const deptMembers = membersByDept.get(departmentId) ?? []
            const dirtyCount = dirtyByDept.get(departmentId)?.length ?? 0
            const saving = savingDept === departmentId
            return (
              <div key={departmentId} className="card overflow-hidden">
                <div
                  className="flex items-center justify-between gap-3"
                  style={{ padding: '10px 16px', background: 'hsl(var(--surface-ground))' }}
                >
                  <button
                    onClick={() => toggleGroup(departmentId)}
                    className="flex items-center gap-2 font-semibold text-sm flex-1 text-left py-1"
                    style={{ color: 'hsl(var(--text-primary))', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    {group.departmentName}
                  </button>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {dirtyCount > 0 && !saving && (
                      <>
                        <span className="text-xs font-medium text-amber-600">{dirtyCount} unsaved</span>
                        <button onClick={() => discardDept(departmentId)} className="btn btn-ghost text-xs py-1.5 px-3">Discard</button>
                      </>
                    )}
                    {(dirtyCount > 0 || justSaved === departmentId) && (
                      <button
                        onClick={() => saveDept(departmentId)}
                        disabled={saving || dirtyCount === 0}
                        className="btn btn-primary text-xs py-1.5 px-3"
                        style={justSaved === departmentId && dirtyCount === 0 ? { backgroundColor: 'hsl(var(--status-on-track))', borderColor: 'hsl(var(--status-on-track))', color: '#fff', opacity: 1 } : undefined}
                      >
                        {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> ...</> : justSaved === departmentId && dirtyCount === 0 ? '✓ Saved' : 'Save changes'}
                      </button>
                    )}
                    <span className="text-xs text-gray-500">{group.kpis.length} KPI{group.kpis.length === 1 ? '' : 's'} · {deptMembers.length} member{deptMembers.length === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-4 space-y-3">
                    {group.kpis.map(kpi => {
                      const set = current(kpi.id)
                      const edited = !!drafts[kpi.id]
                      const allOn = deptMembers.length > 0 && deptMembers.every(m => set.has(m.id))
                      return (
                        <div key={kpi.id} className={`border rounded-xl p-4 ${edited ? 'border-indigo-300' : 'border-gray-100'}`}>
                          <div className="mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{kpi.code}</span>
                              <span className="text-sm text-gray-700">{kpi.name}</span>
                              {edited && <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Edited</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <Users className="h-3 w-3" /> {set.size} assigned
                            </p>
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