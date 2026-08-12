export interface BillingRecord {
  id: number
  user_id: number
  year: number
  month: number
  opening_quota: number
  closing_quota: number
  topup_total: number
  topup_purchase: number
  topup_gift: number
  used_quota: number
  model_breakdown: string
  generated_at: number
}

export interface PageInfo<T> {
  items?: T[]
  total?: number
}

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

export interface ModelBreakdownItem {
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  quota: number
}
