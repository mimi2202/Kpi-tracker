import { useState, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { User, Lock, Palette, Bell, Save, Camera, Building2 } from 'lucide-react'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: checked ? '#4f46e5' : '#d1d5db', position: 'relative', transition: 'background-color 0.2s' }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({ first_name: user?.first_name || '', last_name: user?.last_name || '', email: user?.email || '', phone: (user as any)?.phone || '', current_password: '', new_password: '', confirm_password: '', email_notifications: true, period_reminders: true, dark_mode: false })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [orgLogo, setOrgLogo] = useState<File | null>(null)
  const [orgLogoPreview, setOrgLogoPreview] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'organisation', label: 'Organization', icon: Building2, adminOnly: true },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ]

  const handleOrgLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setOrgLogo(f); const r = new FileReader(); r.onload = () => setOrgLogoPreview(r.result as string); r.readAsDataURL(f) } }
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setAvatar(f); const r = new FileReader(); r.onload = () => setAvatarPreview(r.result as string); r.readAsDataURL(f) } }

  const handleSave = async () => {
    setSaving(true); setMessage(null)
    try {
      if (tab === 'organisation' && orgLogo) {
        const fd = new FormData(); fd.append('logo', orgLogo)
        await apiClient.patch('/auth/organisations/' + ((user as any)?.organisation_id || '') + '/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setOrgLogo(null); setOrgLogoPreview(null)
        setMessage({ type: 'success', text: 'Logo updated. Refresh to see it in sidebar.' })
      } else if (tab === 'profile') {
        if (avatar) { const fd = new FormData(); fd.append('avatar', avatar); fd.append('first_name', form.first_name); fd.append('last_name', form.last_name); fd.append('phone', form.phone); await apiClient.patch('/auth/users/' + user?.id + '/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
        else { await apiClient.patch('/auth/users/' + user?.id + '/', { first_name: form.first_name, last_name: form.last_name, phone: form.phone }) }
        setAvatar(null)
      } else if (tab === 'password') {
        if (form.new_password !== form.confirm_password) { setMessage({ type: 'error', text: 'Passwords do not match' }); setSaving(false); return }
        await apiClient.post('/auth/users/change_password/', { current_password: form.current_password, new_password: form.new_password })
      }
      setMessage({ type: 'success', text: 'Saved' })
    } catch (err: any) { setMessage({ type: 'error', text: err.response?.data?.errors?.[0] || 'Save failed' }) }
    finally { setSaving(false); setTimeout(() => setMessage(null), 3000) }
  }

  const inputStyle = { width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', marginBottom: 12 }
  const initials = (user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-gray-500 mt-0.5">Manage your account</p></div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div className="card p-2 space-y-1">
            {tabs.filter(t => !t.adminOnly || user?.role === 'ADMIN').map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, backgroundColor: tab === t.id ? '#e0e7ff' : 'transparent', color: tab === t.id ? '#4f46e5' : '#374151', textAlign: 'left' as const }}>
                <t.icon size={16} />{t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 300 }} className="card p-6">
          {message && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14, backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2', color: message.type === 'success' ? '#065f46' : '#991b1b' }}>{message.text}</div>}

          {tab === 'profile' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, backgroundImage: avatarPreview ? 'url(' + avatarPreview + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>{!avatarPreview && initials}</div>
                  <button onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'white', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Camera size={12} color="#6b7280" /></button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                </div>
                <div><p style={{ fontSize: 18, fontWeight: 600 }}>{user?.full_name}</p><p style={{ fontSize: 14, color: '#6b7280' }}>{user?.role?.replace(/_/g, ' ')}</p>{avatar && <button onClick={handleSave} style={{ fontSize: 12, color: '#4f46e5', border: 'none', background: 'none', cursor: 'pointer', marginTop: 4 }}>Save photo</button>}</div>
              </div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>First Name</label><input value={form.first_name} onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Last Name</label><input value={form.last_name} onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Email</label><input value={form.email} disabled style={{ ...inputStyle, backgroundColor: '#f9fafb', color: '#9ca3af' }} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Phone</label><input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
            </div>
          )}

          {tab === 'organisation' && user?.role === 'ADMIN' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: orgLogoPreview ? 'url(' + orgLogoPreview + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden', border: '2px dashed #d1d5db' }}>{!orgLogoPreview && <Building2 size={32} color="#9ca3af" />}</div>
                  <button onClick={() => document.getElementById('org-logo-input')?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'white', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Camera size={12} color="#6b7280" /></button>
                  <input id="org-logo-input" type="file" accept="image/*" onChange={handleOrgLogoChange} style={{ display: 'none' }} />
                </div>
                <div><p style={{ fontSize: 16, fontWeight: 600 }}>Company Logo</p><p style={{ fontSize: 13, color: '#6b7280' }}>Upload your organization's logo</p>{orgLogo && <p style={{ fontSize: 12, color: '#4f46e5', marginTop: 4 }}>{orgLogo.name}</p>}</div>
              </div>
            </div>
          )}

          {tab === 'password' && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Current Password</label><input type="password" value={form.current_password} onChange={(e) => setForm(p => ({ ...p, current_password: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>New Password</label><input type="password" value={form.new_password} onChange={(e) => setForm(p => ({ ...p, new_password: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Confirm New Password</label><input type="password" value={form.confirm_password} onChange={(e) => setForm(p => ({ ...p, confirm_password: e.target.value }))} style={inputStyle} />
            </div>
          )}

          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f9fafb', borderRadius: 12 }}><div><p style={{ fontWeight: 500, margin: 0 }}>Dark Mode</p><p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Switch to dark theme</p></div><Toggle checked={form.dark_mode} onChange={(v) => setForm(p => ({ ...p, dark_mode: v }))} /></div>
            </div>
          )}

          {tab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f9fafb', borderRadius: 12 }}><div><p style={{ fontWeight: 500, margin: 0 }}>Email Notifications</p><p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Receive email alerts</p></div><Toggle checked={form.email_notifications} onChange={(v) => setForm(p => ({ ...p, email_notifications: v }))} /></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f9fafb', borderRadius: 12 }}><div><p style={{ fontWeight: 500, margin: 0 }}>Period Reminders</p><p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Remind before period deadlines</p></div><Toggle checked={form.period_reminders} onChange={(v) => setForm(p => ({ ...p, period_reminders: v }))} /></div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}


