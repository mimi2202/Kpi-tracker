// frontend/src/api/auth.ts
import { apiClient } from './client'
import type { LoginResponse, User } from '../types'

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login/', { email, password }),

  logout: (refresh: string) =>
    apiClient.post('/auth/users/logout/', { refresh }),

  refresh: (refresh: string) =>
    apiClient.post('/auth/refresh/', { refresh }),

  getMe: () =>
    apiClient.get<User>('/auth/users/me/'),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/users/forgot_password/', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/users/reset_password/', { token, password }),
}
