// frontend/src/pages/KPIReviewPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react'

interface ResultDetail {
  id: string
  kpi_code: string
  kpi_name: string
  department_name: string
  target_value: string
  actual_value: string | null
  achievement_percentage: string | null
  rag_status: string
  submission_status: string
  responsible_person: string
  submitted_by_name: string
  submitted_date: string | null
  reviewed_by_name: string
  reviewed_date: string | null
  review_comment: string
  notes: string
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
  SUBMITTED: { label: 'Pending review', color: '#b45309', bg: '#fef3c7' },
  RETURNED: { label: 'Returned', color: '#dc2626', bg: '#fee2e2' },
  FULLY_APPROVED: { label: 'Approved', color: '#059669', bg: '#d1fae5' },
  LOCKED: { label: 'Locked', color: '#6b7280', bg: '#f3f4f6' },
}

export default function KPIReviewPage() {
  const { resultId } = useParams<{ resultId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canReview = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'

  const [result, setResult] = useState<ResultDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editableActual, setEditableActual] = useState('')
  const [comment, setComment] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!resultId) return
    apiClient.get(`/results/${resultId}/`)
      .then(res => {
        setResult(res.data)
        setEditableActual(res.data.actual_value != null ? String(res.data.actual_value) : '')
      })
      .catch(() => setError('Could not load this KPI result.'))
      .finally(() => setLoading(false))
  }, [resultId])

  const extractError = (err: any, fallback: string) => {
    const data = err?.response?.data
    if (data?.error) return data.error
    if (data?.errors?.length) return data.errors[0]
    return fallback
  }

  const handleApprove = async () => {
    if (!result) return
    setSubmitting(true)
    setError('')
    try {
      const payload: any = { comment }
      if (editableActual !== '' && editableActual !== String(result.actual_value ?? '')) {
        payload.actual_value = editableActual
      }
      const res = await apiClient.post(`/results/${result.id}/approve/`, payload)
      if (!res.data.success) throw new Error(res.data.error || 'Approve failed')
      setResult(prev => prev ? { ...prev, submission_status: 'FULLY_APPROVED', review_comment: comment } : prev)
    } catch (err: any) {
      setError(extractError(err, 'Approve failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!result) return
    if (!reason.trim()) { setError('A reason is required to return this result.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await apiClient.post(`/results/${result.id}/return_result/`, { return_reason: reason })
      if (!res.data.success) throw new Error(res.data.error || 'Return failed')
      setResult(prev => prev ? { ...prev, submission_status: 'RETURNED', review_comment: reason } : prev)
      setRejecting(false)
    } catch (err: any) {
      setError(extractError(err, 'Return failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="card p-12 text-center text-gray-500">Loading…</div>
  if (!result) return <div className="card p-8 text-center text-gray-500">{error || 'KPI result not found.'}</div>

  const status = STATUS_LABEL[result.submission_status] || STATUS_LABEL.DRAFT
  const isPending = result.submission_status === 'SUBMITTED'
  const showActions = canReview && isPending

  return (
    <div className="space-y-6 max-w-2xl">
      <button onClick={() => navigate(-1)} className="btn btn-ghost text-sm"><ArrowLeft className="h-4 w-4" /> Back</button>

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{result.kpi_code}</span>
              <span className="text-lg font-semibold">{result.kpi_name}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{result.department_name}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: status.color, backgroundColor: status.bg }}>
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500">Target</p>
            <p className="text-lg font-bold">{result.target_value}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500">Actual</p>
            <p className="text-lg font-bold">{result.actual_value ?? '—'}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500">Achievement</p>
            <p className="text-lg font-bold">{result.achievement_percentage != null ? `${result.achievement_percentage}%` : '—'}</p>
          </div>
        </div>

        {result.notes && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Submitter's notes</p>
            <p className="text-sm text-gray-700">{result.notes}</p>
          </div>
        )}

        {result.submitted_by_name && (
          <p className="text-xs text-gray-400 mb-4">
            Submitted by {result.submitted_by_name}{result.submitted_date ? ` on ${new Date(result.submitted_date).toLocaleDateString()}` : ''}
          </p>
        )}

        {result.review_comment && !isPending && (
          <div className={`p-3 rounded-xl mb-4 ${result.submission_status === 'RETURNED' ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className={`text-xs font-medium mb-1 ${result.submission_status === 'RETURNED' ? 'text-red-700' : 'text-emerald-700'}`}>
              {result.reviewed_by_name ? `${result.reviewed_by_name} — ` : ''}{result.submission_status === 'RETURNED' ? 'Reason for return' : 'Reviewer comment'}
            </p>
            <p className={`text-sm ${result.submission_status === 'RETURNED' ? 'text-red-700' : 'text-emerald-700'}`}>{result.review_comment}</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {showActions && (
          <div className="border-t pt-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Correct the actual value if needed</label>
              <input
                type="number"
                step="any"
                value={editableActual}
                onChange={e => setEditableActual(e.target.value)}
                className="input-field border w-full mt-1"
              />
            </div>

            {!rejecting ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600">Comment (optional)</label>
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="input-field border w-full mt-1"
                    placeholder="Optional note for the submitter"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleApprove} disabled={submitting} className="btn btn-primary flex-1">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                  <button onClick={() => setRejecting(true)} disabled={submitting} className="btn btn-ghost flex-1" style={{ color: '#dc2626' }}>
                    <XCircle className="h-4 w-4" /> Return
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600">Reason for returning this (required)</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="input-field border w-full mt-1"
                    rows={3}
                    placeholder="What needs to change before this can be approved?"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setRejecting(false)} className="btn btn-ghost flex-1">Cancel</button>
                  <button onClick={handleReject} disabled={submitting} className="btn btn-primary flex-1" style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Confirm Return
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}