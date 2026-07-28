// frontend/src/api/results.ts
import { apiClient } from './client'
import type { KPIResult, PaginatedResponse } from '../types'

export const resultsApi = {
  list: (params: Record<string, any>) =>
    apiClient.get<PaginatedResponse<KPIResult>>('/results/', { params }),

  get: (id: string) =>
    apiClient.get<KPIResult>(`/results/${id}/`),

  update: (id: string, data: Partial<KPIResult>) =>
    apiClient.patch<KPIResult>(`/results/${id}/`, data),

  bulkSave: (results: Array<any>) =>
    apiClient.post('/results/bulk_save/', { results }),

  submit: (id: string) =>
    apiClient.post(`/results/${id}/submit/`),

  bulkSubmit: (data: { result_ids?: string[]; period_id?: string }) =>
    apiClient.post('/results/bulk_submit/', data),

  approve: (id: string, level: string = 'department') =>
    apiClient.post(`/results/${id}/approve/`, { level }),
  syncMyResults: (data: { period_id: string }) =>
    apiClient.post('/results/sync_my_results/', data),

  returnResult: (id: string, reason: string) =>
    apiClient.post(`/results/${id}/return-result/`, { reason }),
}



