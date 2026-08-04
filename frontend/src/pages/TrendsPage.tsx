// frontend/src/pages/TrendsPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dashboardApi } from '../api/dashboard'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { TrendingUp, RefreshCw, Layers } from 'lucide-react'

type PeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

interface TrendRow {
  period_label: string
  achievement: number | null
  target: number
  department_name: string
  department_colour: string
}

// A fallback palette if the backend doesn't supply a colour.
const FALLBACK = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export default function TrendsPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY')
  const [rows, setRows] = useState<TrendRow[]>([])
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'area' | 'line'>('area')
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    try {
      const [trendRes] = await Promise.all([
        dashboardApi.getTrends({ period_type: periodType }),
      ])
      const data = Array.isArray(trendRes.data) ? trendRes.data : (trendRes.data?.results || [])
      setRows(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [periodType])

  useEffect(() => {
    periodsApi.list({ period_type: periodType, page_size: 50 })
      .then(r => setPeriods(r.data.results || []))
      .catch(() => {})
    fetchTrends()
  }, [periodType, fetchTrends])

  // Pivot rows [{period_label, department_name, achievement}] into recharts shape:
  // [{ period: 'Week 1', HR: 92, Finance: 78 }, ...] with one key per department.
  const { chartData, departments, colours } = useMemo(() => {
    const periodOrder: string[] = []
    const byPeriod: Record<string, Record<string, number[]>> = {}
    const deptSet = new Set<string>()
    const colourMap: Record<string, string> = {}

    for (const r of rows) {
      const period = r.period_label || '—'
      const dept = r.department_name || 'Unknown'
      deptSet.add(dept)
      if (r.department_colour) colourMap[dept] = r.department_colour
      if (!byPeriod[period]) { byPeriod[period] = {}; periodOrder.push(period) }
      if (r.achievement != null) {
        (byPeriod[period][dept] ||= []).push(r.achievement)
      }
    }

    const depts = Array.from(deptSet)
    depts.forEach((d, i) => { if (!colourMap[d]) colourMap[d] = FALLBACK[i % FALLBACK.length] })

    const data = periodOrder.map(period => {
      const row: Record<string, any> = { period }
      for (const d of depts) {
        const vals = byPeriod[period][d]
        row[d] = vals && vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
      }
      return row
    })

    return { chartData: data, departments: depts, colours: colourMap }
  }, [rows])

  const toggleDept = (d: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const periodTypes: { value: PeriodType; label: string }[] = [
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'ANNUAL', label: 'Annual' },
  ]

  const visibleDepts = departments.filter(d => !hidden.has(d))
  const enoughData = chartData.length >= 2 && departments.length > 0

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{label}</p>
        {payload
          .filter((p: any) => p.value != null)
          .sort((a: any, b: any) => b.value - a.value)
          .map((p: any) => (
            <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '2px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color, flexShrink: 0 }} />
              <span style={{ color: '#374151' }}>{p.dataKey}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{p.value}%</span>
            </div>
          ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--text-primary))]">Performance Trends</h1>
          <p className="text-sm text-[hsl(var(--text-tertiary))] mt-0.5">Achievement over time by department</p>
        </div>
        <button onClick={fetchTrends} className="btn btn-ghost text-sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="card p-1.5 flex flex-wrap items-center gap-3">
        <div className="tab-bar">
          {periodTypes.map(pt => (
            <button key={pt.value} onClick={() => setPeriodType(pt.value)} className={`tab-item ${periodType === pt.value ? 'active' : ''}`}>
              {pt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setMode('area')} className={`tab-item ${mode === 'area' ? 'active' : ''}`}>Area</button>
          <button onClick={() => setMode('line')} className={`tab-item ${mode === 'line' ? 'active' : ''}`}>Line</button>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-5">
        {loading ? (
          <div className="h-[380px] flex items-center justify-center text-[hsl(var(--text-tertiary))]">Loading…</div>
        ) : !enoughData ? (
          <div className="h-[380px] flex flex-col items-center justify-center text-center">
            <TrendingUp className="h-10 w-10 text-[hsl(var(--text-disabled))] mb-3" />
            <p className="text-[hsl(var(--text-secondary))] font-medium">Not enough data to show a trend</p>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1 max-w-sm">
              Trends need results across at least two {periodType.toLowerCase()} periods. Enter data for more periods and they'll appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Achievement %</h2>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              {mode === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <defs>
                    {visibleDepts.map(d => (
                      <linearGradient key={d} id={`grad-${d.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colours[d]} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={colours[d]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 'dataMax + 10']} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={85} stroke="#059669" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Target 85%', fontSize: 10, fill: '#059669', position: 'right' }} />
                  {visibleDepts.map(d => (
                    <Area key={d} type="monotone" dataKey={d} stroke={colours[d]} strokeWidth={2.5}
                      fill={`url(#grad-${d.replace(/\s/g, '')})`} connectNulls dot={{ r: 2.5, fill: colours[d] }} activeDot={{ r: 5 }} />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 'dataMax + 10']} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={85} stroke="#059669" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Target 85%', fontSize: 10, fill: '#059669', position: 'right' }} />
                  {visibleDepts.map(d => (
                    <Line key={d} type="monotone" dataKey={d} stroke={colours[d]} strokeWidth={2.5}
                      connectNulls dot={{ r: 2.5, fill: colours[d] }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>

            {/* Department toggles (click to show/hide a line) */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[hsl(var(--border-subtle))]">
              {departments.map(d => {
                const off = hidden.has(d)
                return (
                  <button key={d} onClick={() => toggleDept(d)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={{ borderColor: off ? '#e5e7eb' : colours[d], background: off ? 'white' : `${colours[d]}12`, color: off ? '#9ca3af' : '#374151' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: off ? '#d1d5db' : colours[d] }} />
                    {d}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}