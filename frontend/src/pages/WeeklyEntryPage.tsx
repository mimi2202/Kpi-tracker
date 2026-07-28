// frontend/src/pages/WeeklyEntryPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { resultsApi } from '../api/results'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import type { KPIResult } from '../types'
import { Save, Send, RefreshCw } from 'lucide-react'

export default function WeeklyEntryPage({ periodType = "WEEKLY" }: { periodType?: string }) {
  const user = useAuthStore((s) => s.user)
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [results, setResults] = useState<KPIResult[]>([])
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    periodsApi.list({ period_type: periodType, page_size: 20 })
      .then(res => {
        setPeriods(res.data.results)
        if (res.data.results.length > 0) setSelectedPeriodId(res.data.results[0].id)
      })
      .catch(console.error)
  }, [periodType])

  const fetchResults = useCallback(async () => {
    if (!selectedPeriodId || !user?.id) return
    setLoading(true)
    try {
      // Ensure this user's assigned rows exist for the selected period FIRST.
      // Idempotent: creates any missing rows, so every period (past or future)
      // self-populates on open — no manual backfill, works for any frequency.
      await resultsApi.syncMyResults({ period_id: selectedPeriodId }).catch(() => {})

      // Then load only THIS user's rows for the period.
      const res = await resultsApi.list({
        reporting_period: selectedPeriodId,
        responsible_person: user.id,
        page_size: 200,
      })
      setResults(res.data.results)
      const vals: Record<string, string> = {}
      const notes: Record<string, string> = {}
      res.data.results.forEach((r: KPIResult) => {
        if (r.actual_value != null) vals[r.id] = String(r.actual_value)
        notes[r.id] = r.notes || ''
      })
      setEditValues(vals)
      setEditNotes(notes)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Failed to load results' })
    } finally {
      setLoading(false)
    }
  }, [selectedPeriodId, user?.id])

  useEffect(() => { fetchResults() }, [fetchResults])

  const handleSave = async (resultId: string) => {
    setSaving(resultId)
    setMessage(null)
    try {
      const val = editValues[resultId]
      await resultsApi.update(resultId, {
        actual_value: val !== '' && val !== undefined ? Number(val) : null,
        notes: editNotes[resultId] || '',
      })
      setMessage({ type: 'success', text: 'Saved' })
      fetchResults()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.errors?.[0] || err.response?.data?.detail || 'Save failed' })
    } finally {
      setSaving(null)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleSubmitAll = async () => {
    if (!selectedPeriodId) return
    setSaving('all')
    try {
      await resultsApi.bulkSubmit({ period_id: selectedPeriodId })
      setMessage({ type: 'success', text: 'Your results submitted for review' })
      fetchResults()
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Submission failed' })
    } finally {
      setSaving(null)
    }
  }

  const period = periods.find(p => p.id === selectedPeriodId)
  const submitted = results.filter(r => r.actual_value != null).length
  const onTrack = results.filter(r => r.rag_status === 'ON_TRACK').length
  const atRisk = results.filter(r => r.rag_status === 'AT_RISK').length
  const offTrack = results.filter(r => r.rag_status === 'OFF_TRACK').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{periodType.charAt(0) + periodType.slice(1).toLowerCase()} KPI Entry</h1>
          <p className="text-sm text-gray-500 mt-1">{period?.period_label || 'Select period'}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Select period...</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
          </select>
          <button onClick={fetchResults} className="btn btn-ghost" disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Period Stats */}
      {period && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total KPIs', value: results.length },
            { label: 'Submitted', value: submitted },
            { label: 'Missing', value: results.length - submitted },
            { label: 'On Track', value: onTrack, color: 'text-green-600' },
            { label: 'At Risk', value: atRisk, color: 'text-yellow-600' },
            { label: 'Off Track', value: offTrack, color: 'text-red-600' },
            { label: 'Progress', value: results.length > 0 ? `${Math.round((submitted / results.length) * 100)}%` : '0%' },
          ].map(stat => (
            <div key={stat.label} className="card p-3 text-center">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color || 'text-gray-900'}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Entry Table */}
      {loading ? (
        <div className="card p-8 text-center text-gray-500">Loading...</div>
      ) : results.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <p className="mb-2">No {periodType.toLowerCase()} KPIs assigned to you.</p>
          <p className="text-sm">Ask an admin or team leader to assign you KPIs that report on this frequency.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>KPI</th>
                  <th>Target</th>
                  <th>Actual</th>
                  <th>Achievement</th>
                  <th>Status</th>
                  <th>Trend</th>
                  <th>Notes</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {results.map(result => (
                  <tr key={result.id} className={result.actual_value == null ? 'bg-yellow-50/30' : ''}>
                    <td className="text-sm text-gray-600">{result.department_name}</td>
                    <td>
                      <div className="text-sm font-medium">{result.kpi_code}</div>
                      <div className="text-xs text-gray-500 max-w-[180px] truncate">{result.kpi_name}</div>
                    </td>
                    <td className="text-sm font-mono">{(result.target_value_display ?? result.target_value)}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={editValues[result.id] ?? ''}
                        onChange={(e) => setEditValues(prev => ({ ...prev, [result.id]: e.target.value }))}
                        className="input-field border w-24 text-center"
                        placeholder="—"
                      />
                    </td>
                    <td className="text-sm font-medium">
                      {result.achievement_percentage != null ? `${result.achievement_percentage}%` : '—'}
                    </td>
                    <td>
                      <span className={`status-pill ${
                        result.rag_status === 'ON_TRACK' ? 'on-track' :
                        result.rag_status === 'AT_RISK' ? 'at-risk' :
                        result.rag_status === 'OFF_TRACK' ? 'off-track' : 'no-data'
                      }`}>
                        {result.rag_display}
                      </span>
                    </td>
                    <td>
                      <span className={`trend-indicator ${
                        result.trend_status === 'IMPROVING' ? 'trend-up' :
                        result.trend_status === 'DECLINING' ? 'trend-down' : 'trend-stable'
                      }`}>
                        {result.trend_icon || '—'}
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={editNotes[result.id] ?? ''}
                        onChange={(e) => setEditNotes(prev => ({ ...prev, [result.id]: e.target.value }))}
                        className="input-field border w-32 text-sm"
                        placeholder="Note..."
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => handleSave(result.id)}
                        disabled={saving === result.id}
                        className="btn btn-primary text-xs py-1.5 px-3"
                      >
                        {saving === result.id ? '...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 border-t bg-gray-50">
            <p className="text-sm text-gray-500">{submitted} of {results.length} KPIs completed</p>
            <button
              onClick={handleSubmitAll}
              disabled={saving === 'all' || submitted === 0}
              className="btn btn-primary"
            >
              <Send className="h-4 w-4" />
              {saving === 'all' ? 'Submitting...' : 'Submit All for Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}