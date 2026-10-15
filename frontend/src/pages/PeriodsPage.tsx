import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import Modal from '../components/shared/Modal'
import { Plus, Lock, Unlock, Play, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

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
  const [showForm, setShowForm] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({ period_type: 'WEEKLY', period_label: '', reporting_year: new Date().getFullYear(), week_number: 1, month: 1, quarter: 1 })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState(false)

  const { data: periodsData, isLoading: loading, refetch } = useQuery({
    queryKey: ['periods', filterStatus],
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const params: Record<string, any> = { page_size: 500 }
      if (filterStatus) params.status = filterStatus
      const res = await periodsApi.list(params)
      return res.data.results as ReportingPeriod[]
    },
  })
  const periods = periodsData || []

  // === Grouping: every week sits inside the month its Monday falls in. This
  // is worked out from the dates, so it applies to periods that already exist. ===
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const monthKey = (iso: string) => iso.slice(0, 7)
  const todayKey = new Date().toLocaleDateString('en-CA').slice(0, 7)
  const monthTitle = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const shortDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const monthGroups = (() => {
    const map = new Map<string, { key: string; monthly?: ReportingPeriod; weeks: ReportingPeriod[] }>()
    const get = (iso: string) => {
      const key = monthKey(iso)
      if (!map.has(key)) map.set(key, { key, weeks: [] })
      return map.get(key)!
    }
    for (const p of periods) {
      if (p.period_type === 'MONTHLY') get(p.start_date).monthly = p
      else if (p.period_type === 'WEEKLY') get(p.start_date).weeks.push(p)
    }
    const groups = Array.from(map.values())
    groups.forEach(g => g.weeks.sort((a, b) => a.start_date.localeCompare(b.start_date)))
    return groups.sort((a, b) => b.key.localeCompare(a.key))
  })()
  const otherPeriods = periods
    .filter(p => p.period_type === 'QUARTERLY' || p.period_type === 'ANNUAL')
    .filter(p => !filterType || p.period_type === filterType)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  const showMonths = filterType === '' || filterType === 'MONTHLY'
  const showOthers = filterType === '' || filterType === 'QUARTERLY' || filterType === 'ANNUAL'

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
      refetch()
    } catch (err: any) { setMessage({ type: 'error', text: err.response?.data?.errors?.[0] || 'Failed' }) }
    finally { setSaving(false) }
  }

  const handleAction = async (period: ReportingPeriod, action: 'open' | 'lock' | 'reopen') => {
    setActionLoading(period.id)
    try {
      if (action === 'open') await periodsApi.open(period.id)
      else if (action === 'lock') await periodsApi.lock(period.id)
      else await periodsApi.reopen(period.id, 'Reopened')
      refetch()
    } catch (err: any) { setMessage({ type: 'error', text: 'Action failed' }) }
    finally { setActionLoading(null) }
  }

  const actionButton = (period: ReportingPeriod) => {
    const busy = actionLoading === period.id
    if (period.status === 'DRAFT') return <button onClick={() => handleAction(period, 'open')} disabled={busy} className="btn bg-blue-500 text-white text-xs py-1 px-3"><Play className="h-3 w-3" /> Open</button>
    if (period.status === 'OPEN' || period.status === 'SUBMITTED') return <button onClick={() => handleAction(period, 'lock')} disabled={busy} className="btn bg-red-500 text-white text-xs py-1 px-3"><Lock className="h-3 w-3" /> Lock</button>
    if (period.status === 'LOCKED' || period.status === 'APPROVED') return <button onClick={() => handleAction(period, 'reopen')} disabled={busy} className="btn bg-orange-500 text-white text-xs py-1 px-3"><Unlock className="h-3 w-3" /> Reopen</button>
    return null
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
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field border w-40"><option value="">All periods</option><option value="MONTHLY">Months &amp; weeks</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field border w-40"><option value="">All Statuses</option><option value="OPEN">Open</option><option value="LOCKED">Locked</option></select>
        <button onClick={() => refetch()} className="btn btn-ghost"><RefreshCw className="h-4 w-4" /></button>
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
            Dates: {deriveDates(form.period_type, form.reporting_year, form.week_number||form.month||form.quarter||1).start} → {deriveDates(form.period_type, form.reporting_year, form.week_number||form.month||form.quarter||1).end}
          </div>
        </div>
      </Modal>

      {loading ? <div className="card p-8 text-center text-gray-500">Loading…</div> : periods.length===0 ? <div className="card p-12 text-center text-gray-500"><p className="mb-2">No periods found.</p><button onClick={()=>setShowForm(true)} className="btn btn-primary">Create your first period</button></div> : (
        <div className="space-y-6">
          {showMonths && (
            <div className="space-y-3">
              {monthGroups.map(g => {
                const isOpen = expanded[g.key] ?? g.key === todayKey
                const m = g.monthly
                return (
                  <div key={g.key} className="card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'hsl(var(--surface-ground))' }}>
                      <button onClick={() => setExpanded(prev => ({ ...prev, [g.key]: !isOpen }))} className="flex items-center gap-2 flex-1 text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        <span className="font-semibold">{monthTitle(g.key)}</span>
                        <span className="text-xs text-gray-500">{g.weeks.length} week{g.weeks.length === 1 ? '' : 's'}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {m && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[m.status]||'bg-gray-100'}`}>{m.status_display}</span>}
                        {m && actionButton(m)}
                      </div>
                    </div>
                    {isOpen && (
                      g.weeks.length === 0
                        ? <p className="p-4 text-sm text-gray-500">No weeks in this month yet.</p>
                        : (
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {g.weeks.map((w, i) => (
                              <div key={w.id} className="border rounded-xl p-3" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
                                <div className="flex items-start justify-between mb-1">
                                  <span className="font-semibold text-sm">Week {i + 1}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColors[w.status]||'bg-gray-100'}`}>{w.status_display}</span>
                                </div>
                                <p className="text-xs text-gray-500 mb-2">{shortDate(w.start_date)} – {shortDate(w.end_date)}</p>
                                {actionButton(w)}
                              </div>
                            ))}
                          </div>
                        )
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {showOthers && otherPeriods.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Quarters &amp; years</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {otherPeriods.map(period => (
                  <div key={period.id} className="card p-4">
                    <div className="flex items-start justify-between mb-2"><span className="text-xs font-medium text-gray-500 uppercase">{period.period_type_display}</span><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColors[period.status]||'bg-gray-100'}`}>{period.status_display}</span></div>
                    <h3 className="font-semibold mb-1">{period.period_label}</h3>
                    <p className="text-xs text-gray-500 mb-3">{period.start_date} → {period.end_date}</p>
                    {actionButton(period)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}