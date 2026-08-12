import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
import { formatQuotaWithCurrency } from '@/lib/currency'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { getAdminBilling, getSelfBilling } from './api'
import type { ModelBreakdownItem, PageInfo } from './types'

function readPageItems<T>(data: PageInfo<T> | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.items || []
}

function formatTs(ts?: number) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

function parseBreakdown(json?: string): ModelBreakdownItem[] {
  try {
    const parsed = JSON.parse(json || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function Billing() {
  const { t } = useTranslation()
  const role = useAuthStore((state) => state.auth.user?.role ?? 0)
  const isAdmin = role >= ROLE.ADMIN
  const [userId, setUserId] = useState('')
  const [submittedUserId, setSubmittedUserId] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['billing', isAdmin, submittedUserId],
    queryFn: async () => {
      const res = isAdmin
        ? await getAdminBilling(1, 100, submittedUserId)
        : await getSelfBilling()
      if (res.success === false) {
        toast.error(res.message || t('Failed to load billing history'))
      }
      return readPageItems(res.data)
    },
  })

  const records = data || []
  const totals = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          acc.topup += record.topup_total || 0
          acc.used += record.used_quota || 0
          acc.closing += record.closing_quota || 0
          return acc
        },
        { topup: 0, used: 0, closing: 0 }
      ),
    [records]
  )

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Billing')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          {isAdmin && (
            <div className='flex gap-2'>
              <Input
                className='max-w-64'
                placeholder={t('User ID')}
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setSubmittedUserId(userId.trim())
                }}
              >
                {t('Search')}
              </Button>
            </div>
          )}

          <div className='grid gap-4 md:grid-cols-3'>
            <Card>
              <CardContent className='p-4'>
                <div className='text-muted-foreground text-sm'>
                  {t('Top-up')}
                </div>
                <div className='mt-1 text-xl font-semibold'>
                  {formatQuotaWithCurrency(totals.topup)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='p-4'>
                <div className='text-muted-foreground text-sm'>
                  {t('Used quota')}
                </div>
                <div className='text-destructive mt-1 text-xl font-semibold'>
                  {formatQuotaWithCurrency(totals.used)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='p-4'>
                <div className='text-muted-foreground text-sm'>
                  {t('Closing quota')}
                </div>
                <div className='text-primary mt-1 text-xl font-semibold'>
                  {formatQuotaWithCurrency(totals.closing)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className='min-h-0 flex-1 overflow-hidden'>
            <CardContent className='h-full overflow-auto p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10' />
                    <TableHead>{t('Month')}</TableHead>
                    {isAdmin && <TableHead>{t('User ID')}</TableHead>}
                    <TableHead className='text-right'>
                      {t('Opening quota')}
                    </TableHead>
                    <TableHead className='text-right'>{t('Top-up')}</TableHead>
                    <TableHead className='text-right'>
                      {t('Used quota')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('Closing quota')}
                    </TableHead>
                    <TableHead>{t('Generated at')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 8 : 7}>
                        <div className='text-muted-foreground py-10 text-center text-sm'>
                          {t('Loading...')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 8 : 7}>
                        <div className='text-muted-foreground py-10 text-center text-sm'>
                          {t('No billing records found')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => {
                      const expanded = expandedId === record.id
                      const breakdown = parseBreakdown(record.model_breakdown)
                      return (
                        <Fragment key={record.id}>
                          <TableRow key={record.id}>
                            <TableCell>
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                onClick={() =>
                                  setExpandedId(expanded ? null : record.id)
                                }
                              >
                                {expanded ? (
                                  <ChevronDown className='h-4 w-4' />
                                ) : (
                                  <ChevronRight className='h-4 w-4' />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className='font-mono'>
                              {record.year}-{String(record.month).padStart(2, '0')}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>{record.user_id}</TableCell>
                            )}
                            <TableCell className='text-right'>
                              {formatQuotaWithCurrency(record.opening_quota)}
                            </TableCell>
                            <TableCell className='text-right'>
                              <div>{formatQuotaWithCurrency(record.topup_total)}</div>
                              {(record.topup_purchase > 0 ||
                                record.topup_gift > 0) && (
                                <div className='text-muted-foreground text-xs'>
                                  {t('Purchase')}{' '}
                                  {formatQuotaWithCurrency(
                                    record.topup_purchase
                                  )}{' '}
                                  · {t('Gift')}{' '}
                                  {formatQuotaWithCurrency(record.topup_gift)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className='text-right'>
                              {formatQuotaWithCurrency(record.used_quota)}
                            </TableCell>
                            <TableCell className='text-right'>
                              {formatQuotaWithCurrency(record.closing_quota)}
                            </TableCell>
                            <TableCell>{formatTs(record.generated_at)}</TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow key={`${record.id}-detail`}>
                              <TableCell colSpan={isAdmin ? 8 : 7}>
                                <div className='bg-muted/40 rounded-md p-3'>
                                  {breakdown.length === 0 ? (
                                    <div className='text-muted-foreground text-sm'>
                                      {t('No model details')}
                                    </div>
                                  ) : (
                                    <div className='flex flex-wrap gap-2'>
                                      {breakdown.map((item) => (
                                        <Badge
                                          key={item.model}
                                          variant='outline'
                                          className='gap-1'
                                        >
                                          {item.model}
                                          <span className='text-muted-foreground'>
                                            {formatQuotaWithCurrency(item.quota)}
                                          </span>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
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
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
