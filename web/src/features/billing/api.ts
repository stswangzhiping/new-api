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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  BillingRecord,
  BillingRedemption,
  BillingUser,
  PageInfo,
} from './types'

export async function getSelfBilling(): Promise<ApiResponse<BillingRecord[]>> {
  const response = await api.get<ApiResponse<BillingRecord[]>>(
    '/api/billing/self'
  )
  return response.data
}

export async function getAdminBilling(
  page: number,
  pageSize: number,
  userId: string
): Promise<ApiResponse<PageInfo<BillingRecord>>> {
  const params = new URLSearchParams({
    p: String(page),
    page_size: String(pageSize),
  })
  if (userId) params.set('user_id', userId)
  const response = await api.get<ApiResponse<PageInfo<BillingRecord>>>(
    `/api/billing/?${params.toString()}`
  )
  return response.data
}

export async function getBillingUsers(
  pageSize = 500
): Promise<ApiResponse<PageInfo<BillingUser> | BillingUser[]>> {
  const params = new URLSearchParams({ p: '1', page_size: String(pageSize) })
  const response = await api.get<
    ApiResponse<PageInfo<BillingUser> | BillingUser[]>
  >(`/api/user/?${params.toString()}`)
  return response.data
}

export async function getBillingRedemptions(
  userId?: number
): Promise<ApiResponse<PageInfo<BillingRedemption> | BillingRedemption[]>> {
  const params = new URLSearchParams({ p: '1', page_size: '500' })
  if (userId) params.set('used_user_id', String(userId))
  const path = userId ? '/api/redemption/' : '/api/redemption/self'
  const response = await api.get<
    ApiResponse<PageInfo<BillingRedemption> | BillingRedemption[]>
  >(`${path}?${params.toString()}`)
  return response.data
}
