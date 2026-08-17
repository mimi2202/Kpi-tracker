// frontend/src/pages/ReportsPage.tsx
import { useState } from 'react'
import { apiClient } from '../api/client'
import { FileText, FileSpreadsheet, FileType, Download, Loader2, CheckCircle2 } from 'lucide-react'

const PERIODS = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
]

const FORMATS = [
  { value: 'excel', label: 'Excel', ext: 'xlsx', icon: FileSpreadsheet, desc: 'Data table, department summary, and a status breakdown chart' },
  { value: 'pdf', label: 'PDF', ext: 'pdf', icon: FileType, desc: 'Print-ready report with summary and charts' },
  { value: 'csv', label: 'CSV', ext: 'csv', icon: FileText, desc: 'Raw data only, no charts or summary' },
]

const INCLUDES = [
  'KPI results for the selected period',
  'Department-level performance summary',
  'RAG status breakdown',
]

export default function ReportsPage() {
  const [periodType, setPeriodType] = useState('MONTHLY')
  const [format, setFormat] = useState('excel')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const selectedFormat = FORMATS.find(f => f.value === format)!

  const handleExport = async () => {
    setDownloading(true)
    setError('')
    setDone(false)
    try {
      const res = await apiClient.get(`/export/${periodType}/${format}/`, { responseType: 'blob' })
      const blob = new Blob([res.data])
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `kpi_report_${periodType.toLowerCase()}.${selectedFormat.ext}`
      a.click()
      URL.revokeObjectURL(a.href)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Export failed. Check that the backend is reachable.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Export performance data as Excel, PDF, or CSV</p>
      </div>

      <div className="card p-6 max-w-2xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <p style={sectionTitleStyle}>Period</p>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              style={inputStyle}
            >
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
            <p style={sectionTitleStyle}>Format</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {FORMATS.map(f => {
                const Icon = f.icon
                const active = format === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 12px',
                      borderRadius: 10,
                      border: active ? '1.5px solid #6366f1' : '1px solid hsl(var(--border-subtle))',
                      backgroundColor: active ? 'hsl(var(--accent-light))' : 'hsl(var(--surface-card))',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon className="h-5 w-5" style={{ color: active ? '#6366f1' : 'hsl(var(--text-tertiary))', marginBottom: 8 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--text-primary))', margin: 0 }}>{f.label}</p>
                    <p style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))', marginTop: 4, lineHeight: 1.4 }}>{f.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedFormat.value !== 'csv' && (
            <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: 20 }}>
              <p style={sectionTitleStyle}>This report includes</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {INCLUDES.map(item => (
                  <li key={item} style={{ fontSize: 13, color: 'hsl(var(--text-secondary))' }}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
          )}

          <button onClick={handleExport} disabled={downloading} className="btn btn-primary w-full">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Exporting…' : done ? 'Downloaded' : `Export ${selectedFormat.label}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid hsl(var(--border-subtle))',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  backgroundColor: 'hsl(var(--surface-card))',
  color: 'hsl(var(--text-primary))',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'hsl(var(--text-tertiary))',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 12,
}