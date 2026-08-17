// frontend/src/pages/ImportsPage.tsx
import { useState } from 'react'
import { apiClient } from '../api/client'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Loader2 } from 'lucide-react'

interface PreviewResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
  kind: 'results' | 'tracker_results' | 'definitions' | 'unknown' | 'empty'
  preview_rows: Record<string, any>[]
  needs_attention?: string[]
  new_departments?: string[]
  new_kpis?: string[]
  new_periods?: string[]
}

function extractErrorMessage(err: any, fallback: string): string {
  // The backend's custom exception handler reshapes every DRF error into
  // { success, errors: [...], status_code }, there is no top-level "detail".
  const data = err?.response?.data
  if (data?.errors?.length) return data.errors[0]
  if (data?.detail) return data.detail
  return fallback
}

interface CommitResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
  kind: string
  needs_attention?: string[]
}

const KIND_LABEL: Record<string, string> = {
  results: 'KPI Results',
  tracker_results: 'KPI Tracker Report',
  definitions: 'KPI Definitions',
  unknown: 'Unrecognized',
  empty: 'Empty file',
}

export default function ImportsPage() {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError('') }
  }

  const runPreview = async () => {
    if (!file) return
    setPreviewing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiClient.post('/imports/preview/', formData, {
        headers: { 'Content-Type': undefined },
      })
      setPreview(res.data)
      setStep(2)
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Could not read this file. Check the format and try again.'))
    } finally {
      setPreviewing(false)
    }
  }

  const runCommit = async () => {
    if (!file) return
    setCommitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiClient.post('/imports/commit/', formData, {
        headers: { 'Content-Type': undefined },
      })
      setResult(res.data)
      setStep(3)
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Import failed.'))
    } finally {
      setCommitting(false)
    }
  }

  const reset = () => {
    setStep(1); setFile(null); setPreview(null); setResult(null); setError('')
  }

  const downloadTemplate = (kind: 'results' | 'definitions') => {
    const csv = kind === 'results'
      ? 'KPI Code,Department,Period,Target,Actual,Notes\nOPS-W-001,Operations,Week 30,90,87.5,\nBD-W-001,Business Development,Week 30,5,4,'
      : 'Code,Name,Department,Target,Unit,Direction,Frequency\nOPS-W-002,New KPI Example,Operations,100,%,HIGHER_IS_BETTER,WEEKLY'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = kind === 'results' ? 'kpi_results_template.csv' : 'kpi_definitions_template.csv'
    a.click()
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">Import KPI results or KPI definitions from CSV, Excel, or PDF</p>
      </div>

      <div className="flex items-center gap-3">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${step >= s ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {step > s ? <CheckCircle2 size={16} /> : s}
            </div>
            <span className={`text-sm ${step >= s ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
              {s === 1 ? 'Upload' : s === 2 ? 'Preview' : 'Complete'}
            </span>
            {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-indigo-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {error && <div className="p-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      {step === 1 && (
        <div className="card p-8 text-center">
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold mb-2">Upload your file</h2>
          <p className="text-sm text-gray-500 mb-6">CSV, Excel (.xlsx), or PDF with KPI results or KPI definitions</p>
          <input type="file" accept=".csv,.xlsx,.pdf" onChange={handleFileChange} style={{ display: 'block', margin: '0 auto 16px' }} />
          {file && <p className="text-sm text-gray-600 mb-4">Selected: {file.name}</p>}
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => downloadTemplate('results')} className="btn btn-ghost"><Download className="h-4 w-4" /> Results Template</button>
            <button onClick={() => downloadTemplate('definitions')} className="btn btn-ghost"><Download className="h-4 w-4" /> Definitions Template</button>
            <button onClick={runPreview} disabled={!file || previewing} className="btn btn-primary">
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {previewing ? 'Reading…' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="card p-8">
          <div className="text-center mb-6">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-indigo-400" />
            <h2 className="text-lg font-semibold mb-1">{file?.name}</h2>
            <p className="text-sm text-gray-500">
              Detected as <span className="font-medium text-gray-700">{KIND_LABEL[preview.kind] || preview.kind}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">{preview.total}</p>
              <p className="text-xs text-gray-500">Total Rows</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-2xl font-bold text-green-600">{preview.imported}</p>
              <p className="text-xs text-gray-500">Will Import</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-xl">
              <p className="text-2xl font-bold text-yellow-600">{preview.skipped}</p>
              <p className="text-xs text-gray-500">Will Skip</p>
            </div>
          </div>

          {preview.new_departments && preview.new_departments.length > 0 && (
            <div className="p-4 bg-indigo-50 rounded-xl mb-3">
              <p className="text-sm font-medium text-indigo-700 mb-2">
                This will create {preview.new_departments.length} new department{preview.new_departments.length === 1 ? '' : 's'}
              </p>
              {preview.new_departments.map((d, i) => <p key={i} className="text-xs text-indigo-600">{d}</p>)}
            </div>
          )}

          {preview.new_periods && preview.new_periods.length > 0 && (
            <div className="p-4 bg-indigo-50 rounded-xl mb-3">
              <p className="text-sm font-medium text-indigo-700 mb-2">
                This will create {preview.new_periods.length} new reporting period{preview.new_periods.length === 1 ? '' : 's'}
              </p>
              {preview.new_periods.slice(0, 8).map((p, i) => <p key={i} className="text-xs text-indigo-600">{p}</p>)}
              {preview.new_periods.length > 8 && <p className="text-xs text-indigo-500 mt-1">…and {preview.new_periods.length - 8} more</p>}
            </div>
          )}

          {preview.new_kpis && preview.new_kpis.length > 0 && (
            <div className="p-4 bg-indigo-50 rounded-xl mb-6">
              <p className="text-sm font-medium text-indigo-700 mb-2">
                This will create {preview.new_kpis.length} new KPI{preview.new_kpis.length === 1 ? '' : 's'}
              </p>
              {preview.new_kpis.slice(0, 8).map((k, i) => <p key={i} className="text-xs text-indigo-600">{k}</p>)}
              {preview.new_kpis.length > 8 && <p className="text-xs text-indigo-500 mt-1">…and {preview.new_kpis.length - 8} more</p>}
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="p-4 bg-red-50 rounded-xl mb-6">
              <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2"><AlertTriangle size={14} /> Issues found</p>
              {preview.errors.slice(0, 10).map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              {preview.errors.length > 10 && <p className="text-xs text-red-500 mt-1">…and {preview.errors.length - 10} more</p>}
            </div>
          )}

          {preview.needs_attention && preview.needs_attention.length > 0 && (
            <div className="p-4 bg-yellow-50 rounded-xl mb-6">
              <p className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-2"><AlertTriangle size={14} /> Will import, but needs manual setup after</p>
              {preview.needs_attention.slice(0, 10).map((e, i) => <p key={i} className="text-xs text-yellow-700">{e}</p>)}
              {preview.needs_attention.length > 10 && <p className="text-xs text-yellow-600 mt-1">…and {preview.needs_attention.length - 10} more</p>}
            </div>
          )}

          {(preview.kind === 'unknown' || preview.kind === 'empty') && (
            <p className="text-sm text-center text-gray-500 mb-4">
              Fix the file's column headers to match one of the templates, then upload again.
            </p>
          )}

          <div className="flex gap-3 justify-center">
            <button onClick={reset} className="btn btn-ghost">Back</button>
            <button
              onClick={runCommit}
              disabled={committing || preview.imported === 0 || preview.kind === 'unknown' || preview.kind === 'empty'}
              className="btn btn-primary"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {committing ? 'Importing…' : `Import ${preview.imported} row${preview.imported === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="card p-8">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <h2 className="text-lg font-semibold text-center mb-4">Import Complete</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">{result.total}</p>
              <p className="text-xs text-gray-500">Total Rows</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-2xl font-bold text-green-600">{result.imported}</p>
              <p className="text-xs text-gray-500">Imported</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-xl">
              <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="p-4 bg-red-50 rounded-xl">
              <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2"><AlertTriangle size={14} /> Errors</p>
              {result.errors.slice(0, 10).map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              {result.errors.length > 10 && <p className="text-xs text-red-500 mt-1">…and {result.errors.length - 10} more</p>}
            </div>
          )}

          {result.needs_attention && result.needs_attention.length > 0 && (
            <div className="p-4 bg-yellow-50 rounded-xl mt-4">
              <p className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-2"><AlertTriangle size={14} /> Needs manual setup</p>
              {result.needs_attention.slice(0, 10).map((e, i) => <p key={i} className="text-xs text-yellow-700">{e}</p>)}
              {result.needs_attention.length > 10 && <p className="text-xs text-yellow-600 mt-1">…and {result.needs_attention.length - 10} more</p>}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={reset} className="btn btn-ghost">Import Another</button>
            <button onClick={() => window.location.href = '/dashboard'} className="btn btn-primary">Go to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  )
}