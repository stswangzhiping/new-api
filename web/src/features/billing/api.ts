import { api } from '@/lib/api'

import type {
  ApiResponse,
  BillingRecord,
  BillingRedemption,
  BillingUser,
  PageInfo,
} from './types'

export async function getSelfBilling(): Promise<ApiResponse<BillingRecord[]>> {
  const res = await api.get('/api/billing/self')
  return res.data
}

export async function getAdminBilling(
  page = 1,
  pageSize = 50,
  userId = ''
): Promise<ApiResponse<PageInfo<BillingRecord>>> {
  const params = new URLSearchParams()
  params.set('p', String(page))
  params.set('page_size', String(pageSize))
  if (userId.trim()) params.set('user_id', userId.trim())
  const res = await api.get(`/api/billing/?${params.toString()}`)
  return res.data
}

export async function getBillingUsers(pageSize = 500) {
  const params = new URLSearchParams({ p: '1', page_size: String(pageSize) })
  const res = await api.get<ApiResponse<PageInfo<BillingUser> | BillingUser[]>>(
    `/api/user/?${params.toString()}`
  )
  return res.data
}

export async function getBillingRedemptions(userId?: number) {
  const params = new URLSearchParams({ p: '1', page_size: '500' })
  const url = userId
    ? `/api/redemption/?${params.toString()}&used_user_id=${userId}`
    : `/api/redemption/self?${params.toString()}`
  const res =
    await api.get<
      ApiResponse<PageInfo<BillingRedemption> | BillingRedemption[]>
    >(url)
  return res.data
}
