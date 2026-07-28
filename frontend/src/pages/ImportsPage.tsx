import { useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react'

export default function ImportsPage() {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    // Simulate upload
    setTimeout(() => {
      setResult({ total: 45, imported: 42, skipped: 3, errors: ['Row 12: Invalid date format', 'Row 28: Missing KPI code', 'Row 41: Duplicate entry'] })
      setStep(3)
      setUploading(false)
    }, 2000)
  }

  const downloadTemplate = () => {
    const csv = 'KPI Code,Department,Period,Target,Actual,Notes\nOPS-W-001,Operations,Week 30,90,87.5,\nBD-W-001,Business Development,Week 30,5,4,'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'kpi_import_template.csv'
    a.click()
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">Import KPI results from CSV or Excel</p>
      </div>

      {/* Steps */}
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

      {step === 1 && (
        <div className="card p-8 text-center">
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold mb-2">Upload your file</h2>
          <p className="text-sm text-gray-500 mb-6">CSV or Excel (.xlsx) with KPI results</p>
          <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} style={{ display: 'block', margin: '0 auto 16px' }} />
          {file && <p className="text-sm text-gray-600 mb-4">Selected: {file.name}</p>}
          <div className="flex gap-3 justify-center">
            <button onClick={downloadTemplate} className="btn btn-ghost"><Download className="h-4 w-4" /> Download Template</button>
            <button onClick={() => setStep(2)} disabled={!file} className="btn btn-primary"><Upload className="h-4 w-4" /> Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card p-8 text-center">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-indigo-400" />
          <h2 className="text-lg font-semibold mb-2">{file?.name}</h2>
          <p className="text-sm text-gray-500 mb-6">Ready to import. This will create new KPI results.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setStep(1)} className="btn btn-ghost">Back</button>
            <button onClick={handleUpload} disabled={uploading} className="btn btn-primary">
              {uploading ? 'Importing...' : 'Start Import'}
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
              {result.errors.map((e: string, i: number) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={() => { setStep(1); setFile(null); setResult(null) }} className="btn btn-ghost">Import Another</button>
            <button onClick={() => window.location.href = '/dashboard'} className="btn btn-primary">Go to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  )
}
