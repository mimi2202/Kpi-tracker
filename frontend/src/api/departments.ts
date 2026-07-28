// frontend/src/api/departments.ts
import { apiClient } from './client'
import type { Department, PaginatedResponse } from '../types'

export const departmentsApi = {
  list: (params?: Record<string, any>) =>
    apiClient.get<PaginatedResponse<Department>>('/departments/', { params }),

  get: (id: string) =>
    apiClient.get<Department>(`/departments/${id}/`),

  create: (data: Partial<Department>) =>
    apiClient.post<Department>('/departments/', data),

  update: (id: string, data: Partial<Department>) =>
    apiClient.patch<Department>(`/departments/${id}/`, data),

  delete: (id: string) =>
    apiClient.delete(`/departments/${id}/`),
}
