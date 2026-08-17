import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'
import { applyTheme, type ThemePreference } from '../lib/theme'
import { User, Lock, Palette, Bell, Save, Camera, Building2, Monitor, Sun, Moon } from 'lucide-react'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: checked ? '#4f46e5' : 'hsl(var(--border-default))', position: 'relative', transition: 'background-color 0.2s' }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    first_name: user?.first_name || '', last_name: user?.last_name || '', email: user?.email || '',
    phone: (user as any)?.phone || '', current_password: '', new_password: '', confirm_password: '',
    email_notifications: (user as any)?.email_notifications ?? true, period_reminders: (user as any)?.period_reminders ?? true,
    theme_preference: ((user as any)?.theme_preference as ThemePreference) || 'system',
  })
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

  // Live preview: applies (and caches) immediately on click, not only after Save.
  const handleThemeChange = (v: ThemePreference) => {
    setForm(p => ({ ...p, theme_preference: v }))
    applyTheme(v)
  }

  // Keeps this in sync if the user object updates from elsewhere (e.g. TopBar
  // refetching /auth/users/me/ on mount).
  useEffect(() => {
    const pref = ((user as any)?.theme_preference as ThemePreference) || 'system'
    setForm(p => ({ ...p, theme_preference: pref }))
  }, [(user as any)?.theme_preference])

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
      } else if (tab === 'appearance') {
        const res = await apiClient.patch('/auth/users/' + user?.id + '/', { theme_preference: form.theme_preference })
        setUser({ ...(user as any), theme_preference: res.data.theme_preference })
      } else if (tab === 'notifications') {
        const res = await apiClient.patch('/auth/users/' + user?.id + '/', {
          email_notifications: form.email_notifications,
          period_reminders: form.period_reminders,
        })
        setUser({ ...(user as any), email_notifications: res.data.email_notifications, period_reminders: res.data.period_reminders })
      }
      setMessage({ type: 'success', text: 'Saved' })
    } catch (err: any) { setMessage({ type: 'error', text: err.response?.data?.errors?.[0] || 'Save failed' }) }
    finally { setSaving(false); setTimeout(() => setMessage(null), 3000) }
  }

  const inputStyle = {
    width: '100%', border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px',
    fontSize: 14, outline: 'none', marginBottom: 12,
    backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))',
  }
  const initials = (user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-gray-500 mt-0.5">Manage your account</p></div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div className="card p-2 space-y-1">
            {tabs.filter(t => !t.adminOnly || user?.role === 'ADMIN').map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, backgroundColor: tab === t.id ? 'hsl(var(--accent-light))' : 'transparent', color: tab === t.id ? '#4f46e5' : 'hsl(var(--text-secondary))', textAlign: 'left' as const }}>
                <t.icon size={16} />{t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 300 }} className="card p-6">
          {message && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14, backgroundColor: message.type === 'success' ? 'hsl(var(--status-on-track-bg))' : 'hsl(var(--status-off-track-bg))', color: message.type === 'success' ? 'hsl(var(--status-on-track))' : 'hsl(var(--status-off-track))' }}>{message.text}</div>}

          {tab === 'profile' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, backgroundImage: avatarPreview ? 'url(' + avatarPreview + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>{!avatarPreview && initials}</div>
                  <button onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Camera size={12} color="hsl(var(--text-secondary))" /></button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                </div>
                <div><p style={{ fontSize: 18, fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{user?.full_name}</p><p style={{ fontSize: 14, color: 'hsl(var(--text-secondary))' }}>{user?.role?.replace(/_/g, ' ')}</p>{avatar && <button onClick={handleSave} style={{ fontSize: 12, color: '#4f46e5', border: 'none', background: 'none', cursor: 'pointer', marginTop: 4 }}>Save photo</button>}</div>
              </div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>First Name</label><input value={form.first_name} onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Last Name</label><input value={form.last_name} onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Email</label><input value={form.email} disabled style={{ ...inputStyle, backgroundColor: 'hsl(var(--surface-ground))', color: 'hsl(var(--text-tertiary))' }} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Phone</label><input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
            </div>
          )}

          {tab === 'organisation' && user?.role === 'ADMIN' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: 'hsl(var(--surface-ground))', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: orgLogoPreview ? 'url(' + orgLogoPreview + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden', border: '2px dashed hsl(var(--border-default))' }}>{!orgLogoPreview && <Building2 size={32} color="hsl(var(--text-tertiary))" />}</div>
                  <button onClick={() => document.getElementById('org-logo-input')?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Camera size={12} color="hsl(var(--text-secondary))" /></button>
                  <input id="org-logo-input" type="file" accept="image/*" onChange={handleOrgLogoChange} style={{ display: 'none' }} />
                </div>
                <div><p style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Company Logo</p><p style={{ fontSize: 13, color: 'hsl(var(--text-secondary))' }}>Upload your organization's logo</p>{orgLogo && <p style={{ fontSize: 12, color: '#4f46e5', marginTop: 4 }}>{orgLogo.name}</p>}</div>
              </div>
            </div>
          )}

          {tab === 'password' && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Current Password</label><input type="password" value={form.current_password} onChange={(e) => setForm(p => ({ ...p, current_password: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>New Password</label><input type="password" value={form.new_password} onChange={(e) => setForm(p => ({ ...p, new_password: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Confirm New Password</label><input type="password" value={form.confirm_password} onChange={(e) => setForm(p => ({ ...p, confirm_password: e.target.value }))} style={inputStyle} />
            </div>
          )}

          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 16, backgroundColor: 'hsl(var(--surface-ground))', borderRadius: 12 }}>
                <p style={{ fontWeight: 500, margin: '0 0 2px', color: 'hsl(var(--text-primary))' }}>Theme</p>
                <p style={{ fontSize: 13, color: 'hsl(var(--text-secondary))', margin: '0 0 14px' }}>System follows your device's setting automatically</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {THEME_OPTIONS.map(opt => {
                    const active = form.theme_preference === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleThemeChange(opt.value)}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
                          border: active ? '1.5px solid #4f46e5' : '1px solid hsl(var(--border-subtle))',
                          backgroundColor: active ? 'hsl(var(--accent-light))' : 'hsl(var(--surface-card))',
                        }}
                      >
                        <opt.icon size={18} color={active ? '#4f46e5' : 'hsl(var(--text-secondary))'} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#4f46e5' : 'hsl(var(--text-primary))' }}>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'hsl(var(--surface-ground))', borderRadius: 12 }}><div><p style={{ fontWeight: 500, margin: 0, color: 'hsl(var(--text-primary))' }}>Email Notifications</p><p style={{ fontSize: 13, color: 'hsl(var(--text-secondary))', margin: 0 }}>Receive email alerts</p></div><Toggle checked={form.email_notifications} onChange={(v) => setForm(p => ({ ...p, email_notifications: v }))} /></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'hsl(var(--surface-ground))', borderRadius: 12 }}><div><p style={{ fontWeight: 500, margin: 0, color: 'hsl(var(--text-primary))' }}>Period Reminders</p><p style={{ fontSize: 13, color: 'hsl(var(--text-secondary))', margin: 0 }}>Remind before period deadlines</p></div><Toggle checked={form.period_reminders} onChange={(v) => setForm(p => ({ ...p, period_reminders: v }))} /></div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid hsl(var(--border-subtle))' }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}