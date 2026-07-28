// frontend/src/api/dashboard.ts
import { apiClient } from './client'
import type { KPIResult, PaginatedResponse } from '../types'

export interface DashboardSummary {
  average_achievement: number | null
  on_track_count: number
  at_risk_count: number
  off_track_count: number
  no_data_count: number
  previous_average: number | null
  trend: string
    team_breakdown?: Array<{
    user_id: string
    name: string
    email: string
    role: string
    achievement: number | null
    kpi_count: number
    on_track: number
    at_risk: number
    off_track: number
      }>
}

export interface DepartmentScore {
  id: string
  department: any
  average_achievement: number | null
  composite_score: number | null
  rag_status: string
  total_kpis: number
  on_track_count: number
  at_risk_count: number
  off_track_count: number
  trend: string
  outstanding_actions: number
}

export interface TrendDataPoint {
  period_label: string
  achievement: number | null
  target: number
  department_name: string
  department_colour: string
}

export const dashboardApi = {
  getSummary: (params: Record<string, any>) =>
    apiClient.get<DashboardSummary>('/dashboard/summary/', { params }),

  getDepartments: (params: Record<string, any>) =>
    apiClient.get<DepartmentScore[]>('/dashboard/departments/', { params }),

  getTrends: (params: Record<string, any>) =>
    apiClient.get<TrendDataPoint[]>('/dashboard/trends/', { params }),

  getKPIs: (params: Record<string, any>) =>
    apiClient.get<PaginatedResponse<KPIResult>>('/dashboard/kpis/', { params }),

  getScorecard: (params: Record<string, any>) =>
    apiClient.get<any>('/dashboard/scorecard/', { params }),
}
