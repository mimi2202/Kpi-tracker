// frontend/src/types/department.ts
export interface Department {
  id: string
  name: string
  code: string
  description: string
  colour: string
  department_head: string | null
  department_head_name: string
  is_active: boolean
  display_order: number
  weekly_reporting: boolean
  monthly_reporting: boolean
  quarterly_reporting: boolean
  annual_reporting: boolean
  kpi_count: number
  created_at: string
  updated_at: string
}