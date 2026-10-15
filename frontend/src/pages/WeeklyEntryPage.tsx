// frontend/src/pages/WeeklyEntryPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { resultsApi } from '../api/results'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import type { KPIResult } from '../types'
import { Save, Send, RefreshCw } from 'lucide-react'

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  SUBMITTED: { label: 'Pending review', color: '#b45309', bg: '#fef3c7' },
  RETURNED: { label: 'Returned', color: '#dc2626', bg: '#fee2e2' },
  FULLY_APPROVED: { label: 'Approved', color: '#059669', bg: '#d1fae5' },
  LOCKED: { label: 'Locked', color: '#6b7280', bg: '#f3f4f6' },
}

export default function WeeklyEntryPage({ periodType = "WEEKLY" }: { periodType?: string }) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [results, setResults] = useState<KPIResult[]>([])
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  // Rows the user has changed but not saved yet. One Save button saves them all.
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const dirtyRef = useRef(dirtyIds)
  dirtyRef.current = dirtyIds
  const [saving, setSaving] = useState<string | null>(null)
  // Which button just succeeded (a result id, or 'all'); the button reads
  // "Saved" / "Submitted" for a couple of seconds instead of showing a banner.
  const [done, setDone] = useState<string | null>(null)
  const flashDone = (key: string) => { setDone(key); setTimeout(() => setDone(d => (d === key ? null : d)), 2500) }
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    periodsApi.list({ period_type: periodType, page_size: 20 })
      .then(res => {
        setPeriods(res.data.results)
        if (res.data.results.length > 0) setSelectedPeriodId(res.data.results[0].id)
      })
      .catch(console.error)
  }, [periodType])

  // silent = background refresh (after Save/Submit, or the periodic refresh):
  // no loading screen, no assignment sync, and the values you are typing in
  // other rows are left alone. Only the first load / manual refresh is full.
  const fetchResults = useCallback(async (silent = false) => {
    if (!selectedPeriodId || !user?.id) return
    if (!silent) setLoading(true)
    try {
      // Ensure this user's assigned rows exist for the selected period FIRST.
      // Idempotent: creates any missing rows, so every period (past or future)
      // self-populates on open — no manual backfill, works for any frequency.
      if (!silent) await resultsApi.syncMyResults({ period_id: selectedPeriodId }).catch(() => {})

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
      if (silent) {
        // Background refresh: update rows you have not touched (so a teammate's
        // or reviewer's change shows up) and leave your unsaved edits alone.
        const keep = dirtyRef.current
        setEditValues(prev => { const n = { ...prev }; for (const id of Object.keys(vals)) if (!keep.has(id)) n[id] = vals[id]; return n })
        setEditNotes(prev => { const n = { ...prev }; for (const id of Object.keys(notes)) if (!keep.has(id)) n[id] = notes[id]; return n })
      } else {
        setEditValues(vals)
        setEditNotes(notes)
        setDirtyIds(new Set())
      }
    } catch (err) {
      console.error(err)
      if (!silent) setMessage({ type: 'error', text: 'Failed to load results' })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [selectedPeriodId, user?.id])

  useEffect(() => { fetchResults() }, [fetchResults])

  // Live-ish updates without websockets: quietly refresh once a minute and
  // whenever the tab becomes visible again.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') fetchResults(true) }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [fetchResults])

  // Only a genuinely final LOCKED status (period closed) should stop editing.
  // Submitted/Approved/Returned results can still be edited — doing so reverts
  // the result to DRAFT and clears any prior review decision (backend-enforced).
  const isLocked = (status?: string) => status === 'LOCKED'
  const wasUnderReview = (status?: string) => status === 'SUBMITTED' || status === 'FULLY_APPROVED' || status === 'RETURNED'

  const rowDiffers = (id: string, v: string | undefined, n: string | undefined) => {
    const r = results.find(x => x.id === id)
    if (!r) return true
    const serverVal = r.actual_value != null ? Number(r.actual_value) : null
    const newVal = v === undefined || v === '' ? null : Number(v)
    return !(serverVal === newVal && (r.notes || '') === (n || ''))
  }
  const markDirty = (id: string, differs: boolean) =>
    setDirtyIds(prev => {
      if (prev.has(id) === differs) return prev
      const next = new Set(prev); differs ? next.add(id) : next.delete(id); return next
    })
  const editValue = (id: string, v: string) => {
    setEditValues(prev => ({ ...prev, [id]: v }))
    markDirty(id, rowDiffers(id, v, editNotes[id]))
  }
  const editNote = (id: string, n: string) => {
    setEditNotes(prev => ({ ...prev, [id]: n }))
    markDirty(id, rowDiffers(id, editValues[id], n))
  }

  // One click saves every changed row, like the Assignments page.
  const handleSaveAll = async () => {
    const ids = Array.from(dirtyIds)
    if (ids.length === 0) return
    setSaving('save')
    setMessage(null)
    const failed: string[] = []
    for (const id of ids) {
      const val = editValues[id]
      try {
        await resultsApi.update(id, {
          actual_value: val !== '' && val !== undefined ? Number(val) : null,
          notes: editNotes[id] || '',
        })
        markDirty(id, false)
      } catch {
        failed.push(results.find(r => r.id === id)?.kpi_code ?? id)
      }
    }
    setSaving(null)
    if (failed.length === 0) flashDone('save')
    else {
      setMessage({ type: 'error', text: `Could not save: ${failed.join(', ')}. Your edits are still here, try Save again.` })
      setTimeout(() => setMessage(null), 6000)
    }
    fetchResults(true)
  }

  const handleDiscard = () => {
    const vals: Record<string, string> = {}
    const notes: Record<string, string> = {}
    results.forEach(r => { if (r.actual_value != null) vals[r.id] = String(r.actual_value); notes[r.id] = r.notes || '' })
    setEditValues(vals)
    setEditNotes(notes)
    setDirtyIds(new Set())
  }

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (dirtyIds.size === 0) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirtyIds.size])

  const handleSubmitAll = async () => {
    if (!selectedPeriodId) return
    setSaving('all')
    try {
      await resultsApi.bulkSubmit({ period_id: selectedPeriodId })
      flashDone('all')
      fetchResults(true)
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
  // Only DRAFT/RETURNED rows are actually eligible to submit — matches what the backend accepts.
  const eligibleToSubmit = results.filter(r => !r.is_rollup && r.actual_value != null && !isLocked(r.submission_status) && r.submission_status !== 'SUBMITTED' && r.submission_status !== 'FULLY_APPROVED').length

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
          <button onClick={() => fetchResults()} className="btn btn-ghost" disabled={loading}>
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
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {results.map(result => {
                  const isRollup = !!result.is_rollup
                  const locked = isLocked(result.submission_status) || isRollup
                  const badge = result.submission_status ? STATUS_BADGE[result.submission_status] : undefined
                  return (
                    <tr key={result.id} className={result.actual_value == null ? 'bg-yellow-50/30' : ''} style={dirtyIds.has(result.id) ? { backgroundColor: 'rgba(99,102,241,0.08)' } : undefined}>
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
                          onChange={(e) => editValue(result.id, e.target.value)}
                          className="input-field border w-24 text-center"
                          placeholder="—"
                          disabled={locked}
                          title={isRollup ? 'Automatic total of the weekly/monthly results below' : wasUnderReview(result.submission_status) ? 'Editing will revert this KPI to Draft and require resubmission' : undefined}
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
                          onChange={(e) => editNote(result.id, e.target.value)}
                          className="input-field border w-32 text-sm"
                          placeholder="Note..."
                          disabled={locked}
                        />
                      </td>
                      <td>
                        {isRollup ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, color: '#475569', backgroundColor: '#e2e8f0' }}>
                            Auto total
                          </span>
                        ) : badge ? (
                          <button
                            onClick={() => navigate(`/kpi-review/${result.id}`)}
                            style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, color: badge.color, backgroundColor: badge.bg, border: 'none', cursor: 'pointer' }}
                            title={result.review_comment || undefined}
                          >
                            {badge.label}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              {submitted} of {results.length} KPIs completed
              {dirtyIds.size > 0 && <span className="ml-3 font-medium text-amber-600">{dirtyIds.size} unsaved</span>}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {dirtyIds.size > 0 && saving !== 'save' && (
                <button onClick={handleDiscard} className="btn btn-ghost text-sm">Discard</button>
              )}
              {(dirtyIds.size > 0 || done === 'save') && (
                <button
                  onClick={handleSaveAll}
                  disabled={saving === 'save' || dirtyIds.size === 0}
                  className="btn btn-primary"
                  style={done === 'save' ? { backgroundColor: 'hsl(var(--status-on-track))', borderColor: 'hsl(var(--status-on-track))', color: '#fff', opacity: 1 } : undefined}
                >
                  <Save className="h-4 w-4" />
                  {saving === 'save' ? '...' : done === 'save' ? '✓ Saved' : `Save changes (${dirtyIds.size})`}
                </button>
              )}
              <button
                onClick={handleSubmitAll}
                disabled={saving === 'all' || eligibleToSubmit === 0 || dirtyIds.size > 0}
                title={dirtyIds.size > 0 ? 'Save your changes first' : undefined}
                className="btn btn-primary"
                style={done === 'all' ? { backgroundColor: 'hsl(var(--status-on-track))', borderColor: 'hsl(var(--status-on-track))', color: '#fff', opacity: 1 } : undefined}
              >
                <Send className="h-4 w-4" />
                {saving === 'all' ? 'Submitting...' : done === 'all' ? '✓ Submitted' : 'Submit All for Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}