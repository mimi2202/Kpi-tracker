import { useState, useEffect } from 'react'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import Modal from '../components/shared/Modal'
import { Plus, Lock, Unlock, Play, RefreshCw, Clock } from 'lucide-react'

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', OPEN: 'bg-blue-100 text-blue-700',
  LOCKED: 'bg-red-100 text-red-700', REOPENED: 'bg-orange-100 text-orange-700',
}

const deriveDates = (type: string, year: number, num: number) => {
  if (type === 'WEEKLY') {
    const jan4 = new Date(year, 0, 4)
    const start = new Date(jan4.setDate(jan4.getDate() - jan4.getDay() + 1 + (num - 1) * 7))
    const end = new Date(start); end.setDate(end.getDate() + 6)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  }
  if (type === 'MONTHLY') return { start: `${year}-${String(num).padStart(2,'0')}-01`, end: `${year}-${String(num).padStart(2,'0')}-${new Date(year,num,0).getDate()}` }
  if (type === 'QUARTERLY') { const m = (num-1)*3+1; return { start: `${year}-${String(m).padStart(2,'0')}-01`, end: `${year}-${String(m+2).padStart(2,'0')}-${new Date(year,m+2,0).getDate()}` } }
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({ period_type: 'WEEKLY', period_label: '', reporting_year: new Date().getFullYear(), week_number: 1, month: 1, quarter: 1 })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState(false)

  const fetchPeriods = async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page_size: 100 }
      if (filterType) params.period_type = filterType
      if (filterStatus) params.status = filterStatus
      const res = await periodsApi.list(params)
      setPeriods(res.data.results)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  useEffect(() => { fetchPeriods() }, [filterType, filterStatus])

  const validate = () => {
    const e: Record<string,string> = {}
    if (!form.period_label.trim()) e.period_label = 'Label is required'
    if (!form.reporting_year || form.reporting_year < 2020) e.reporting_year = 'Valid year required'
    setFormErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const num = form.week_number || form.month || form.quarter || 1
      const dates = deriveDates(form.period_type, form.reporting_year, num)
      await periodsApi.create({ label: form.period_label, period_type: form.period_type, reporting_year: form.reporting_year, week_number: form.week_number, month: form.month, quarter: form.quarter, start_date: dates.start, end_date: dates.end })
      setMessage({ type: 'success', text: 'Period created' })
      setShowForm(false)
      fetchPeriods()
    } catch (err: any) { setMessage({ type: 'error', text: err.response?.data?.errors?.[0] || 'Failed' }) }
    finally { setSaving(false) }
  }

  const handleAction = async (period: ReportingPeriod, action: 'open' | 'lock' | 'reopen') => {
    setActionLoading(period.id)
    try {
      if (action === 'open') await periodsApi.open(period.id)
      else if (action === 'lock') await periodsApi.lock(period.id)
      else await periodsApi.reopen(period.id, 'Reopened')
      fetchPeriods()
    } catch (err: any) { setMessage({ type: 'error', text: 'Action failed' }) }
    finally { setActionLoading(null) }
  }

  const inputS = { width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none' } as const

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Reporting Periods</h1><p className="text-sm text-gray-500 mt-0.5">{periods.length} periods</p></div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> New Period</button>
      </div>
      {message && <div className={`p-3 rounded-lg text-sm ${message.type==='success'?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{message.text}</div>}
      <div className="flex gap-3 items-center">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field border w-40"><option value="">All Types</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field border w-40"><option value="">All Statuses</option><option value="OPEN">Open</option><option value="LOCKED">Locked</option></select>
        <button onClick={fetchPeriods} className="btn btn-ghost"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Reporting Period" footer={<>
        <button onClick={() => setShowForm(false)} style={{ padding:'10px 18px',borderRadius:10,border:'none',background:'#f3f4f6',cursor:'pointer',fontSize:14 }}>Cancel</button>
        <button onClick={handleCreate} disabled={saving} style={{ padding:'10px 18px',borderRadius:10,border:'none',background:'#4f46e5',color:'white',cursor:'pointer',fontSize:14,fontWeight:500 }}>{saving?'Creating…':'Create Period'}</button>
      </>}>
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          <div>
            <label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Type <span style={{color:'#ef4444'}}>*</span></label>
            <select value={form.period_type} onChange={(e) => setForm(p=>({...p,period_type:e.target.value}))} style={inputS}>
              <option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option>
            </select>
          </div>
          <div>
            <label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Label <span style={{color:'#ef4444'}}>*</span></label>
            <input value={form.period_label} onChange={(e) => setForm(p=>({...p,period_label:e.target.value}))} placeholder="e.g. Week 1, January 2026" style={inputS} />
            {formErrors.period_label && <p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{formErrors.period_label}</p>}
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Year <span style={{color:'#ef4444'}}>*</span></label>
              <input type="number" value={form.reporting_year} onChange={(e) => setForm(p=>({...p,reporting_year:parseInt(e.target.value)}))} min={2020} max={2035} style={inputS} />
            </div>
            {form.period_type==='WEEKLY' && <div><label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Week #</label><input type="number" value={form.week_number} onChange={(e) => setForm(p=>({...p,week_number:parseInt(e.target.value)}))} min={1} max={53} style={inputS} /></div>}
            {form.period_type==='MONTHLY' && <div><label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Month</label><select value={form.month} onChange={(e) => setForm(p=>({...p,month:parseInt(e.target.value)}))} style={inputS}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>}
            {form.period_type==='QUARTERLY' && <div><label style={{ display:'block',fontSize:13,fontWeight:500,marginBottom:4 }}>Quarter</label><select value={form.quarter} onChange={(e) => setForm(p=>({...p,quarter:parseInt(e.target.value)}))} style={inputS}>{[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}</select></div>}
          </div>
          <div style={{ padding:10,backgroundColor:'#f9fafb',borderRadius:10,fontSize:13,color:'#6b7280' }}>
            Dates: {deriveDates(form.period_type, form.reporting_year, form.week_number||form.month||form.quarter||1).start} ? {deriveDates(form.period_type, form.reporting_year, form.week_number||form.month||form.quarter||1).end}
          </div>
        </div>
      </Modal>

      {loading ? <div className="card p-8 text-center text-gray-500">Loading…</div> : periods.length===0 ? <div className="card p-12 text-center text-gray-500"><p className="mb-2">No periods found.</p><button onClick={()=>setShowForm(true)} className="btn btn-primary">Create your first period</button></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {periods.map(period => (
            <div key={period.id} className="card p-5">
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" /><span className="text-xs font-medium text-gray-500 uppercase">{period.period_type_display}</span></div><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[period.status]||'bg-gray-100'}`}>{period.status_display}</span></div>
              <h3 className="font-semibold text-lg mb-1">{period.period_label}</h3>
              <p className="text-sm text-gray-500 mb-3">{period.start_date} ? {period.end_date}</p>
              <div className="flex gap-2 pt-2 border-t">
                {period.status==='DRAFT' && <button onClick={()=>handleAction(period,'open')} disabled={actionLoading===period.id} className="flex-1 btn bg-blue-500 text-white text-xs py-1.5"><Play className="h-3 w-3" /> Open</button>}
                {(period.status==='OPEN'||period.status==='SUBMITTED') && <button onClick={()=>handleAction(period,'lock')} disabled={actionLoading===period.id} className="flex-1 btn bg-red-500 text-white text-xs py-1.5"><Lock className="h-3 w-3" /> Lock</button>}
                {(period.status==='LOCKED'||period.status==='APPROVED') && <button onClick={()=>handleAction(period,'reopen')} disabled={actionLoading===period.id} className="flex-1 btn bg-orange-500 text-white text-xs py-1.5"><Unlock className="h-3 w-3" /> Reopen</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


