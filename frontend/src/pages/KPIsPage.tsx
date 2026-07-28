import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { apiClient } from '../api/client'
import { kpisApi } from '../api/kpis'
import { departmentsApi } from '../api/departments'
import type { KPI, Department } from '../types'
import { Plus, Pencil, Archive, RotateCcw, Search, X } from 'lucide-react'

const EMPTY_FORM = {
  code: '', name: '', department: '', calculation_direction: 'HIGHER_IS_BETTER',
  reporting_frequency: 'WEEKLY', target_value: '', unit_type: 'PERCENTAGE', weight: '1.0',
  responsible_person: ''
}

const inputS = {
  width: '100%', border: '1px solid #d1d5db', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, outline: 'none',
} as const

export default function KPIsPage() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterFreq, setFilterFreq] = useState('')
  const [filterDirection, setFilterDirection] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [deptMembers, setDeptMembers] = useState<any[]>([])

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setMessage(null), 3000)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // Structured filters are applied server-side; free-text search is client-side over the fetched page.
  const fetchData = async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page_size: 200 }
      if (filterDept) params.department = filterDept
      if (filterFreq) params.reporting_frequency = filterFreq
      if (filterDirection) params.calculation_direction = filterDirection
      if (filterActive === 'true') params.is_active = true
      if (filterActive === 'false') params.is_active = false
      const [kpiRes, deptRes] = await Promise.all([
        kpisApi.list(params),
        departmentsApi.list({ page_size: 100 }),
      ])
      setKpis(kpiRes.data.results)
      setDepartments(deptRes.data.results)
    } catch (err) {
      console.error(err)
      toast('error', 'Failed to load KPIs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filterDept, filterFreq, filterDirection, filterActive])

  // ---- modal open/close ----
  const openCreate = () => { setEditingKpi(null); setForm({ ...EMPTY_FORM }); setShowForm(true) }

  const openEdit = (kpi: KPI) => {
    setEditingKpi(kpi)
    setForm({
      code: kpi.code ?? '',
      name: kpi.name ?? '',
      department: String((kpi as any).department ?? ''),
      calculation_direction: kpi.calculation_direction ?? 'HIGHER_IS_BETTER',
      reporting_frequency: (kpi as any).reporting_frequency ?? 'WEEKLY',
      target_value: String(kpi.target_value ?? ''),
      unit_type: (kpi as any).unit_type ?? 'PERCENTAGE',
      weight: String(kpi.weight ?? '1.0'),
    })
    setShowForm(true)
  }

  const closeModal = useCallback(() => {
    setShowForm(false)
    setEditingKpi(null)
    setForm({ ...EMPTY_FORM })
  }, [])

  // Esc to close + lock background scroll while the modal is open
  useEffect(() => {
    if (!showForm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [showForm, closeModal])

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.department || form.target_value === '') {
      toast('error', 'Code, Name, Department and Target are required')
      return
    }
    const target = Number(form.target_value)
    const weight = Number(form.weight)
    if (Number.isNaN(target)) { toast('error', 'Target must be a number'); return }

    const payload = { ...form, target_value: target, weight: Number.isNaN(weight) ? 1 : weight }

    setSaving(true)
    try {
      if (editingKpi) {
        await kpisApi.update(editingKpi.id, payload as any)
        toast('success', 'KPI updated')
      } else {
        await kpisApi.create(payload as any)
        toast('success', 'KPI created')
      }
      closeModal()
      fetchData()
    } catch (err: any) {
      toast('error', err.response?.data?.errors?.[0] || 'Failed to save KPI')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (kpi: KPI) => {
    if (!confirm(`Archive "${kpi.name}"?`)) return
    try { await kpisApi.archive(kpi.id); fetchData() }
    catch { toast('error', 'Archive failed') }
  }
  const handleRestore = async (kpi: KPI) => {
    try { await kpisApi.restore(kpi.id); fetchData() }
    catch { toast('error', 'Restore failed') }
  }

  const getDirectionBadge = (dir: string) => {
    const styles: Record<string, string> = {
      HIGHER_IS_BETTER: 'bg-green-50 text-green-700', LOWER_IS_BETTER: 'bg-red-50 text-red-700',
      EXACT_TARGET: 'bg-blue-50 text-blue-700', RANGE: 'bg-purple-50 text-purple-700',
      BOOLEAN: 'bg-yellow-50 text-yellow-700', MANUAL_SCORE: 'bg-gray-50 text-gray-700',
    }
    const labels: Record<string, string> = {
      HIGHER_IS_BETTER: 'Higher', LOWER_IS_BETTER: 'Lower', EXACT_TARGET: 'Exact',
      RANGE: 'Range', BOOLEAN: 'Yes/No', MANUAL_SCORE: 'Manual',
    }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[dir] || 'bg-gray-50'}`}>{labels[dir] || dir}</span>
  }

  const q = search.trim().toLowerCase()
  const filteredKpis = q
    ? kpis.filter(k => k.name.toLowerCase().includes(q) || k.code.toLowerCase().includes(q))
    : kpis

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KPI Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filteredKpis.length} KPIs</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary"><Plus className="h-4 w-4" /> Add KPI</button>
      </div>

      {message && (
        <div className={'p-3 rounded-xl text-sm ' + (message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search KPIs..." value={search} onChange={e => setSearch(e.target.value)} className="input-field border flex-1" />
          </div>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field border w-48">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterFreq} onChange={e => setFilterFreq(e.target.value)} className="input-field border w-40">
            <option value="">All Frequencies</option>
            <option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option>
          </select>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="input-field border w-36">
            <option value="">All Status</option><option value="true">Active</option><option value="false">Archived</option>
          </select>
          <button onClick={fetchData} className="btn btn-ghost text-sm">Refresh</button>
        </div>
      </div>

      {/* Table region (header + filters stay mounted during refetch) */}
      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading KPIs...</div>
      ) : filteredKpis.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">No KPIs match your filters.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Department</th><th>Direction</th>
                  <th>Frequency</th><th>Target</th><th>Weight</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKpis.map(kpi => (
                  <tr key={kpi.id} className={!kpi.is_active ? 'opacity-50' : ''}>
                    <td className="font-mono text-sm font-medium">{kpi.code}</td>
                    <td><div className="text-sm font-medium max-w-[300px] truncate">{kpi.name}</div></td>
                    <td className="text-sm">{kpi.department_name}</td>
                    <td>{getDirectionBadge(kpi.calculation_direction)}</td>
                    <td className="text-sm">{kpi.reporting_frequency ? kpi.reporting_frequency.charAt(0) + kpi.reporting_frequency.slice(1).toLowerCase() : ""}</td>
                    <td className="text-sm font-mono">
                      {kpi.target_value} {kpi.unit_display?.replace('Percentage (%)', '%').replace('Number / Count', '') || ''}
                    </td>
                    <td className="text-sm text-center">{kpi.weight}</td>
                    <td><span className={`status-pill ${kpi.is_active ? 'on-track' : 'no-data'}`}>{kpi.is_active ? 'Active' : 'Archived'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(kpi)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit">
                          <Pencil className="h-4 w-4 text-gray-400" />
                        </button>
                        {kpi.is_active
                          ? <button onClick={() => handleArchive(kpi)} className="p-1.5 hover:bg-red-50 rounded" title="Archive"><Archive className="h-4 w-4 text-red-400" /></button>
                          : <button onClick={() => handleRestore(kpi)} className="p-1.5 hover:bg-green-50 rounded" title="Restore"><RotateCcw className="h-4 w-4 text-green-500" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit KPI Modal */}
      {showForm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingKpi ? 'Edit KPI' : 'New KPI'}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.5)', padding: '80px 16px 16px' }}
          onClick={closeModal}
        >
          <div
            style={{ width: '100%', maxWidth: 560, backgroundColor: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{editingKpi ? 'Edit KPI' : 'New KPI'}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8 }}><X size={18} color="#6b7280" /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Code <span style={{ color: '#ef4444' }}>*</span></label>
                  <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. FIN-W-001" style={inputS} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Budget Variance" style={inputS} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Department <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={form.department} onChange={e => { setForm(p => ({ ...p, department: e.target.value, responsible_person: '' })); apiClient.get('/departments/' + e.target.value + '/members/').then(r => setDeptMembers(r.data || [])).catch(() => setDeptMembers([])) }} style={inputS}>
                  <option value="">Select department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Direction</label>
                  <select value={form.calculation_direction} onChange={e => setForm(p => ({ ...p, calculation_direction: e.target.value }))} style={inputS}>
                    <option value="HIGHER_IS_BETTER">Higher is Better</option>
                    <option value="LOWER_IS_BETTER">Lower is Better</option>
                    <option value="EXACT_TARGET">Exact Target</option>
                    <option value="RANGE">Range</option>
                    <option value="BOOLEAN">Yes/No</option>
                    <option value="MANUAL_SCORE">Manual</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Frequency</label>
                  <select value={form.reporting_frequency} onChange={e => setForm(p => ({ ...p, reporting_frequency: e.target.value }))} style={inputS}>
                    <option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Unit</label>
                  <select value={form.unit_type} onChange={e => setForm(p => ({ ...p, unit_type: e.target.value }))} style={inputS}>
                    <option value="PERCENTAGE">Percentage</option><option value="NUMBER">Number</option>
                    <option value="CURRENCY">Currency</option><option value="HOURS">Hours</option>
                    <option value="DAYS">Days</option><option value="SCORE">Score</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Target <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="number" step="any" value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: e.target.value }))} placeholder="e.g. 95" style={inputS} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Weight</label>
                  <input type="number" step="0.1" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} style={inputS} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid #f3f4f6' }}>
              <button onClick={closeModal} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#f3f4f6', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#4f46e5', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                {saving ? 'Saving...' : editingKpi ? 'Save changes' : 'Create KPI'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}




