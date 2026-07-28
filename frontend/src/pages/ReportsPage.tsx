import { useState } from 'react'
import { FileText, Download, FileSpreadsheet } from 'lucide-react'

export default function ReportsPage() {
  const [periodType, setPeriodType] = useState('MONTHLY')
  const [format, setFormat] = useState('excel')
  const [downloading, setDownloading] = useState(false)

  const handleExport = () => {
    setDownloading(true)
    const stored = JSON.parse(localStorage.getItem('ips-auth') || '{}')
    const token = stored?.state?.token || ''
    const url = `http://localhost:8000/api/v1/export/${periodType}/${format}/`
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `kpi_report_${periodType}.${format === 'excel' ? 'xlsx' : 'csv'}`
        a.click()
      })
      .catch(console.error)
      .finally(() => setDownloading(false))
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Export performance data</p>
      </div>

      <div className="card p-6 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Period Type</label>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '8px 12px', fontSize: '14px', outline: 'none' }}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <div className="flex gap-3">
              <button onClick={() => setFormat('csv')} className={`btn flex-1 ${format === 'csv' ? 'btn-primary' : 'btn-ghost'}`}>
                <FileText className="h-4 w-4" /> CSV
              </button>
              <button onClick={() => setFormat('excel')} className={`btn flex-1 ${format === 'excel' ? 'btn-primary' : 'btn-ghost'}`}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
            </div>
          </div>
          <button onClick={handleExport} disabled={downloading} className="btn btn-primary w-full">
            <Download className="h-4 w-4" /> {downloading ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}


