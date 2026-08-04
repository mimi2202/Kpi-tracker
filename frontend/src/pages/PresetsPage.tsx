// frontend/src/pages/PresetsPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { Plus, Check, Layers, Sparkles, Building2, X, Loader2, Pencil, Trash2, RefreshCw } from 'lucide-react'

interface Category { id: string; name: string; description: string; preset_count: number; display_order: number }
interface Preset {
  id: string; name: string; description: string; category: string; category_name: string
  target_value: string; unit: string; calculation_direction: string; reporting_frequency: string
}
interface Department { id: string; name: string; code: string }

const FREQ = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']
const DIR = [['HIGHER_BETTER', 'Higher is better'], ['LOWER_BETTER', 'Lower is better']]

export default function PresetsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'

  const [categories, setCategories] = useState<Category[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeCat, setActiveCat] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [applyDept, setApplyDept] = useState('')
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [editing, setEditing] = useState<Preset | null>(null)
  const [showForm, setShowForm] = useState(false)

  const toast = (type: 'success' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, presetRes, deptRes] = await Promise.all([
        apiClient.get('/kpi-preset-categories/', { params: { page_size: 100 } }),
        apiClient.get('/kpi-presets/', { params: { page_size: 500, is_active: true } }),
        apiClient.get('/departments/', { params: { page_size: 100 } }),
      ])
      const cats = catRes.data.results ?? catRes.data
      setCategories(cats)
      setPresets(presetRes.data.results ?? presetRes.data)
      setDepartments(deptRes.data.results ?? deptRes.data)
      if (cats.length && !activeCat) setActiveCat(cats[0].id)
    } catch { toast('error', 'Failed to load presets') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const applyPresets = async () => {
    if (!applyDept || selected.size === 0) return
    setApplying(true)
    try {
      const res = await apiClient.post('/kpi-presets/apply/', {
        preset_ids: Array.from(selected), department_id: applyDept,
      })
      const { created_count, skipped } = res.data
      toast('success', `Added ${created_count} KPI${created_count === 1 ? '' : 's'}${skipped?.length ? `, skipped ${skipped.length} (already exist)` : ''}`)
      setSelected(new Set()); setApplyDept('')
    } catch (err: any) {
      toast('error', err.response?.data?.detail || 'Failed to apply presets')
    } finally { setApplying(false) }
  }

  const deletePreset = async (id: string) => {
    if (!confirm('Delete this preset? KPIs already created from it are not affected.')) return
    try { await apiClient.delete(`/kpi-presets/${id}/`); setPresets(p => p.filter(x => x.id !== id)) }
    catch { toast('error', 'Delete failed') }
  }

  const visible = presets.filter(p => !activeCat || p.category === activeCat)

  if (!canManage) return <div className="card p-8 text-center text-gray-500">Only admins and team leaders can manage preset KPIs.</div>

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-600" /> Preset KPIs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ready-made KPI templates. Select some and add them to a department.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-ghost text-sm"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn btn-primary text-sm"><Plus className="h-4 w-4" /> New preset</button>
        </div>
      </div>

      {message && <div className={`p-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCat(c.id)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${activeCat === c.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
            {c.name} <span className="opacity-70">({c.preset_count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-500">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <Layers className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p>No presets in this category yet.</p>
          <p className="text-sm mt-1">Add one, or run the seed command to load starter presets.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(p => {
            const on = selected.has(p.id)
            return (
              <div key={p.id} className={`card p-4 cursor-pointer transition-all ${on ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => toggle(p.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                  </div>
                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                    {on && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-500">
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded">Target {p.target_value}{p.unit}</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded">{p.reporting_frequency.toLowerCase()}</span>
                </div>
                <div className="flex gap-1 mt-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditing(p); setShowForm(true) }} className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>
                  <button onClick={() => deletePreset(p.id)} className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 ml-2"><Trash2 className="h-3 w-3" /> Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Apply bar (sticky when presets selected) */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 card p-4 shadow-lg border-indigo-200 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Building2 className="h-4 w-4 text-gray-400" />
            <select value={applyDept} onChange={e => setApplyDept(e.target.value)} className="input-field border text-sm">
              <option value="">Choose department…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={() => setSelected(new Set())} className="btn btn-ghost text-sm">Clear</button>
            <button onClick={applyPresets} disabled={applying || !applyDept} className="btn btn-primary text-sm">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {applying ? 'Adding…' : `Add to department`}
            </button>
          </div>
        </div>
      )}

      {showForm && <PresetForm preset={editing} categories={categories} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function PresetForm({ preset, categories, onClose, onSaved }: { preset: Preset | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(preset?.name || '')
  const [description, setDescription] = useState(preset?.description || '')
  const [category, setCategory] = useState(preset?.category || (categories[0]?.id || ''))
  const [target, setTarget] = useState(preset?.target_value || '0')
  const [unit, setUnit] = useState(preset?.unit || '')
  const [direction, setDirection] = useState(preset?.calculation_direction || 'HIGHER_BETTER')
  const [frequency, setFrequency] = useState(preset?.reporting_frequency || 'MONTHLY')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr('')
    const payload = { name, description, category, target_value: Number(target), unit, calculation_direction: direction, reporting_frequency: frequency }
    try {
      if (preset) await apiClient.patch(`/kpi-presets/${preset.id}/`, payload)
      else await apiClient.post('/kpi-presets/', payload)
      onSaved()
    } catch (e: any) { setErr(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{preset ? 'Edit preset' : 'New preset'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field border w-full mt-1" placeholder="e.g. Monthly Revenue" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="input-field border w-full mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="input-field border w-full mt-1">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Frequency</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} className="input-field border w-full mt-1">
                {FREQ.map(f => <option key={f} value={f}>{f[0] + f.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Target</label>
              <input type="number" value={target} onChange={e => setTarget(e.target.value)} className="input-field border w-full mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Unit</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} className="input-field border w-full mt-1" placeholder="%, hrs, $…" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Direction</label>
              <select value={direction} onChange={e => setDirection(e.target.value)} className="input-field border w-full mt-1">
                {DIR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? 'Saving…' : 'Save preset'}</button>
        </div>
      </div>
    </div>
  )
}