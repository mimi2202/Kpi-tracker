// frontend/src/pages/ScorecardPage.tsx
import { useState, useEffect } from 'react'
import { dashboardApi } from '../api/dashboard'
import { periodsApi } from '../api/periods'
import type { DepartmentScore } from '../api/dashboard'
import type { ReportingPeriod } from '../api/periods'
import { Search } from 'lucide-react'

export default function ScorecardPage() {
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [periodType, setPeriodType] = useState('MONTHLY')
  const [scores, setScores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    periodsApi.list({ period_type: periodType, page_size: 50 })
      .then(res => {
        setPeriods(res.data.results)
        if (res.data.results.length > 0) setSelectedPeriodId(res.data.results[0].id)
      })
      .catch(console.error)
  }, [periodType])

  useEffect(() => {
    if (!selectedPeriodId) return
    setLoading(true)
    dashboardApi.getScorecard({ period_id: selectedPeriodId, period_type: periodType })
      .then(res => setScores(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedPeriodId, periodType])

  const getScoreColor = (score: number | null) => {
    if (score == null) return 'text-gray-400'
    if (score >= 95) return 'text-green-600'
    if (score >= 85) return 'text-blue-600'
    if (score >= 75) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBg = (score: number | null) => {
    if (score == null) return 'bg-gray-100'
    if (score >= 95) return 'bg-green-50'
    if (score >= 85) return 'bg-blue-50'
    if (score >= 75) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  const getRAGClass = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return 'on-track'
      case 'AT_RISK': return 'at-risk'
      case 'OFF_TRACK': return 'off-track'
      default: return 'no-data'
    }
  }

  const getRAGLabel = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return 'On Track'
      case 'AT_RISK': return 'At Risk'
      case 'OFF_TRACK': return 'Off Track'
      default: return 'No Data'
    }
  }

  const periodTypes = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const
  const filteredScores = scores.filter((s: any) =>
    s.department_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.department?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const overallAvg = filteredScores.length > 0
    ? Math.round(filteredScores.reduce((sum: number, s: any) => sum + (s.average_achievement || s.composite_score || 0), 0) / filteredScores.length)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Scorecard</h1>
          <p className="text-sm text-gray-500 mt-1">Consolidated performance across frequencies</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="tab-bar">
          {periodTypes.map(pt => (
            <button
              key={pt}
              onClick={() => { setPeriodType(pt); setSelectedPeriodId('') }}
              className={`tab-item ${periodType === pt ? 'active' : ''}`}
            >
              {pt.charAt(0) + pt.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <select
          value={selectedPeriodId}
          onChange={(e) => setSelectedPeriodId(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          {periods.length === 0 && <option value="">No periods</option>}
          {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
        </select>
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filter departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field border flex-1"
          />
        </div>
      </div>

      {/* Overall Average */}
      {overallAvg != null && (
        <div className={`card p-6 text-center ${getScoreBg(overallAvg)}`}>
          <p className="text-sm text-gray-500 mb-1">Overall Average Achievement</p>
          <p className={`text-4xl font-bold ${getScoreColor(overallAvg)}`}>{overallAvg}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {filteredScores.filter((s: any) => s.rag_status === 'ON_TRACK').length} on track · 
            {filteredScores.filter((s: any) => s.rag_status === 'AT_RISK').length} at risk · 
            {filteredScores.filter((s: any) => s.rag_status === 'OFF_TRACK').length} off track
          </p>
        </div>
      )}

      {/* Scorecard Table */}
      {loading ? (
        <div className="card p-8 text-center text-gray-500">Loading scorecard...</div>
      ) : filteredScores.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">No scorecard data available. Enter KPI results first.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Weekly</th>
                  <th>Monthly</th>
                  <th>Quarterly</th>
                  <th>Annual</th>
                  <th>Composite Score</th>
                  <th>Status</th>
                  <th>On Track</th>
                  <th>At Risk</th>
                  <th>Off Track</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {filteredScores.map((score: any, i: number) => {
                  const deptName = score.department_name || score.department?.name || 'Unknown'
                  const deptColor = score.department_colour || score.department?.colour || '#6B7280'
                  const compScore = score.composite_score ?? score.average_achievement
                  return (
                    <tr key={score.id || i}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: deptColor }} />
                          <span className="font-medium text-sm">{deptName}</span>
                        </div>
                      </td>
                      <td className="text-sm text-center">
                        {score.weekly_achievement != null ? (
                          <span className={`font-medium ${getScoreColor(score.weekly_achievement)}`}>{score.weekly_achievement}%</span>
                        ) : <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="text-sm text-center">
                        {score.monthly_achievement != null ? (
                          <span className={`font-medium ${getScoreColor(score.monthly_achievement)}`}>{score.monthly_achievement}%</span>
                        ) : <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="text-sm text-center">
                        {score.quarterly_achievement != null ? (
                          <span className={`font-medium ${getScoreColor(score.quarterly_achievement)}`}>{score.quarterly_achievement}%</span>
                        ) : <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="text-sm text-center">
                        {score.annual_achievement != null ? (
                          <span className={`font-medium ${getScoreColor(score.annual_achievement)}`}>{score.annual_achievement}%</span>
                        ) : <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="text-center">
                        {compScore != null ? (
                          <span className={`inline-flex items-center justify-center w-14 py-1 rounded-lg text-sm font-bold ${getScoreColor(compScore)} ${getScoreBg(compScore)}`}>
                            {compScore}%
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td>
                        <span className={`status-pill ${getRAGClass(score.rag_status)}`}>
                          {getRAGLabel(score.rag_status)}
                        </span>
                      </td>
                      <td className="text-sm text-center text-green-600 font-medium">{score.on_track_count ?? '—'}</td>
                      <td className="text-sm text-center text-yellow-600 font-medium">{score.at_risk_count ?? '—'}</td>
                      <td className="text-sm text-center text-red-600 font-medium">{score.off_track_count ?? '—'}</td>
                      <td className="text-sm text-center">
                        {score.trend === 'improving' || score.trend === 'IMPROVING' ? '↑' :
                         score.trend === 'declining' || score.trend === 'DECLINING' ? '↓' :
                         score.trend === 'stable' || score.trend === 'STABLE' ? '→' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}