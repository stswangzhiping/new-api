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
export interface PageInfo<T> {
  items?: T[]
  total?: number
}

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

export interface UserSelf {
  quota?: number
}

export interface RedemptionRecord {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  quota: number
  created_time: number
  redeemed_time: number
  used_user_id: number
  expired_time: number
  cc_source?: number
}

export interface TopupGiftLog {
  id: number
  user_id: number
  created_at: number
  quota: number
  content?: string
}

export type TopupHistoryRecord = RedemptionRecord & {
  source: 'redemption' | 'system'
  row_key: string
  redemption_key: string
}
