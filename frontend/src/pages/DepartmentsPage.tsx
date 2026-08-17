import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/authStore'
import { departmentsApi } from '../api/departments'
import { apiClient } from '../api/client'
import Modal from '../components/shared/Modal'
import type { Department } from '../types'
import { Pencil, Trash2, Plus, Users, Mail, ChevronRight } from 'lucide-react'

const departmentSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(1, 'Code is required').max(10),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex'),
  display_order: z.coerce.number().min(0).catch(0),
})

type DepartmentFormData = z.infer<typeof departmentSchema>
interface DeptMember { id: string; full_name: string; email: string; role: string; role_display: string; display_title: string; kpi_progress: number|null }
const inputS = {
  width: '100%', border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px',
  fontSize: 14, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))',
} as const

// Matches UsersPage's role badge classes, so the same dark-mode overrides apply here too.
const roleColor: Record<string, string> = { ADMIN: 'bg-purple-100 text-purple-700', TEAM_LEADER: 'bg-blue-100 text-blue-700', MEMBER: 'bg-gray-100 text-gray-600' }

export default function DepartmentsPage() {
  const { user } = useAuthStore()
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER'
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDept, setEditingDept] = useState<Department|null>(null)
  const [message, setMessage] = useState<{type:'success'|'error';text:string}|null>(null)
  const [expandedDept, setExpandedDept] = useState<string|null>(null)
  const [deptMembers, setDeptMembers] = useState<Record<string,DeptMember[]>>({})
  const [loadingMembers, setLoadingMembers] = useState<string|null>(null)
  const [showAddMember, setShowAddMember] = useState<string|null>(null)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState:{errors} } = useForm<DepartmentFormData>({ resolver:zodResolver(departmentSchema), defaultValues:{display_order:0,colour:'#3B82F6'} })
  const colour = watch('colour')

  const fetchDepartments = async () => { setLoading(true); try { const res = await departmentsApi.list({page_size:100}); setDepartments(res.data.results) } catch{} finally{setLoading(false)} }
  useEffect(()=>{fetchDepartments()},[])

  const fetchDeptMembers = async (deptId:string) => { setLoadingMembers(deptId); try { const res = await apiClient.get(`/departments/${deptId}/members/`); setDeptMembers(prev=>({...prev,[deptId]:res.data})) } catch{} finally{setLoadingMembers(null)} }
  const fetchAllUsers = async () => { try { const res = await apiClient.get('/auth/users/my_team/'); setAllUsers(res.data||[]) } catch{} }

  const handleDeptClick = (deptId:string) => {
    if(expandedDept===deptId){setExpandedDept(null);setShowAddMember(null)}
    else{setExpandedDept(deptId);setShowAddMember(null);if(!deptMembers[deptId])fetchDeptMembers(deptId)}
  }

  const handleAddMemberToDept = async (deptId:string) => { if(!selectedUserId)return; try{await apiClient.post('/auth/user-departments/',{user:selectedUserId,department:deptId,is_department_head:false});setMessage({type:'success',text:'Member added'});setShowAddMember(null);setSelectedUserId('');fetchDeptMembers(deptId);setTimeout(()=>setMessage(null),3000)} catch(err:any){setMessage({type:'error',text:err.response?.data?.errors?.[0]||'Failed'})} }

  const onSubmit = async (data:DepartmentFormData) => {
    setSaving(true); setMessage(null)
    try {
      if(editingDept){ await departmentsApi.update(editingDept.id, data as any) }
      else { await departmentsApi.create(data as any) }
      setShowForm(false); setEditingDept(null); reset(); fetchDepartments()
    } catch(err:any){ console.error(err); setMessage({type:'error',text:err.response?.data?.errors?.[0]||'Failed'}) }
    finally { setSaving(false) }
  }

  const handleEdit = (dept:Department) => { setEditingDept(dept); reset({name:dept.name,code:dept.code,colour:dept.colour,display_order:dept.display_order ?? 0}); setShowForm(true) }

  const handleDelete = async (dept:Department) => {
    if(!window.confirm('Archive "'+dept.name+'"?')) return
    try { await departmentsApi.delete(dept.id); fetchDepartments(); setMessage({type:'success',text:'Department archived'}) }
    catch(err:any){ setMessage({type:'error',text:'Delete failed'}) }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Departments</h1><p className="text-sm text-gray-500 mt-0.5">{departments.length} departments</p></div>{canManage && <button onClick={()=>setShowForm(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> Add Department</button>}</div>
      {message&&<div className={'p-3 rounded-xl text-sm '+(message.type==='success'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700')}>{message.text}</div>}

      <Modal
        open={showForm}
        onClose={()=>{setShowForm(false);setEditingDept(null);reset()}}
        title={editingDept?'Edit Department':'New Department'}
        footer={
          <>
            <button type="button" onClick={()=>{setShowForm(false);setEditingDept(null);reset()}} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'hsl(var(--surface-ground))',color:'hsl(var(--text-primary))',cursor:'pointer',fontSize:14}}>Cancel</button>
            <button type="submit" form="dept-form" disabled={saving} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'#4f46e5',color:'white',cursor:'pointer',fontSize:14,fontWeight:500}}>{saving?'Saving...':editingDept?'Update':'Create'}</button>
          </>
        }
      >
        <form id="dept-form" onSubmit={handleSubmit(onSubmit, (errs) => console.log('Validation failed:', errs))} style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4,color:'hsl(var(--text-primary))'}}>Name <span style={{color:'#ef4444'}}>*</span></label><input {...register('name')} style={inputS} />{errors.name&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.name.message}</p>}</div>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4,color:'hsl(var(--text-primary))'}}>Code <span style={{color:'#ef4444'}}>*</span></label><input {...register('code')} style={inputS} />{errors.code&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.code.message}</p>}</div>
          </div>
          <div>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4,color:'hsl(var(--text-primary))'}}>Colour <span style={{color:'#ef4444'}}>*</span></label>
            <div style={{display:'flex',gap:8}}>
              <input type="color" value={colour} onChange={(e)=>setValue('colour',e.target.value)} style={{width:48,height:42,borderRadius:10,border:'1px solid hsl(var(--border-subtle))',cursor:'pointer',padding:4}} />
              <input {...register('colour')} style={{flex:1,...inputS}} />
            </div>
            {errors.colour&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.colour.message}</p>}
          </div>
          {Object.keys(errors).length > 0 && (
            <p style={{fontSize:12,color:'#ef4444'}}>Please fix the errors above</p>
          )}
        </form>
      </Modal>

      {loading?<div className="card p-12 text-center text-gray-500">Loading...</div>:(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(dept=>(
            <div key={dept.id}>
              <div className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={()=>handleDeptClick(dept.id)}>
                <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full flex-shrink-0" style={{backgroundColor:dept.colour}} /><div><h3 className="font-semibold">{dept.name}</h3><p className="text-xs text-gray-500">{dept.code} - {dept.kpi_count} KPIs</p></div></div>{canManage && <div className="flex gap-1"><button onClick={(e)=>{e.stopPropagation();handleEdit(dept)}} className="p-1.5 hover:bg-gray-100 rounded"><Pencil className="h-4 w-4 text-gray-400" /></button><button onClick={(e)=>{e.stopPropagation();handleDelete(dept)}} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button></div>}</div>
                <div className="flex items-center justify-between text-sm"><span className="text-gray-500">{deptMembers[dept.id]?deptMembers[dept.id].length+' members':'Click to view members'}</span><ChevronRight className={'h-4 w-4 text-gray-400 transition-transform '+(expandedDept===dept.id?'rotate-90':'')} /></div>
              </div>
              {expandedDept===dept.id&&(
                <div className="card mt-2 p-4 bg-gray-50 animate-fade-in-up">
                  <div className="flex items-center justify-between mb-3"><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Users className="h-3 w-3" /> Members</h4>{canManage && <button onClick={(e)=>{e.stopPropagation();setShowAddMember(dept.id);fetchAllUsers()}} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add Member</button>}</div>
                  {showAddMember===dept.id&&(
                    <div style={{marginBottom:12,padding:12,backgroundColor:'hsl(var(--surface-card))',borderRadius:12,border:'1px solid hsl(var(--border-subtle))'}}>
                      <select value={selectedUserId} onChange={(e)=>setSelectedUserId(e.target.value)} style={{width:'100%',border:'1px solid hsl(var(--border-subtle))',borderRadius:8,padding:'8px 10px',fontSize:13,outline:'none',marginBottom:8,backgroundColor:'hsl(var(--surface-card))',color:'hsl(var(--text-primary))'}}>
                        <option value="">Select user...</option>
                        {allUsers.filter((u:any)=>!deptMembers[dept.id]?.some((m:any)=>m.id===u.id)).map((u:any)=><option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                      </select>
                      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                        <button onClick={()=>{setShowAddMember(null);setSelectedUserId('')}} style={{padding:'6px 14px',borderRadius:8,border:'none',background:'hsl(var(--surface-ground))',color:'hsl(var(--text-secondary))',fontSize:13,cursor:'pointer'}}>Cancel</button>
                        <button onClick={()=>handleAddMemberToDept(dept.id)} style={{padding:'6px 14px',borderRadius:8,border:'none',background:'#4f46e5',color:'white',fontSize:13,cursor:'pointer'}}>Add</button>
                      </div>
                    </div>
                  )}
                  {loadingMembers===dept.id?<p className="text-sm text-gray-400">Loading...</p>:deptMembers[dept.id]&&deptMembers[dept.id].length>0?(
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {deptMembers[dept.id].map(member=>(
                        <div key={member.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:10,backgroundColor:'hsl(var(--surface-card))',borderRadius:10}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{width:32,height:32,borderRadius:'50%',backgroundColor:'#4f46e5',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700}}>{member.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}</div>
                            <div><p style={{fontSize:14,fontWeight:500,margin:0,color:'hsl(var(--text-primary))'}}>{member.full_name}</p><p style={{fontSize:12,color:'hsl(var(--text-secondary))',margin:0}}>{member.email}</p></div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span className={`${roleColor[member.role]||'bg-gray-100 text-gray-600'}`} style={{fontSize:10,padding:'2px 8px',borderRadius:100,fontWeight:500}}>{member.role_display}</span>
                            <span style={{fontSize:12,color:'hsl(var(--text-tertiary))'}}>{member.display_title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ):<p className="text-sm text-gray-400">No members yet.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}