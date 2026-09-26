/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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

export interface ModelBreakdownItem {
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  quota: number
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

export interface BillingUser {
  id: number
  username?: string
  display_name?: string
}

export interface BillingRedemption {
  id: number
  key: string
  name: string
  quota: number
  redeemed_time: number
  cc_source?: number
}
