import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Modal from '../components/shared/Modal'
import { Search, Shield, UserCheck, UserX, ChevronDown, ChevronRight, RefreshCw, Mail, Plus, Building2, Eye, EyeOff } from 'lucide-react'

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['ADMIN', 'TEAM_LEADER', 'MEMBER']),
  title: z.string().optional(),
  department_id: z.string().optional(),
})

type InviteFormData = z.infer<typeof inviteSchema>
interface TeamMember { id: string; full_name: string; email: string; role: string; role_display: string; title: string; display_title: string; kpi_progress: number|null; is_active: boolean; team_size?: number; departments?: Array<{id:string;name:string}> }
interface Department { id: string; name: string; code: string; colour: string }
const inputS = { width:'100%',border:'1px solid #d1d5db',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none' } as const

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$'
  let pw = ''; for (let i=0;i<14;i++) pw += chars[Math.floor(Math.random()*chars.length)]
  return pw
}

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState<string|null>(null)
  const [editingUser, setEditingUser] = useState<string|null>(null)
  const [editRole, setEditRole] = useState(''); const [editTitle, setEditTitle] = useState(''); const [editDept, setEditDept] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [message, setMessage] = useState<{type:'success'|'error';text:string}|null>(null)
  const [inviting, setInviting] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const isAdmin = currentUser?.role==='ADMIN'; const canManage = isAdmin || currentUser?.role==='TEAM_LEADER'

  const { register, handleSubmit, reset, watch, setValue, formState:{errors} } = useForm<InviteFormData>({ resolver:zodResolver(inviteSchema), defaultValues:{role:'MEMBER'} })
  const selectedRole = watch('role')

  const fetchTeam = async () => { setLoading(true); try { const res = await apiClient.get('/auth/users/my_team/'); setMembers(res.data) } catch(err){console.error(err)} finally{setLoading(false)} }
  const fetchDepartments = async () => { try { const res = await apiClient.get('/departments/'); setDepartments(res.data.results || res.data) } catch {} }
  useEffect(()=>{fetchTeam();fetchDepartments()},[])

  const onInvite = async (data: InviteFormData) => {
    setInviting(true); setMessage(null)
    try {
      // organisation is injected server-side from the authenticated admin; never sent from the client.
      const payload: any = { email:data.email, password:data.password, first_name:data.first_name, last_name:data.last_name, role:data.role, title:data.title||'OTHER', manager:currentUser?.id }
      const res = await apiClient.post('/auth/users/', payload)
      if (data.department_id && res.data?.id) {
        try {
          await apiClient.post('/auth/user-departments/',{user:res.data.id,department:data.department_id,is_department_head:data.role==='TEAM_LEADER'})
        } catch(e:any) {
          setMessage({type:'error',text:`${data.first_name} added, but department assignment failed: ${e.response?.data?.errors?.[0]||'unknown error'}`})
          setShowInvite(false); reset(); await fetchTeam(); return
        }
      }
      setMessage({type:'success',text:`${data.first_name} ${data.last_name} added`}); setShowInvite(false); reset(); await fetchTeam()
    } catch(err:any) { setMessage({type:'error',text:err.response?.data?.errors?.[0]||'Failed'}) }
    finally { setInviting(false) }
  }

  const handleAssignRole = async (userId: string) => {
    try {
      const payload: Record<string,any> = {}; if(editRole) payload.role=editRole; if(editTitle) payload.title=editTitle
      await apiClient.patch(`/auth/users/${userId}/`, payload)
      if(editDept){ try{await apiClient.post('/auth/user-departments/',{user:userId,department:editDept,is_department_head:editRole==='TEAM_LEADER'})} catch{} }
      setEditingUser(null); fetchTeam()
    } catch{}
  }

  const filtered = members.filter(m => m.full_name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))
  const roleColor: Record<string,string> = { ADMIN:'bg-purple-100 text-purple-700', TEAM_LEADER:'bg-blue-100 text-blue-700', MEMBER:'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Team Management</h1><p className="text-sm text-gray-500 mt-0.5">{members.length} members</p></div><div className="flex gap-2"><button onClick={fetchTeam} className="btn btn-ghost text-sm"><RefreshCw className="h-4 w-4" /></button>{canManage&&<button onClick={()=>setShowInvite(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> Add Member</button>}</div></div>
      {message&&<div className={`p-3 rounded-xl text-sm ${message.type==='success'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{message.text}</div>}

      <Modal open={showInvite} onClose={()=>setShowInvite(false)} title="Add Team Member" footer={<><button onClick={()=>setShowInvite(false)} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'#f3f4f6',cursor:'pointer',fontSize:14}}>Cancel</button><button type="submit" form="invite-form" disabled={inviting} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'#4f46e5',color:'white',cursor:'pointer',fontSize:14,fontWeight:500}}>{inviting?'Adding...':'Add Member'}</button></>}>
        <form id="invite-form" onSubmit={handleSubmit(onInvite)} style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>First Name <span style={{color:'#ef4444'}}>*</span></label><input {...register('first_name')} style={inputS} />{errors.first_name&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.first_name.message}</p>}</div>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Last Name <span style={{color:'#ef4444'}}>*</span></label><input {...register('last_name')} style={inputS} />{errors.last_name&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.last_name.message}</p>}</div>
          </div>
          <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Email <span style={{color:'#ef4444'}}>*</span></label><input {...register('email')} type="email" style={inputS} />{errors.email&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.email.message}</p>}</div>
          <div>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Password <span style={{color:'#ef4444'}}>*</span></label>
            <div style={{display:'flex',gap:8}}>
              <div style={{position:'relative',flex:1}}>
                <input {...register('password')} type={showPw?'text':'password'} style={{...inputS,paddingRight:40}} placeholder="Min 8 characters" />
                <button type="button" onClick={()=>setShowPw(!showPw)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:12}}>{showPw?<EyeOff size={16}/>:<Eye size={16}/>}</button>
              </div>
              <button type="button" onClick={()=>setValue('password',generatePassword())} style={{padding:'10px 14px',borderRadius:10,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:12,whiteSpace:'nowrap'}}>Generate</button>
            </div>
            {errors.password&&<p style={{fontSize:12,color:'#ef4444',margin:'4px 0 0'}}>{errors.password.message}</p>}
            <p style={{fontSize:11,color:'#9ca3af',margin:'4px 0 0'}}>User will be prompted to change password on first login</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Role <span style={{color:'#ef4444'}}>*</span></label><select {...register('role')} style={inputS}><option value="MEMBER">Member</option><option value="TEAM_LEADER">Team Leader</option>{isAdmin&&<option value="ADMIN">Admin</option>}</select></div>
            <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Title <span style={{color:'#9ca3af'}}>(optional)</span></label><select {...register('title')} style={inputS}><option value="">Select</option><option value="TECHNICAL_SUPPORT">Technical Support</option><option value="INTERN">Intern</option><option value="ANALYST">Analyst</option><option value="ENGINEER">Engineer</option><option value="MANAGER">Manager</option><option value="DIRECTOR">Director</option></select></div>
          </div>
          <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}><Building2 className="h-3 w-3 inline mr-1" />Department <span style={{color:'#9ca3af'}}>(optional)</span></label><select {...register('department_id')} style={inputS}><option value="">Select department</option>{departments.filter(d=>(d as any).is_active!==false).map(d=><option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</select></div>
        </form>
      </Modal>

      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',backgroundColor:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,maxWidth:400}}><Search className="h-4 w-4 text-gray-400" /><input type="text" placeholder="Search by name or email..." value={search} onChange={(e)=>setSearch(e.target.value)} style={{flex:1,border:'none',background:'transparent',outline:'none',fontSize:14}} /></div>

      {loading?<div className="card p-12 text-center text-gray-500">Loading...</div>:filtered.length===0?<div className="card p-12 text-center"><Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">No team members found.</p>{canManage&&<button onClick={()=>setShowInvite(true)} className="btn btn-primary mt-4"><Plus className="h-4 w-4" /> Add your first member</button>}</div>:(
        <div className="space-y-3">{filtered.map(member=>(
          <div key={member.id} className="card overflow-hidden">
            <div className="p-5"><div className="flex items-start justify-between"><div className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{initials(member.full_name)}</div><div><div className="flex items-center gap-2"><h3 className="font-semibold">{member.full_name}</h3><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColor[member.role]||'bg-gray-100'}`}>{member.role_display}</span></div><div className="flex items-center gap-3 mt-1 text-sm text-gray-500"><span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {member.email}</span><span>·</span><span>{member.display_title}</span>{member.departments&&member.departments.length>0&&<><span>·</span><span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {member.departments[0].name}</span></>}</div></div></div><div className="flex items-center gap-3"><div className="text-right"><p className="text-xs text-gray-400">Progress</p><p className={`text-lg font-bold ${member.kpi_progress!=null?(member.kpi_progress>=85?'text-emerald-600':member.kpi_progress>=75?'text-amber-600':'text-red-600'):'text-gray-400'}`}>{member.kpi_progress!=null?`${member.kpi_progress}%`:'—'}</p></div><button onClick={()=>setExpandedUser(expandedUser===member.id?null:member.id)} className="p-2 hover:bg-gray-100 rounded-lg">{expandedUser===member.id?<ChevronDown className="h-4 w-4" />:<ChevronRight className="h-4 w-4" />}</button></div></div></div>
            {expandedUser===member.id&&canManage&&(
              <div className="border-t bg-gray-50 p-5">
                {editingUser===member.id?(
                  <div className="space-y-3"><div className="flex items-center gap-3 flex-wrap"><select value={editRole} onChange={(e)=>setEditRole(e.target.value)} style={inputS}><option value="MEMBER">Member</option><option value="TEAM_LEADER">Team Leader</option>{isAdmin&&<option value="ADMIN">Admin</option>}</select><select value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} style={inputS}><option value="">Title</option>{['TECHNICAL_SUPPORT','INTERN','ANALYST','ENGINEER','MANAGER','DIRECTOR'].map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}</select><select value={editDept} onChange={(e)=>setEditDept(e.target.value)} style={inputS}><option value="">Department</option>{departments.filter(d=>(d as any).is_active!==false).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div className="flex gap-2"><button onClick={()=>handleAssignRole(member.id)} className="btn btn-primary text-sm py-2">Save</button><button onClick={()=>setEditingUser(null)} className="btn btn-ghost text-sm">Cancel</button></div></div>
                ):(
                  <div className="flex items-center gap-3"><button onClick={()=>{setEditingUser(member.id);setEditRole(member.role);setEditTitle(member.title);setEditDept(member.departments?.[0]?.id||'')}} className="btn btn-ghost text-sm"><Shield className="h-4 w-4" /> Change Role</button><button onClick={()=>{apiClient.patch(`/auth/users/${member.id}/`,{is_active:!member.is_active});fetchTeam()}} className={`btn btn-ghost text-sm ${member.is_active?'text-red-500':'text-emerald-500'}`}>{member.is_active?<><UserX className="h-4 w-4" /> Deactivate</>:<><UserCheck className="h-4 w-4" /> Activate</>}</button></div>
                )}
              </div>
            )}
          </div>
        ))}</div>
      )}
    </div>
  )
}