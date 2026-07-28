// frontend/src/types/api.ts
export interface PaginatedResponse<T> {
  count: number
  total_pages: number
  current_page: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  errors?: string[]
  message?: string
}

export interface LoginResponse {
  success: boolean
  access: string
  refresh: string
  user: User
}