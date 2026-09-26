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
import { api, getSelf } from '@/lib/api'

import type {
  ApiResponse,
  PageInfo,
  RedemptionRecord,
  TopupGiftLog,
  UserSelf,
  UserSummary,
} from './types'

function pageParams(page: number, pageSize: number): URLSearchParams {
  return new URLSearchParams({
    p: String(page),
    page_size: String(pageSize),
  })
}

export async function getSelfRedemptions(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<RedemptionRecord>>> {
  const res = await api.get<ApiResponse<PageInfo<RedemptionRecord>>>(
    `/api/redemption/self?${pageParams(page, pageSize).toString()}`
  )
  return res.data
}

export async function getSelfTopupGiftLogs(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<TopupGiftLog> | TopupGiftLog[]>> {
  const params = pageParams(page, pageSize)
  params.set('type', '4')
  const res = await api.get<
    ApiResponse<PageInfo<TopupGiftLog> | TopupGiftLog[]>
  >(`/api/log/self?${params.toString()}`)
  return res.data
}

export async function getAdminRedemptions(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<RedemptionRecord>>> {
  const res = await api.get<ApiResponse<PageInfo<RedemptionRecord>>>(
    `/api/redemption/?${pageParams(page, pageSize).toString()}`
  )
  return res.data
}

export async function getAdminTopupGiftLogs(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<TopupGiftLog> | TopupGiftLog[]>> {
  const params = pageParams(page, pageSize)
  params.set('type', '4')
  const res = await api.get<
    ApiResponse<PageInfo<TopupGiftLog> | TopupGiftLog[]>
  >(`/api/log/?${params.toString()}`)
  return res.data
}

export async function getAdminUsers(
  page: number,
  pageSize: number
): Promise<ApiResponse<PageInfo<UserSummary> | UserSummary[]>> {
  const res = await api.get<ApiResponse<PageInfo<UserSummary> | UserSummary[]>>(
    `/api/user/?${pageParams(page, pageSize).toString()}`
  )
  return res.data
}

export async function getSelfUser(): Promise<ApiResponse<UserSelf>> {
  return (await getSelf()) as ApiResponse<UserSelf>
}
