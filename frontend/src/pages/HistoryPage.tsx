import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { resultsApi } from '../api/results'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import { departmentsApi } from '../api/departments'
import type { KPIResult, Department } from '../types'
import { Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [filterDept, setFilterDept] = useState('')
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterRAG, setFilterRAG] = useState('')
  const [sortBy, setSortBy] = useState('-created_at')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Periods and departments barely change — cache them independently so
  // switching filters doesn't ever re-fetch these dropdown option lists.
  const { data: periodsData } = useQuery({
    queryKey: ['history-periods'],
    queryFn: async () => (await periodsApi.list({ page_size: 200 })).data.results,
  })
  const periods: ReportingPeriod[] = periodsData || []

  const { data: departmentsData } = useQuery({
    queryKey: ['history-departments'],
    queryFn: async () => (await departmentsApi.list({ page_size: 100 })).data.results,
  })
  const departments: Department[] = departmentsData || []

  // `search` is deliberately NOT part of the query key — it should only be
  // applied when the user clicks Apply or presses Enter, not on every
  // keystroke, matching the original behaviour. The queryFn below still
  // reads the current `search` value via closure, so calling refetch()
  // after updating it (see handleApply/handleSearchKeyDown) picks it up
  // correctly without making `search` a reactive dependency of the query.
  const { data: resultsData, isLoading: loading, refetch } = useQuery({
    queryKey: ['history-results', page, sortBy, filterDept, filterPeriod, filterRAG],
    queryFn: async () => {
      const params: Record<string, any> = { page, page_size: 50, ordering: sortBy }
      if (search) params.search = search
      if (filterDept) params.department = filterDept
      if (filterPeriod) params.period = filterPeriod
      if (filterRAG) params.rag_status = filterRAG
      const res = await resultsApi.list(params)
      return { results: res.data.results as KPIResult[], totalPages: res.data.total_pages as number }
    },
  })
  const results = resultsData?.results ?? []
  const totalPages = resultsData?.totalPages ?? 1

  // Arriving from the top bar's global search lands here with ?q=<kpi code>.
  // `search` is already seeded from that param in useState above, so the
  // initial query fires with it automatically on mount — this effect just
  // clears the param afterward so a later manual refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('q')) {
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getRAGClass = (s: string) => s === 'ON_TRACK' ? 'on-track' : s === 'AT_RISK' ? 'at-risk' : s === 'OFF_TRACK' ? 'off-track' : 'no-data'
  const clearFilters = () => { setSearch(''); setFilterDept(''); setFilterPeriod(''); setFilterRAG(''); setPage(1); refetch() }
  const hasFilters = search || filterDept || filterPeriod || filterRAG
  const handleApply = () => { setPage(1); refetch() }
  const handleSearchKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleApply() }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History Tracker</h1>
          <p className="text-sm text-[hsl(var(--text-tertiary))] mt-0.5">{results.length} records</p>
        </div>
        <button onClick={() => refetch()} className="btn btn-ghost text-sm"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Search</label>
            <div className="flex items-center gap-2 input-field">
              <Search className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
              <input type="text" placeholder="KPI code or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm" onKeyDown={handleSearchKeyDown} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Department</label>
            <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1) }} className="input-field w-44">
              <option value="">All</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Period</label>
            <select value={filterPeriod} onChange={(e) => { setFilterPeriod(e.target.value); setPage(1) }} className="input-field w-44">
              <option value="">All</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Status</label>
            <select value={filterRAG} onChange={(e) => { setFilterRAG(e.target.value); setPage(1) }} className="input-field w-36">
              <option value="">All</option>
              <option value="ON_TRACK">On Track</option>
              <option value="AT_RISK">At Risk</option>
              <option value="OFF_TRACK">Off Track</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Sort</label>
            <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1) }} className="input-field w-40">
              <option value="-created_at">Newest</option>
              <option value="created_at">Oldest</option>
              <option value="-achievement_percentage">Highest</option>
              <option value="achievement_percentage">Lowest</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleApply} className="btn btn-primary text-sm py-2">Apply</button>
            {hasFilters && <button onClick={clearFilters} className="btn btn-ghost text-sm">Clear</button>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center"><div className="animate-shimmer h-4 w-32 rounded mx-auto" /></div>
      ) : results.length === 0 ? (
        <div className="card p-12 text-center"><p className="text-[hsl(var(--text-tertiary))]">No results found.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th className="w-8"></th><th>Period</th><th>KPI</th><th>Dept</th><th>Target</th><th>Actual</th><th>Achieve</th><th>Status</th><th>Trend</th></tr></thead>
              <tbody>
                {results.map(r => (
                  <React.Fragment key={r.id}>
                    <tr onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)} className="cursor-pointer">
                      <td>{expandedRow === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="text-sm font-medium">{r.period_label}</td>
                      <td><span className="text-sm font-semibold">{r.kpi_code}</span></td>
                      <td className="text-sm text-[hsl(var(--text-secondary))]">{r.department_name}</td>
                      <td className="text-sm font-mono">{r.target_snapshot}</td>
                      <td className="text-sm font-mono font-medium">{r.actual_value != null ? r.actual_value : '—'}</td>
                      <td className="text-sm font-semibold">{r.achievement_percentage != null ? `${r.achievement_percentage}%` : '—'}</td>
                      <td><span className={`status-pill ${getRAGClass(r.rag_status)}`}>{r.rag_display || r.rag_status}</span></td>
                      <td><span className={`trend-indicator ${r.trend_status === 'IMPROVING' ? 'trend-up' : r.trend_status === 'DECLINING' ? 'trend-down' : 'trend-stable'}`}>{r.trend_status === 'IMPROVING' ? '↑' : r.trend_status === 'DECLINING' ? '↓' : '→'}</span></td>
                    </tr>
                    {expandedRow === r.id && (
                      <tr key={`${r.id}-exp`}><td colSpan={9} className="bg-[hsl(var(--surface-ground))] p-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div><p className="text-[10px] font-semibold uppercase text-[hsl(var(--text-tertiary))] mb-1">Responsible</p><p>{r.responsible_name || '—'}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-[hsl(var(--text-tertiary))] mb-1">Notes</p><p className="text-[hsl(var(--text-secondary))]">{r.notes || '—'}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-[hsl(var(--text-tertiary))] mb-1">Action</p><p className="text-[hsl(var(--text-secondary))]">{r.corrective_action || '—'}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-[hsl(var(--text-tertiary))] mb-1">Updated</p><p>{new Date(r.updated_at).toLocaleDateString()}</p></div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-[hsl(var(--border-subtle))]">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost text-sm disabled:opacity-30">Previous</button>
              <span className="text-sm text-[hsl(var(--text-tertiary))]">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost text-sm disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}