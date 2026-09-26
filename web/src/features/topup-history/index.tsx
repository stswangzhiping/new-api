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
import { ChevronLeft, ChevronRight, ReceiptText, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  REDEMPTION_SOURCE,
  REDEMPTION_SOURCES,
} from '@/features/redemption-codes/constants'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { ROLE } from '@/lib/roles'
import { createServerError } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  getAdminRedemptions,
  getAdminTopupGiftLogs,
  getSelfRedemptions,
  getSelfTopupGiftLogs,
  getSelfUser,
} from './api'
import type {
  PageInfo,
  RedemptionRecord,
  TopupGiftLog,
  TopupHistoryRecord,
} from './types'

const PAGE_SIZE = 20
const HISTORY_FETCH_SIZE = 500

function readPageItems<T>(data: PageInfo<T> | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.items || []
}

function formatTimestamp(timestamp: number | undefined, locale?: string): string {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString(locale, { hour12: false })
}

function formatExpiry(
  timestamp: number | undefined,
  permanentText: string,
  locale?: string
): string {
  if (!timestamp) return permanentText
  return new Date(timestamp * 1000).toLocaleDateString(locale)
}

function toGiftRecord(
  log: TopupGiftLog,
  defaultName: string
): TopupHistoryRecord | null {
  if (log.quota >= 0) return null
  return {
    id: log.id,
    user_id: log.user_id,
    key: '',
    status: 2,
    name: log.content || defaultName,
    quota: Math.abs(log.quota),
    created_time: log.created_at,
    redeemed_time: log.created_at,
    used_user_id: log.user_id,
    expired_time: 0,
    cc_source: -1,
    source: 'system',
    row_key: `system-${log.id}`,
    redemption_key: '',
  }
}

function toRedemptionRecord(record: RedemptionRecord): TopupHistoryRecord {
  return {
    ...record,
    source: 'redemption',
    row_key: `redemption-${record.id}`,
    redemption_key: record.key,
  }
}

export function TopupHistory() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const role = useAuthStore((state) => state.auth.user?.role ?? 0)
  const isAdmin = role >= ROLE.ADMIN
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [startTime, setStartTime] = useState<Date>()
  const [endTime, setEndTime] = useState<Date>()
  const [filters, setFilters] = useState<{
    userId: string
    startTime?: Date
    endTime?: Date
  }>({ userId: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['topup-history', isAdmin],
    queryFn: async () => {
      const [selfResponse, redemptionsResponse, giftLogsResponse] =
        await Promise.all([
          isAdmin ? Promise.resolve(undefined) : getSelfUser(),
          isAdmin
            ? getAdminRedemptions(1, HISTORY_FETCH_SIZE)
            : getSelfRedemptions(1, HISTORY_FETCH_SIZE),
          isAdmin
            ? getAdminTopupGiftLogs(1, HISTORY_FETCH_SIZE)
            : getSelfTopupGiftLogs(1, HISTORY_FETCH_SIZE),
        ])

      if (redemptionsResponse.success === false) {
        throw createServerError(
          redemptionsResponse,
          t('Failed to load redemption codes')
        )
      }
      if (giftLogsResponse.success === false) {
        throw createServerError(giftLogsResponse, t('Failed to load logs'))
      }

      const redemptions = readPageItems(redemptionsResponse.data)
        .filter((record) => record.redeemed_time > 0)
        .map(toRedemptionRecord)
      const giftRecords = readPageItems(giftLogsResponse.data)
        .map((log) => toGiftRecord(log, t('System gift')))
        .filter((record): record is TopupHistoryRecord => Boolean(record))

      return {
        currentQuota: Number(selfResponse?.data?.quota || 0),
        records: [...redemptions, ...giftRecords].sort(
          (left, right) => right.redeemed_time - left.redeemed_time
        ),
      }
    },
  })

  const allRecords = data?.records || []
  const currentQuota = data?.currentQuota || 0
  const filteredRecords = useMemo(() => {
    const userIdFilter = filters.userId.trim()
    const start = filters.startTime ? filters.startTime.getTime() / 1000 : 0
    const end = filters.endTime
      ? filters.endTime.getTime() / 1000
      : Number.POSITIVE_INFINITY
    return allRecords.filter((record) => {
      const matchesUser =
        !userIdFilter || String(record.used_user_id).includes(userIdFilter)
      return (
        matchesUser &&
        record.redeemed_time >= start &&
        record.redeemed_time <= end
      )
    })
  }, [allRecords, filters])
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const records = filteredRecords.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )

  const totalTopup = useMemo(
    () => allRecords.reduce((sum, record) => sum + record.quota, 0),
    [allRecords]
  )
  const purchasedQuota = useMemo(
    () =>
      allRecords
        .filter((record) => record.cc_source === REDEMPTION_SOURCE.PURCHASE)
        .reduce((sum, record) => sum + record.quota, 0),
    [allRecords]
  )
  const giftQuota = totalTopup - purchasedQuota
  const usedQuota = Math.max(0, totalTopup - currentQuota)
  const currentPurchaseQuota =
    usedQuota <= giftQuota
      ? purchasedQuota
      : Math.max(0, totalTopup - usedQuota)
  const currentGiftQuota = Math.max(0, currentQuota - currentPurchaseQuota)

  const applyFilters = () => {
    setFilters({ userId, startTime, endTime })
    setPage(1)
  }

  const resetFilters = () => {
    setUserId('')
    setStartTime(undefined)
    setEndTime(undefined)
    setFilters({ userId: '' })
    setPage(1)
  }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Top-up History')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          {!isAdmin && (
            <div className='grid gap-4 md:grid-cols-3'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-muted-foreground text-sm font-medium'>
                    {t('Current quota')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-primary text-2xl font-semibold'>
                    {formatQuotaWithCurrency(currentQuota, {
                      abbreviate: false,
                    })}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {t('Purchase')}{' '}
                    {formatQuotaWithCurrency(currentPurchaseQuota)} ·{' '}
                    {t('Gift')} {formatQuotaWithCurrency(currentGiftQuota)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-muted-foreground text-sm font-medium'>
                    {t('Used quota')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-destructive text-2xl font-semibold'>
                    {formatQuotaWithCurrency(usedQuota, { abbreviate: false })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-muted-foreground text-sm font-medium'>
                    {t('Total quota')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-semibold'>
                    {formatQuotaWithCurrency(totalTopup, { abbreviate: false })}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {t('Purchase')} {formatQuotaWithCurrency(purchasedQuota)} ·{' '}
                    {t('Gift')} {formatQuotaWithCurrency(giftQuota)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className='flex flex-wrap items-end gap-2'>
            <div className='w-full sm:w-[420px]'>
              <CompactDateTimeRangePicker
                start={startTime}
                end={endTime}
                onChange={(range) => {
                  setStartTime(range.start)
                  setEndTime(range.end)
                }}
              />
            </div>
            {isAdmin && (
              <div className='grid gap-1'>
                <span className='text-muted-foreground text-xs'>
                  {t('User ID')}
                </span>
                <Input
                  className='w-56'
                  value={userId}
                  inputMode='numeric'
                  placeholder={t('User ID')}
                  onChange={(event) => setUserId(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && applyFilters()}
                />
              </div>
            )}
            <Button type='button' variant='outline' onClick={applyFilters}>
              <Search aria-hidden='true' />
              {t('Search')}
            </Button>
            <Button type='button' variant='ghost' onClick={resetFilters}>
              <X aria-hidden='true' />
              {t('Reset')}
            </Button>
          </div>

          <Card className='min-h-0 flex-1 overflow-hidden'>
            <CardContent className='flex h-full min-h-0 flex-col p-0'>
              {isLoading ? (
                <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
                  {t('Loading...')}
                </div>
              ) : filteredRecords.length === 0 ? (
                <Empty className='h-64 border-none'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <ReceiptText aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>{t('No top-up records found')}</EmptyTitle>
                    <EmptyDescription>
                      {t('Your top-up history will appear here.')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <div className='min-h-0 flex-1 overflow-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('Time')}</TableHead>
                          {isAdmin && <TableHead>{t('User ID')}</TableHead>}
                          <TableHead>{t('Redemption Code')}</TableHead>
                          <TableHead>{t('Name')}</TableHead>
                          <TableHead className='text-right'>
                            {t('Quota')}
                          </TableHead>
                          <TableHead>{t('Source')}</TableHead>
                          <TableHead>{t('Expiration Time')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record) => (
                          <TableRow key={record.row_key}>
                            <TableCell className='font-mono text-xs'>
                              {formatTimestamp(record.redeemed_time, locale)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>{record.used_user_id}</TableCell>
                            )}
                            <TableCell className='max-w-[260px] truncate font-mono text-xs'>
                              {record.redemption_key || '-'}
                            </TableCell>
                            <TableCell>{record.name || '-'}</TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatQuotaWithCurrency(record.quota, {
                                abbreviate: false,
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant='outline'>
                                {record.source === 'system'
                                  ? t('System gift')
                                  : t(
                                      REDEMPTION_SOURCES[
                                        record.cc_source ??
                                          REDEMPTION_SOURCE.UNKNOWN
                                      ]?.labelKey ?? 'Unknown'
                                    )}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {formatExpiry(
                                record.expired_time,
                                t('Never expires'),
                                locale
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className='flex items-center justify-between border-t px-4 py-3'>
                    <span className='text-muted-foreground text-sm'>
                      {filteredRecords.length} {t('records')}
                    </span>
                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-label={t('Previous page')}
                        disabled={safePage <= 1}
                        onClick={() =>
                          setPage((value) => Math.max(1, value - 1))
                        }
                      >
                        <ChevronLeft aria-hidden='true' />
                      </Button>
                      <span className='min-w-20 text-center text-sm'>
                        {safePage} / {pageCount}
                      </span>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-label={t('Next page')}
                        disabled={safePage >= pageCount}
                        onClick={() =>
                          setPage((value) => Math.min(pageCount, value + 1))
                        }
                      >
                        <ChevronRight aria-hidden='true' />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
