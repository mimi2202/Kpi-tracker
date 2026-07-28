// frontend/src/api/periods.ts
import { apiClient } from './client'
import type { PaginatedResponse } from '../types'

export interface ReportingPeriod {
  id: string
  period_type: string
  period_type_display: string
  status: string
  status_display: string
  start_date: string
  end_date: string
  period_label: string
  reporting_year: number
  week_number: number | null
  month_number: number | null
  quarter_number: number | null
  submission_progress: PeriodSummary
}

export interface PeriodSummary {
  total: number
  submitted: number
  missing: number
  percentage: number
}

export const periodsApi = {
  list: (params?: Record<string, any>) =>
    apiClient.get<PaginatedResponse<ReportingPeriod>>('/periods/', { params }),

  get: (id: string) =>
    apiClient.get<ReportingPeriod>(`/periods/${id}/`),

  create: (data: Partial<ReportingPeriod>) =>
    apiClient.post<ReportingPeriod>('/periods/', data),

  open: (id: string) =>
    apiClient.post(`/periods/${id}/open/`),

  lock: (id: string) =>
    apiClient.post(`/periods/${id}/lock/`),

  reopen: (id: string, reason: string) =>
    apiClient.post(`/periods/${id}/reopen/`, { reason }),
}
