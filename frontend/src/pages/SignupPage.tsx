// frontend/src/pages/SignupPage.tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { Building2, Upload, ArrowRight, ArrowLeft, Check, Target } from 'lucide-react'

const orgSchema = z.object({
  organisation_name: z.string().min(2, 'Organization name is required'),
  email: z.string().email('Valid email required'),
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  title: z.string().optional(),
})

type OrgFormData = z.infer<typeof orgSchema>

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const { register, handleSubmit, formState: { errors }, watch } = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
  })

  const orgName = watch('organisation_name')

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogo(file)
      const reader = new FileReader()
      reader.onload = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const onSubmit = async (data: OrgFormData) => {
    setLoading(true)
    setError('')
    try {
      // Create organization + admin user
      const formData = new FormData()
      formData.append('organisation_name', data.organisation_name)
      formData.append('email', data.email)
      formData.append('password', data.password)
      formData.append('first_name', data.first_name)
      formData.append('last_name', data.last_name)
      if (data.title) formData.append('title', data.title)
      if (logo) formData.append('logo', logo)

      const res = await apiClient.post('/auth/users/register/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const { access, refresh, user } = res.data
      setAuth(access, { ...user, organisation_name: res.data.organisation?.name, organisation_id: res.data.organisation?.id })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0] || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-ground))] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent))] shadow-lg shadow-[hsl(var(--accent-glow))]">
            <Target className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[hsl(var(--text-primary))]">
            {step === 1 ? 'Create Your Organization' : 'Create Admin Account'}
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--text-tertiary))]">
            {step === 1 ? 'Set up your workspace' : 'Your administrator account'}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${step >= 1 ? 'bg-[hsl(var(--accent))] text-white' : 'bg-gray-200 text-gray-500'}`}>
            {step > 1 ? <Check className="h-4 w-4" /> : '1'}
          </div>
          <div className={`w-8 h-0.5 ${step >= 2 ? 'bg-[hsl(var(--accent))]' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${step >= 2 ? 'bg-[hsl(var(--accent))] text-white' : 'bg-gray-200 text-gray-500'}`}>
            2
          </div>
        </div>

        {/* Form */}
        <div className="card p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 1 ? (
              <div className="space-y-4">
                {/* Logo Upload */}
                <div className="flex justify-center">
                  <label className="relative cursor-pointer group">
                    <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-[hsl(var(--border-subtle))] flex items-center justify-center overflow-hidden hover:border-[hsl(var(--accent))] transition-colors">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <Upload className="h-6 w-6 mx-auto text-[hsl(var(--text-tertiary))] group-hover:text-[hsl(var(--accent))]" />
                          <span className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1 block">Logo</span>
                        </div>
                      )}
                    </div>
                    <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--text-primary))] mb-1">Organization Name</label>
                  <input {...register('organisation_name')} className="input-field border" placeholder="e.g., IPS Limited" />
                  {errors.organisation_name && <p className="text-xs text-red-500 mt-1">{errors.organisation_name.message}</p>}
                </div>

                <button type="button" onClick={() => setStep(2)} className="btn btn-primary w-full">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-[hsl(var(--accent))]" />
                  <span className="text-sm font-medium text-[hsl(var(--accent))]">{orgName || 'Your Organization'}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">First Name</label>
                    <input {...register('first_name')} className="input-field border" placeholder="System" />
                    {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Name</label>
                    <input {...register('last_name')} className="input-field border" placeholder="Admin" />
                    {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Work Email</label>
                  <input {...register('email')} type="email" className="input-field border" placeholder="admin@company.com" />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input {...register('password')} type="password" className="input-field border" placeholder="Min 8 characters" />
                  {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Your Title (optional)</label>
                  <select {...register('title')} className="input-field border">
                    <option value="">Select title</option>
                    <option value="DIRECTOR">Director</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ENGINEER">Engineer</option>
                    <option value="ANALYST">Analyst</option>
                    <option value="SPECIALIST">Specialist</option>
                    <option value="CONSULTANT">Consultant</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)} className="btn btn-ghost">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Organization'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <p className="text-center text-sm text-[hsl(var(--text-tertiary))] mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-[hsl(var(--accent))] font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}


