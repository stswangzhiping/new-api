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
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  X,
} from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  getAdminBilling,
  getBillingRedemptions,
  getBillingUsers,
  getSelfBilling,
} from './api'
import { downloadBillingPdf, formatBillingAmount } from './pdf'
import type {
  BillingRecord,
  BillingUser,
  ModelBreakdownItem,
  PageInfo,
} from './types'

function parseBreakdown(value: string): ModelBreakdownItem[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? (parsed as ModelBreakdownItem[]) : []
  } catch {
    return []
  }
}

function formatTimestamp(timestamp: number, locale?: string): string {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString(locale, { hour12: false })
}

function readPageItems<T>(data: PageInfo<T> | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.items || []
}

function getUserLabel(user?: BillingUser): string {
  if (!user) return ''
  return user.username || user.display_name || String(user.id)
}

export function Billing() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const authUser = useAuthStore((state) => state.auth.user)
  const isAdmin = (authUser?.role ?? 0) >= ROLE.ADMIN
  const [username, setUsername] = useState('')
  const [submittedUsername, setSubmittedUsername] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pdfLoading, setPdfLoading] = useState<Set<number>>(new Set())

  const usersQuery = useQuery({
    queryKey: ['billing-users'],
    queryFn: () => getBillingUsers(),
    enabled: isAdmin,
  })
  const users = readPageItems(usersQuery.data?.data)
  const userMap = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users]
  )
  const exactUserId = useMemo(() => {
    if (!isAdmin || !submittedUsername.trim()) return ''
    const keyword = submittedUsername.trim().toLowerCase()
    const matches = users.filter(
      (user) =>
        String(user.id) === keyword ||
        user.username?.toLowerCase() === keyword ||
        user.display_name?.toLowerCase() === keyword
    )
    return matches.length === 1 ? String(matches[0].id) : ''
  }, [isAdmin, submittedUsername, users])

  const billingQuery = useQuery({
    queryKey: ['monthly-billing', isAdmin, exactUserId],
    queryFn: async () => {
      if (isAdmin) {
        const response = requireServerSuccess(
          await getAdminBilling(1, 500, exactUserId)
        )
        return readPageItems(response.data)
      }
      const response = requireServerSuccess(await getSelfBilling())
      return response.data ?? []
    },
  })

  const records = useMemo(() => {
    const items = billingQuery.data ?? []
    const keyword = submittedUsername.trim().toLowerCase()
    if (!isAdmin || !keyword || exactUserId) return items
    return items.filter((record) => {
      const user = userMap[record.user_id]
      return (
        String(record.user_id).includes(keyword) ||
        user?.username?.toLowerCase().includes(keyword) ||
        user?.display_name?.toLowerCase().includes(keyword)
      )
    })
  }, [billingQuery.data, exactUserId, isAdmin, submittedUsername, userMap])

  const applySearch = () => setSubmittedUsername(username.trim())

  const resetSearch = () => {
    setUsername('')
    setSubmittedUsername('')
  }

  const handleDownloadPdf = async (record: BillingRecord) => {
    if (pdfLoading.has(record.id)) return
    setPdfLoading((current) => new Set(current).add(record.id))
    try {
      const response = requireServerSuccess(
        await getBillingRedemptions(isAdmin ? record.user_id : undefined)
      )
      const monthStart =
        new Date(record.year, record.month - 1, 1).getTime() / 1000
      const monthEnd = new Date(record.year, record.month, 1).getTime() / 1000
      const topups = readPageItems(response.data).filter(
        (item) =>
          item.redeemed_time >= monthStart && item.redeemed_time < monthEnd
      )
      const currentUser: BillingUser = {
        id: authUser?.id || record.user_id,
        username: authUser?.username,
        display_name: authUser?.display_name,
      }
      await downloadBillingPdf({
        record,
        user: isAdmin ? userMap[record.user_id] || currentUser : currentUser,
        topups,
      })
      toast.success(t('PDF downloaded'))
    } catch (error) {
      handleServerError(error, t('Failed to download PDF'))
    } finally {
      setPdfLoading((current) => {
        const next = new Set(current)
        next.delete(record.id)
        return next
      })
    }
  }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Billing')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          {isAdmin && (
            <div className='flex flex-wrap items-end gap-2'>
              <div className='grid gap-1'>
                <span className='text-muted-foreground text-xs'>
                  {t('Username or user ID')}
                </span>
                <Input
                  className='w-56'
                  value={username}
                  placeholder={t('Username or user ID')}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && applySearch()}
                />
              </div>
              <Button type='button' variant='outline' onClick={applySearch}>
                <Search aria-hidden='true' />
                {t('Search')}
              </Button>
              <Button type='button' variant='ghost' onClick={resetSearch}>
                <X aria-hidden='true' />
                {t('Reset')}
              </Button>
            </div>
          )}

          <Card className='min-h-0 flex-1 overflow-hidden'>
            <CardContent className='flex h-full min-h-0 flex-col p-0'>
              <div className='min-h-0 flex-1 overflow-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10' />
                      <TableHead>{t('Month')}</TableHead>
                      {isAdmin && <TableHead>{t('Username')}</TableHead>}
                      <TableHead className='text-right'>
                        {t('Opening balance')} ($)
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Top-up')} ($)
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Usage')} ($)
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Closing balance')} ($)
                      </TableHead>
                      <TableHead>{t('Generated at')}</TableHead>
                      <TableHead className='text-center'>
                        {t('Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 9 : 8}>
                          <div className='text-muted-foreground py-10 text-center text-sm'>
                            {t('Loading...')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 9 : 8}>
                          <div className='text-muted-foreground py-10 text-center text-sm'>
                            {t('No billing records found')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((record: BillingRecord) => {
                        const breakdown = parseBreakdown(
                          record.model_breakdown
                        )
                        const expanded = expandedId === record.id
                        return (
                          <Fragment key={record.id}>
                            <TableRow>
                              <TableCell>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  disabled={breakdown.length === 0}
                                  aria-expanded={expanded}
                                  aria-label={t('Toggle model details')}
                                  onClick={() =>
                                    setExpandedId(
                                      expanded ? null : record.id
                                    )
                                  }
                                >
                                  {expanded ? (
                                    <ChevronDown aria-hidden='true' />
                                  ) : (
                                    <ChevronRight aria-hidden='true' />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className='font-mono font-medium'>
                                {record.year}-
                                {String(record.month).padStart(2, '0')}
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  {getUserLabel(userMap[record.user_id]) ||
                                    record.user_id}
                                </TableCell>
                              )}
                              <TableCell className='text-right font-mono'>
                                {formatBillingAmount(record.opening_quota)}
                              </TableCell>
                              <TableCell className='text-right'>
                                <div className='font-mono font-semibold text-green-600'>
                                  {record.topup_total > 0 ? '+' : ''}
                                  {formatBillingAmount(record.topup_total)}
                                </div>
                                {(record.topup_purchase > 0 ||
                                  record.topup_gift > 0) && (
                                  <div className='text-muted-foreground text-xs'>
                                    {t('Purchase')}{' '}
                                    {formatBillingAmount(
                                      record.topup_purchase
                                    )}{' '}
                                    · {t('Gift')}{' '}
                                    {formatBillingAmount(record.topup_gift)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className='text-right font-mono text-red-600'>
                                {formatBillingAmount(record.used_quota)}
                              </TableCell>
                              <TableCell className='text-primary text-right font-mono font-semibold'>
                                {formatBillingAmount(record.closing_quota)}
                              </TableCell>
                              <TableCell className='font-mono text-xs'>
                                {formatTimestamp(record.generated_at, locale)}
                              </TableCell>
                              <TableCell className='text-center'>
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  disabled={pdfLoading.has(record.id)}
                                  onClick={() => handleDownloadPdf(record)}
                                >
                                  <Download aria-hidden='true' />
                                  PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                            {expanded && (
                              <TableRow>
                                <TableCell colSpan={isAdmin ? 9 : 8}>
                                  <div className='bg-muted/40 rounded-md p-3'>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>{t('Model')}</TableHead>
                                          <TableHead className='text-right'>
                                            {t('Calls')}
                                          </TableHead>
                                          <TableHead className='text-right'>
                                            {t('Input tokens')}
                                          </TableHead>
                                          <TableHead className='text-right'>
                                            {t('Output tokens')}
                                          </TableHead>
                                          <TableHead className='text-right'>
                                            {t('Cost')} ($)
                                          </TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {breakdown.map((item) => (
                                          <TableRow key={item.model}>
                                            <TableCell>
                                              <Badge variant='outline'>
                                                {item.model}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className='text-right'>
                                              {item.calls.toLocaleString(locale)}
                                            </TableCell>
                                            <TableCell className='text-right'>
                                              {item.promptTokens.toLocaleString(
                                                locale
                                              )}
                                            </TableCell>
                                            <TableCell className='text-right'>
                                              {item.completionTokens.toLocaleString(
                                                locale
                                              )}
                                            </TableCell>
                                            <TableCell className='text-right font-mono text-red-600'>
                                              {formatBillingAmount(item.quota)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
