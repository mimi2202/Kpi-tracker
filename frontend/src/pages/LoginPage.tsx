// frontend/src/pages/LoginPage.tsx
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { Building2, User, ArrowRight, Eye, EyeOff } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [mode, setMode] = useState<'choose' | 'login'>('choose')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Selectors, not destructuring — subscribe to just what we read so the
  // redirect below reacts the instant the token is set.
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const setAuth = useAuthStore((s) => s.setAuth)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // State-driven redirect: once persist has hydrated and a token exists,
  // leave the login page. No imperative navigate(), so there's no timing to
  // race — this fires purely as a function of store state.
  if (hasHydrated && token) return <Navigate to="/dashboard" replace />

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(data.email, data.password)
      const { access, refresh, user } = res.data

      // Fetch org details (non-fatal)
      let orgName = ''
      let orgId = ''
      if (user.organisation) {
        try {
          const orgRes = await apiClient.get(`/auth/organisations/${user.organisation}/`)
          orgName = orgRes.data.name
          orgId = orgRes.data.id
        } catch { /* proceed without org name */ }
      }

      // Setting the token flips the <Navigate> guard above → redirect happens.
      setAuth(access, refresh, { ...user, organisation_name: orgName, organisation_id: orgId })
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0] || 'Invalid credentials')
      setLoading(false) // only reset on failure; success unmounts via redirect
    }
  }

  if (mode === 'choose') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-ground))] px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--accent))] shadow-xl shadow-[hsl(var(--accent-glow))] mb-6">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--text-primary))] mb-2">Welcome to IPS KPI</h1>
          <p className="text-[hsl(var(--text-tertiary))] mb-10">Choose how you want to continue</p>

          <div className="space-y-4">
            <button onClick={() => setMode('login')} className="card card-interactive p-6 w-full text-left flex items-center gap-4 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--accent-light))] group-hover:bg-[hsl(var(--accent))] transition-colors">
                <Building2 className="h-6 w-6 text-[hsl(var(--accent))] group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Sign in to Organization</h3>
                <p className="text-sm text-[hsl(var(--text-tertiary))]">Access your team workspace</p>
              </div>
              <ArrowRight className="h-5 w-5 text-[hsl(var(--text-tertiary))] group-hover:text-[hsl(var(--accent))]" />
            </button>

            <Link to="/signup" className="card card-interactive p-6 w-full text-left flex items-center gap-4 group block">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-500 transition-colors">
                <User className="h-6 w-6 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Create Organization</h3>
                <p className="text-sm text-[hsl(var(--text-tertiary))]">Set up a new workspace for your team</p>
              </div>
              <ArrowRight className="h-5 w-5 text-[hsl(var(--text-tertiary))] group-hover:text-emerald-500" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-ground))] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <button onClick={() => setMode('choose')} className="text-sm text-[hsl(var(--accent))] hover:underline mb-4 inline-block">← Back</button>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent))] shadow-lg mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Sign In</h1>
          <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">Access your organization</p>
        </div>

        <div className="card p-6">
          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Work Email</label>
              <input type="email" {...register('email')} className="input-field border" placeholder="you@company.com" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} {...register('password')} className="input-field border w-full" placeholder="Enter password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-tertiary))]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[hsl(var(--text-tertiary))] mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-[hsl(var(--accent))] font-medium hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}