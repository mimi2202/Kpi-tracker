// frontend/src/components/dashboard/KPIDetailTable.tsx
import { useState, useMemo } from 'react'
import type { KPIResult } from '../../types'
import RAGBadge from '../shared/RAGBadge'
import TrendIcon from '../shared/TrendIcon'

interface KPIDetailTableProps {
  kpis: KPIResult[]
  selectedDepartmentId: string | null
}

export default function KPIDetailTable({ kpis, selectedDepartmentId }: KPIDetailTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const filteredKPIs = useMemo(() => {
    return kpis.filter(kpi => {
      const matchesSearch = search === '' || 
        kpi.kpi_name.toLowerCase().includes(search.toLowerCase()) ||
        kpi.kpi_code.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || kpi.rag_status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [kpis, search, statusFilter])

  // Group by department
  const groupedKPIs = useMemo(() => {
    const groups: Record<string, KPIResult[]> = {}
    filteredKPIs.forEach(kpi => {
      const dept = kpi.department_name || 'Unknown'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(kpi)
    })
    return groups
  }, [filteredKPIs])

  if (kpis.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">No KPI results for this period. Enter data first.</p>
      </div>
    )
  }

  return (
    <div className="card">
      {/* Filters */}
      <div className="flex items-center gap-4 p-4 border-b">
        <input
          type="text"
          placeholder="Search KPIs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="ALL">All Statuses</option>
          <option value="ON_TRACK">On Track</option>
          <option value="AT_RISK">At Risk</option>
          <option value="OFF_TRACK">Off Track</option>
          <option value="NO_DATA">No Data</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>KPI / Quality Objective</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Achievement</th>
              <th>Variance</th>
              <th>Status</th>
              <th>Trend</th>
              <th>Responsible</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedKPIs).map(([deptName, deptKPIs]) => (
              <>
                {/* Department header row */}
                <tr key={deptName} className="bg-gray-50">
                  <td colSpan={9} className="font-medium text-sm text-gray-700 py-2">
                    {deptName} ({deptKPIs.length} KPIs)
                  </td>
                </tr>
                {deptKPIs.map((kpi) => (
                  <>
                    <tr
                      key={kpi.id}
                      onClick={() => setExpandedRow(expandedRow === kpi.id ? null : kpi.id)}
                      className="cursor-pointer"
                    >
                      <td className="font-medium text-gray-900">
                        <div>{kpi.kpi_code}</div>
                        <div className="text-xs text-gray-500">{kpi.kpi_name}</div>
                      </td>
                      <td>{kpi.target_snapshot}</td>
                      <td>{kpi.actual_value != null ? kpi.actual_value : '—'}</td>
                      <td>
                        {kpi.achievement_percentage != null
                          ? `${kpi.achievement_percentage}%`
                          : '—'}
                      </td>
                      <td>{kpi.variance_display || '—'}</td>
                      <td><RAGBadge status={kpi.rag_status} /></td>
                      <td><TrendIcon status={kpi.trend_status} /></td>
                      <td className="text-sm">{kpi.responsible_name || '—'}</td>
                      <td className="text-sm text-gray-500 max-w-[200px] truncate">
                        {kpi.notes || kpi.corrective_action || '—'}
                      </td>
                    </tr>
                    {/* Expanded row */}
                    {expandedRow === kpi.id && (
                      <tr key={`${kpi.id}-expanded`}>
                        <td colSpan={9} className="bg-gray-50 p-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="font-medium mb-1">Full Notes</p>
                              <p className="text-gray-600">{kpi.notes || 'No notes'}</p>
                            </div>
                            <div>
                              <p className="font-medium mb-1">Corrective Action</p>
                              <p className="text-gray-600">{kpi.corrective_action || 'None'}</p>
                            </div>
                            <div>
                              <p className="font-medium mb-1">Submission Status</p>
                              <p className="text-gray-600">{kpi.submission_status}</p>
                            </div>
                            <div>
                              <p className="font-medium mb-1">Last Updated</p>
                              <p className="text-gray-600">
                                {new Date(kpi.updated_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}