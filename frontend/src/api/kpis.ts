// frontend/src/api/kpis.ts
import { apiClient } from './client'
import type { KPI, PaginatedResponse } from '../types'

export const kpisApi = {
  list: (params?: Record<string, any>) =>
    apiClient.get<PaginatedResponse<KPI>>('/kpis/', { params }),

  get: (id: string) =>
    apiClient.get<KPI>(`/kpis/${id}/`),

  create: (data: Partial<KPI>) =>
    apiClient.post<KPI>('/kpis/', data),

  update: (id: string, data: Partial<KPI>) =>
    apiClient.patch<KPI>(`/kpis/${id}/`, data),

  archive: (id: string) =>
    apiClient.post(`/kpis/${id}/archive/`),

  restore: (id: string) =>
    apiClient.post(`/kpis/${id}/restore/`),
}
