import { useState, useEffect, useMemo } from 'react'
import { dashboardApi, type TrendDataPoint } from '../api/dashboard'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import { departmentsApi } from '../api/departments'
import type { Department } from '../types'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts'

type PeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

export default function TrendsPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('WEEKLY')
  const [trends, setTrends] = useState<TrendDataPoint[]>([])
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  useEffect(() => {
    Promise.all([
      periodsApi.list({ period_type: periodType, page_size: 50 }),
      departmentsApi.list({ page_size: 100 }),
    ]).then(([pRes, dRes]) => {
      setPeriods(pRes.data.results)
      setDepartments(dRes.data.results)
      if (pRes.data.results.length > 0) setSelectedPeriodId(pRes.data.results[0].id)
    }).catch(console.error)
  }, [periodType])

  useEffect(() => {
    if (!selectedPeriodId) return
    setLoading(true)
    dashboardApi.getTrends({ period_type: periodType })
      .then(res => setTrends(Array.isArray(res.data) ? res.data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [periodType, selectedPeriodId])

  const chartData = useMemo(() => {
    if (!trends.length) return []
    const labels = [...new Set(trends.map(t => t.period_label))]
    const deptNames = [...new Set(trends.map(t => t.department_name))]
    return labels.map(label => {
      const row: any = { period: label }
      deptNames.forEach(name => {
        const point = trends.find(t => t.period_label === label && t.department_name === name)
        row[name] = point?.achievement ?? null
      })
      return row
    })
  }, [trends])

  const deptNames = useMemo(() => [...new Set(trends.map(t => t.department_name))], [trends])
  const deptColors: Record<string, string> = {}
  trends.forEach(t => { if (!deptColors[t.department_name]) deptColors[t.department_name] = t.department_colour || '#6B7280' })

  const filteredDeptNames = selectedDepts.length > 0 ? deptNames.filter(d => selectedDepts.includes(d)) : deptNames
  const toggleDept = (name: string) => setSelectedDepts(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name])

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Performance Trends</h1><p className="text-sm text-[hsl(var(--text-tertiary))] mt-0.5">Visual trend analysis</p></div>
        <button onClick={() => window.location.reload()} className="btn btn-ghost text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="tab-bar">
          {(['WEEKLY','MONTHLY','QUARTERLY','ANNUAL'] as PeriodType[]).map(pt => (
            <button key={pt} onClick={() => setPeriodType(pt)} className={`tab-item ${periodType === pt ? 'active' : ''}`}>{pt.charAt(0)+pt.slice(1).toLowerCase()}</button>
          ))}
        </div>
        <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="input-field w-52">
          {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          {deptNames.map(name => (
            <button key={name} onClick={() => toggleDept(name)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${selectedDepts.length === 0 || selectedDepts.includes(name) ? 'bg-[hsl(var(--accent))] text-white' : 'bg-[hsl(var(--surface-ground))] text-[hsl(var(--text-tertiary))]'}`}>{name}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="card p-12 text-center"><div className="animate-shimmer h-4 w-32 rounded mx-auto" /></div>
      ) : chartData.length === 0 ? (
        <div className="card p-12 text-center"><BarChart3 className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--text-disabled))]" /><p className="text-[hsl(var(--text-tertiary))]">No trend data. Enter KPI results first.</p></div>
      ) : (
        <div className="card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-6">Achievement Trend — {periodType.toLowerCase()}</h2>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <defs>{filteredDeptNames.map(name => <linearGradient key={name} id={`g-${name}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={deptColors[name]} stopOpacity={0.2}/><stop offset="100%" stopColor={deptColors[name]} stopOpacity={0}/></linearGradient>)}</defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
              <XAxis dataKey="period" tick={{fontSize:12,fill:'hsl(var(--text-tertiary))'}} tickLine={false} axisLine={{stroke:'hsl(var(--border-subtle))'}} />
              <YAxis domain={[0,100]} tick={{fontSize:12,fill:'hsl(var(--text-tertiary))'}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
              <Tooltip contentStyle={{background:'white',border:'1px solid #e5e7eb',borderRadius:'12px',fontSize:'13px',boxShadow:'0 8px 24px rgba(0,0,0,0.08)'}} formatter={(v:number)=>[`${v?.toFixed(1)}%`]} />
              <Legend wrapperStyle={{fontSize:'12px',paddingTop:'16px'}} />
              <ReferenceLine y={85} stroke="hsl(var(--status-at-risk))" strokeDasharray="4 4" strokeOpacity={0.4} />
              {filteredDeptNames.map(name => <Area key={`a-${name}`} type="monotone" dataKey={name} fill={`url(#g-${name})`} stroke="none" />)}
              {filteredDeptNames.map(name => <Line key={`l-${name}`} type="monotone" dataKey={name} stroke={deptColors[name]} strokeWidth={2.5} dot={{r:4,strokeWidth:2,fill:'white'}} activeDot={{r:7}} connectNulls={false} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}


