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
import { ReceiptText } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
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
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
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

function readPageItems<T>(data: PageInfo<T> | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.items || []
}

function formatTs(ts?: number) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

function formatExpiry(ts: number | undefined, permanentText: string) {
  if (!ts) return permanentText
  return new Date(ts * 1000).toLocaleDateString('zh-CN')
}

function toGiftRecord(
  log: TopupGiftLog,
  defaultName: string
): TopupHistoryRecord | null {
  if (log.quota >= 0) return null
  const quota = Math.abs(log.quota)
  return {
    id: log.id,
    user_id: log.user_id,
    key: '',
    status: 2,
    name: log.content || defaultName,
    quota,
    created_time: log.created_at,
    redeemed_time: log.created_at,
    used_user_id: log.user_id,
    expired_time: 0,
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
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['topup-history'],
    queryFn: async () => {
      const [selfRes, redemptionsRes, giftLogsRes] = await Promise.all([
        getSelfUser(),
        getSelfRedemptions(),
        getSelfTopupGiftLogs(),
      ])

      if (redemptionsRes.success === false) {
        toast.error(redemptionsRes.message || t('Failed to load redemption codes'))
      }
      if (giftLogsRes.success === false) {
        toast.error(giftLogsRes.message || t('Failed to load logs'))
      }

      const redemptions = readPageItems(redemptionsRes.data).map(
        toRedemptionRecord
      )
      const giftRecords = readPageItems(giftLogsRes.data)
        .map((log) => toGiftRecord(log, t('System gift')))
        .filter((record): record is TopupHistoryRecord => Boolean(record))
      const records = [...redemptions, ...giftRecords].sort(
        (a, b) => b.redeemed_time - a.redeemed_time
      )

      return {
        currentQuota: Number(selfRes?.data?.quota || 0),
        records,
      }
    },
  })

  const records = data?.records || []
  const currentQuota = data?.currentQuota || 0
  const totalTopup = useMemo(
    () => records.reduce((sum, record) => sum + record.quota, 0),
    [records]
  )
  const usedQuota = Math.max(0, totalTopup - currentQuota)
  const purchasedQuota = useMemo(
    () =>
      records
        .filter(
          (record) =>
            record.source === 'redemption' &&
            record.cc_source === REDEMPTION_SOURCE.PURCHASE
        )
        .reduce((sum, record) => sum + record.quota, 0),
    [records]
  )
  const giftQuota = useMemo(
    () =>
      records
        .filter(
          (record) =>
            record.source === 'system' ||
            record.cc_source === REDEMPTION_SOURCE.UNKNOWN ||
            record.cc_source === REDEMPTION_SOURCE.ACTIVITY
        )
        .reduce((sum, record) => sum + record.quota, 0),
    [records]
  )

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Top-up History')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          <div className='grid gap-4 md:grid-cols-3'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-muted-foreground text-sm font-medium'>
                  {t('Current quota')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-primary text-2xl font-semibold'>
                  {formatQuotaWithCurrency(currentQuota, { abbreviate: false })}
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
                  {t('Purchase')} {formatQuotaWithCurrency(purchasedQuota)} -{' '}
                  {t('Gift')} {formatQuotaWithCurrency(giftQuota)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className='min-h-0 flex-1 overflow-hidden'>
            <CardContent className='h-full p-0'>
              {isLoading ? (
                <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
                  {t('Loading...')}
                </div>
              ) : records.length === 0 ? (
                <Empty className='h-64 border-none'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <ReceiptText />
                    </EmptyMedia>
                    <EmptyTitle>{t('No top-up records found')}</EmptyTitle>
                    <EmptyDescription>
                      {t('Your top-up history will appear here.')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='h-full overflow-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Time')}</TableHead>
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
                            {formatTs(record.redeemed_time)}
                          </TableCell>
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
                            {formatExpiry(record.expired_time, t('Never expires'))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
