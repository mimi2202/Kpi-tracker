// frontend/src/types/kpi.ts
export type CalculationDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'EXACT_TARGET' | 'RANGE' | 'BOOLEAN' | 'MANUAL_SCORE'
export type ReportingFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
export type UnitType = 'PERCENTAGE' | 'NUMBER' | 'CURRENCY' | 'HOURS' | 'DAYS' | 'SCORE' | 'RATIO' | 'BOOLEAN' | 'CUSTOM'
export type RAGStatus = 'NO_DATA' | 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'
export type TrendStatus = 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA' | 'NO_DATA'

export interface KPI {
  id: string
  code: string
  name: string
  description: string
  department: string
  department_name: string
  calculation_direction: CalculationDirection
  direction_display: string
  reporting_frequency: ReportingFrequency
  frequency_display: string
  unit_type: UnitType
  unit_display: string
  target_value: number
  warning_threshold: number
  critical_threshold: number
  is_active: boolean
  display_order: number
  weight: number
  evidence_required: boolean
  requires_approval: boolean
  contributes_to_average: boolean
  responsible_person: string | null
  responsible_name: string
  created_at: string
}

export interface KPIResult {
  id: string
  kpi: string
  kpi_code: string
  kpi_name: string
  department: string
  department_name: string
  period: string
  period_label: string
  target_snapshot: number
  actual_value: number | null
  previous_actual_value: number | null
  achievement_percentage: number | null
  variance_display: string
  rag_status: RAGStatus
  rag_display: string
  trend_status: TrendStatus
  trend_icon: string
  submission_status: string
  is_missing: boolean
  responsible_person: string | null
  responsible_name: string
  notes: string
  corrective_action: string
  evidence: string | null
  version_number: number
  created_at: string
  updated_at: string
}

export interface PeriodSummary {
  total: number
  submitted: number
  missing: number
  percentage: number
}