import { api } from '@/lib/api'

import type { ApiResponse, BillingRecord, PageInfo } from './types'

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
