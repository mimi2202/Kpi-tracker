import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  try {
    const stored = JSON.parse(localStorage.getItem('ips-auth') || '{}')
    const token = stored?.state?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch {}
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const stored = JSON.parse(localStorage.getItem('ips-auth') || '{}')
        const refresh = stored?.state?.refresh
        if (refresh && !error.config._retry) {
          error.config._retry = true
          const res = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh })
          const newToken = res.data.access
          // Update store
          stored.state.token = newToken
          localStorage.setItem('ips-auth', JSON.stringify(stored))
          error.config.headers.Authorization = `Bearer ${newToken}`
          return apiClient(error.config)
        }
      } catch {}
      // Clear and redirect only on real auth failure
      localStorage.removeItem('ips-auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
