// frontend/src/pages/DashboardPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { dashboardApi, type DashboardSummary, type DepartmentScore, type TrendDataPoint } from '../api/dashboard'
import { periodsApi, type ReportingPeriod } from '../api/periods'
import type { KPIResult } from '../types'
import { Target, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus, Filter, RefreshCw, BarChart3, Layers, Users, Library, ClipboardList, Building2, Clock, AlertCircle, Plus } from 'lucide-react'

type PeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Catmull-Rom → cubic Bezier conversion, standard tension of 1/6. Produces a
// smooth curve that actually passes through every point, including at local
// peaks and valleys, unlike monotone interpolation which flattens those out
// to avoid overshoot. This is what makes the line look like a wave instead
// of straight segments meeting at sharp angles.
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`
  }
  const d: string[] = [`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d.push(`C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`)
  }
  return d.join(' ')
}

export default function DashboardPage() {
  const currentUser = useAuthStore((s) => s.user)
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'TEAM_LEADER'
  const [periodType, setPeriodType] = useState<PeriodType>('WEEKLY')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [expandedDeptMembers, setExpandedDeptMembers] = useState<any[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [departments, setDepartments] = useState<DepartmentScore[]>([])
  const [trends, setTrends] = useState<TrendDataPoint[]>([])
  const [kpis, setKpis] = useState<KPIResult[]>([])
  const [periods, setPeriods] = useState<ReportingPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDept, setExpandedDept] = useState<string | null>(null)

  const fetchPeriods = useCallback(async () => {
    try {
      const res = await periodsApi.list({ period_type: periodType, status: 'OPEN', page_size: 50 })
      setPeriods(res.data.results)
      if (res.data.results.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(res.data.results[0].id)
      }
    } catch (err) { console.error(err) }
  }, [periodType])

  const fetchDashboard = useCallback(async () => {
    if (!selectedPeriodId) return
    setLoading(true)
    try {
      const params: Record<string, any> = { period_type: periodType, period_id: selectedPeriodId }
      if (selectedDeptId) params.department_id = selectedDeptId

      const [sumRes, deptRes, trendRes, kpiRes] = await Promise.all([
        dashboardApi.getSummary(params),
        dashboardApi.getDepartments(params),
        dashboardApi.getTrends(params),
        dashboardApi.getKPIs({ ...params, page_size: 200 }),
      ])
      setSummary(sumRes.data)
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : deptRes.data?.results || [])
      setTrends(Array.isArray(trendRes.data) ? trendRes.data : [])
      setKpis(kpiRes.data?.results || kpiRes.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [periodType, selectedPeriodId, selectedDeptId])

  useEffect(() => { fetchPeriods() }, [periodType])
  useEffect(() => { if (selectedPeriodId) fetchDashboard() }, [selectedPeriodId, selectedDeptId])

  const periodTypes: { value: PeriodType; label: string }[] = [
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'ANNUAL', label: 'Annual' },
  ]

  const stats = [
    {
      label: 'Average Achievement',
      value: summary?.average_achievement != null ? `${summary.average_achievement}%` : '—',
      icon: Target, color: 'text-[hsl(var(--accent))]', bg: 'bg-[hsl(var(--accent-light))]',
      trend: summary?.trend,
    },
    {
      label: 'On Track',
      value: summary?.on_track_count ?? '—',
      icon: CheckCircle2, color: 'text-[hsl(var(--status-on-track))]', bg: 'bg-[hsl(var(--status-on-track-bg))]',
    },
    {
      label: 'At Risk',
      value: summary?.at_risk_count ?? '—',
      icon: AlertTriangle, color: 'text-[hsl(var(--status-at-risk))]', bg: 'bg-[hsl(var(--status-at-risk-bg))]',
    },
    {
      label: 'Off Track',
      value: summary?.off_track_count ?? '—',
      icon: XCircle, color: 'text-[hsl(var(--status-off-track))]', bg: 'bg-[hsl(var(--status-off-track-bg))]',
    },
  ]

  // #2 — simple overview metrics (counts an admin wants at a glance).
  const totalKpis = kpis.length
  const deptCount = departments.length
  const memberCount = departments.reduce((n, d: any) => n + ((d.team_members?.length) || 0), 0)
  const withData = kpis.filter((k: any) => k.actual_value != null).length
  const pctComplete = totalKpis > 0 ? Math.round((withData / totalKpis) * 100) : 0
  const overview = [
    { label: 'Total KPIs', value: totalKpis, icon: BarChart3 },
    { label: 'Departments', value: deptCount, icon: Layers },
    { label: 'Team Members', value: memberCount, icon: Users },
    { label: '% Reported', value: `${pctComplete}%`, icon: CheckCircle2 },
  ]

  // #3 — quick links to important pages (role-gated).
  const quickLinks = [
    { to: '/kpis', label: 'Add KPI', icon: Library, manage: true },
    { to: '/assignments', label: 'Assignments', icon: ClipboardList, manage: true },
    { to: '/departments', label: 'Departments', icon: Building2, manage: true },
    { to: '/periods', label: 'Periods', icon: Clock, manage: true },
    { to: '/actions', label: 'Actions', icon: AlertCircle, manage: false },
    { to: '/weekly', label: 'Enter Data', icon: Plus, manage: false },
  ].filter(l => !l.manage || canManage)

  const currentPeriod = periods.find(p => p.id === selectedPeriodId)

  // Trend preview: average achievement per period, in chronological order.
  const trendPoints = (() => {
    const byPeriod: Record<string, { sum: number; n: number }> = {}
    const order: string[] = []
    for (const t of trends as any[]) {
      const label = t.period_label || ''
      if (t.achievement == null) continue
      if (!byPeriod[label]) { byPeriod[label] = { sum: 0, n: 0 }; order.push(label) }
      byPeriod[label].sum += t.achievement
      byPeriod[label].n += 1
    }
    return order.map(label => ({ label, value: byPeriod[label].sum / byPeriod[label].n }))
  })()

  const getRAGClass = (status: string) => {
    if (status === 'ON_TRACK') return 'on-track'
    if (status === 'AT_RISK') return 'at-risk'
    if (status === 'OFF_TRACK') return 'off-track'
    return 'no-data'
  }

  const getRAGLabel = (status: string) => {
    if (status === 'ON_TRACK') return 'On Track'
    if (status === 'AT_RISK') return 'At Risk'
    if (status === 'OFF_TRACK') return 'Off Track'
    return 'No Data'
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* === HEADER === */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--text-primary))]">Performance Dashboard</h1>
          <p className="text-sm text-[hsl(var(--text-tertiary))] mt-0.5">
            {currentPeriod?.period_label || 'Select a period'}
            {selectedDeptId && <span className="text-[hsl(var(--accent))]"> · Filtered</span>}
          </p>
        </div>
        <button onClick={fetchDashboard} className="btn btn-ghost text-sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* === PERIOD SELECTOR === */}
      <div className="card p-1.5 flex flex-wrap items-center gap-3">
        <div className="tab-bar">
          {periodTypes.map(pt => (
            <button
              key={pt.value}
              onClick={() => { setPeriodType(pt.value); setSelectedPeriodId('') }}
              className={`tab-item ${periodType === pt.value ? 'active' : ''}`}
            >
              {pt.label}
            </button>
          ))}
        </div>
        <select
          value={selectedPeriodId}
          onChange={(e) => setSelectedPeriodId(e.target.value)}
          className="input-field w-52"
        >
          {periods.length === 0 && <option value="">No open periods</option>}
          {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
        </select>
        {/* #4 — explicit department filter dropdown */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="input-field w-48"
          >
            <option value="">All departments</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.department_name || d.department?.name || 'Unknown'}</option>
            ))}
          </select>
        </div>
        {selectedDeptId && (
          <button onClick={() => setSelectedDeptId('')} className="text-xs text-[hsl(var(--accent))] hover:underline">
            × Clear filter
          </button>
        )}
      </div>

      {/* === #2 OVERVIEW METRICS + #3 QUICK LINKS === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {overview.map(m => (
            <div key={m.label} className="card p-4">
              <div className="flex items-center gap-1.5 text-[hsl(var(--text-tertiary))] mb-1">
                <m.icon className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">{m.label}</span>
              </div>
              <p className="text-2xl font-bold text-[hsl(var(--text-primary))]">{m.value}</p>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-2">Quick actions</p>
          <div className="grid grid-cols-2 gap-2">
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border-subtle))] px-3 py-2 text-sm text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-ground))] transition-colors">
                <l.icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{l.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* === LOADING SKELETON === */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 animate-shimmer">
              <div className="h-3 w-20 rounded-full bg-[hsl(var(--surface-ground))] mb-4" />
              <div className="h-8 w-16 rounded-lg bg-[hsl(var(--surface-ground))]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* === STAT CARDS === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            {stats.map(stat => (
              <div key={stat.label} className="card stat-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                    {stat.label}
                  </span>
                  <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  </div>
                </div>
                <p className="stat-value text-3xl font-bold tracking-tight text-[hsl(var(--text-primary))]">
                  {stat.value}
                </p>
                {stat.trend && stat.label === 'Average Achievement' && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-[hsl(var(--text-tertiary))]">
                    {stat.trend === 'improving' || stat.trend === 'up' ? <TrendingUp className="h-3 w-3 text-[hsl(var(--status-on-track))]" /> :
                     stat.trend === 'declining' || stat.trend === 'down' ? <TrendingDown className="h-3 w-3 text-[hsl(var(--status-off-track))]" /> :
                     <Minus className="h-3 w-3" />}
                    vs previous period
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* === DEPARTMENT CARDS === */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                Department Performance
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
              {Array.isArray(departments) && departments.map(dept => {
                const isSelected = selectedDeptId === dept.id
                const ach = dept.average_achievement
                const progressWidth = ach != null ? Math.min(ach, 100) : 0
                return (
                  <button
                    key={dept.id}
                    onClick={() => { setSelectedDeptId(isSelected ? '' : dept.id); setExpandedDeptMembers(isSelected ? [] : (dept.team_members || [])) }}
                    className={`card card-interactive p-5 text-left w-full ${isSelected ? 'ring-2 ring-[hsl(var(--accent))] shadow-lg' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dept.department_colour || dept.department?.colour || '#6B7280' }} />
                      <span className="text-sm font-semibold text-[hsl(var(--text-primary))] truncate">
                        {dept.department_name || dept.department?.name || 'Unknown'}
                      </span>
                    </div>

                    <div className="flex items-end justify-between mb-3">
                      <span className="text-3xl font-bold tracking-tight text-[hsl(var(--text-primary))]">
                        {ach != null ? `${ach}%` : '—'}
                      </span>
                      <span className={`status-pill ${getRAGClass(dept.rag_status)}`}>
                        {getRAGLabel(dept.rag_status)}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-[hsl(var(--surface-ground))] overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${progressWidth}%`,
                          background: `linear-gradient(90deg, ${
                            dept.rag_status === 'ON_TRACK' ? 'hsl(var(--status-on-track))' :
                            dept.rag_status === 'AT_RISK' ? 'hsl(var(--status-at-risk))' :
                            dept.rag_status === 'OFF_TRACK' ? 'hsl(var(--status-off-track))' : '#E5E7EB'
                          }, ${
                            dept.rag_status === 'ON_TRACK' ? 'hsl(150 70% 50%)' :
                            dept.rag_status === 'AT_RISK' ? 'hsl(42 92% 55%)' :
                            dept.rag_status === 'OFF_TRACK' ? 'hsl(0 70% 60%)' : '#D1D5DB'
                          })`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-[hsl(var(--text-tertiary))]">
                      <span>{dept.total_kpis} KPIs</span>
                      <span>{dept.on_track_count || 0} on track</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* === EXPANDED DEPARTMENT MEMBERS === */}
          {selectedDeptId && expandedDeptMembers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                  Team Members
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
                {expandedDeptMembers.map((member: any) => {
                  const ach = member.achievement
                  const progressWidth = ach != null ? Math.min(ach, 100) : 0
                  return (
                    <div key={member.user_id} className="card p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-sm font-bold text-white">
                          {initials(member.name)}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold truncate">{member.name}</p>
                          <p className="text-[11px] text-[hsl(var(--text-tertiary))]">{member.role}{member.is_head ? ' · Head' : ''} · {member.kpi_count} KPIs</p>
                        </div>
                      </div>
                      <div className="flex items-end justify-between mb-3">
                        <span className="text-2xl font-bold tracking-tight">{ach != null ? ach + '%' : '—'}</span>
                        <span className={'status-pill ' + (ach != null ? (ach >= 85 ? 'on-track' : ach >= 75 ? 'at-risk' : 'off-track') : 'no-data')}>
                          {ach != null ? (ach >= 85 ? 'On Track' : ach >= 75 ? 'At Risk' : 'Off Track') : 'No Data'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[hsl(var(--surface-ground))] overflow-hidden mb-3">
                        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: progressWidth + '%', background: ach != null ? 'linear-gradient(90deg, ' + (ach >= 85 ? 'hsl(var(--status-on-track))' : ach >= 75 ? 'hsl(var(--status-at-risk))' : 'hsl(var(--status-off-track))') + ', ' + (ach >= 85 ? 'hsl(150 70% 50%)' : ach >= 75 ? 'hsl(42 92% 55%)' : 'hsl(0 70% 60%)') + ')' : '#e5e7eb' }} />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-medium">
                        <span className="text-emerald-600">● {member.on_track} on track</span>
                        <span className="text-amber-600">● {member.at_risk} at risk</span>
                        <span className="text-red-600">● {member.off_track} off track</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* === TREND PREVIEW (click → Trends page) === */}
          <Link to="/trends" className="card p-5 block hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                  Achievement Trend
                </h2>
              </div>
              <span className="text-xs text-[hsl(var(--accent))]">View details →</span>
            </div>
            {trendPoints.length < 2 ? (
              <p className="text-sm text-[hsl(var(--text-tertiary))] py-6 text-center">
                Not enough data yet — trends appear once you have results across multiple periods.
              </p>
            ) : (
              (() => {
                const w = 640, h = 90, pad = 6
                const vals = trendPoints.map(p => p.value)
                const min = Math.min(...vals, 0)
                const max = Math.max(...vals, 100)
                const range = max - min || 1
                const step = (w - pad * 2) / (trendPoints.length - 1)
                const pts = trendPoints.map((p, i) => {
                  const x = pad + i * step
                  const y = pad + (h - pad * 2) * (1 - (p.value - min) / range)
                  return [x, y] as const
                })
                // Smooth curve through every point, instead of straight
                // segments meeting at sharp corners.
                const line = smoothPath(pts)
                const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`
                const last = trendPoints[trendPoints.length - 1].value
                const first = trendPoints[0].value
                const up = last >= first
                const stroke = up ? 'hsl(var(--status-on-track))' : 'hsl(var(--status-off-track))'
                return (
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-2xl font-bold">{last.toFixed(1)}%</span>
                      <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
                        {up ? '▲' : '▼'} {Math.abs(last - first).toFixed(1)}% vs first period
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 90 }} preserveAspectRatio="none">
                      <path d={area} fill={stroke} opacity="0.08" />
                      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill={stroke} />)}
                    </svg>
                    <div className="flex justify-between mt-1 text-[10px] text-[hsl(var(--text-tertiary))]">
                      <span>{trendPoints[0].label}</span>
                      <span>{trendPoints[trendPoints.length - 1].label}</span>
                    </div>
                  </div>
                )
              })()
            )}
          </Link>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border-subtle))]">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                  KPI Results
                </h2>
              </div>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{kpis.length} results</span>
            </div>

            {kpis.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--text-disabled))]" />
                <p className="text-[hsl(var(--text-tertiary))]">No KPI results for this period.</p>
                <p className="text-xs text-[hsl(var(--text-disabled))] mt-1">Open a period and enter data via the Entry pages.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>KPI</th>
                      <th>Department</th>
                      <th>Target</th>
                      <th>Actual</th>
                      <th>Achievement</th>
                      <th>Status</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map(kpi => (
                      <tr key={kpi.id}>
                        <td>
                          <span className="text-sm font-semibold text-[hsl(var(--text-primary))]">{kpi.kpi_code}</span>
                          <span className="block text-xs text-[hsl(var(--text-tertiary))] truncate max-w-[200px]">{kpi.kpi_name}</span>
                        </td>
                        <td className="text-sm text-[hsl(var(--text-secondary))]">{kpi.department_name}</td>
                        <td className="text-sm font-mono text-[hsl(var(--text-secondary))]">{(kpi as any).target_value ?? (kpi as any).target_snapshot ?? '—'}</td>
                        <td className="text-sm font-mono font-medium">{kpi.actual_value != null ? kpi.actual_value : '—'}</td>
                        <td className="text-sm font-semibold">{kpi.achievement_percentage != null ? `${kpi.achievement_percentage}%` : '—'}</td>
                        <td><span className={`status-pill ${getRAGClass(kpi.rag_status)}`}>{getRAGLabel(kpi.rag_status)}</span></td>
                        <td>
                          <span className={`trend-indicator ${
                            kpi.trend_status === 'IMPROVING' ? 'trend-up' :
                            kpi.trend_status === 'DECLINING' ? 'trend-down' : 'trend-stable'
                          }`}>
                            {kpi.trend_status === 'IMPROVING' ? '↑' : kpi.trend_status === 'DECLINING' ? '↓' : '→'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}