import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Download, Search, X } from 'lucide-react'
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
import { ROLE } from '@/lib/roles'
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

function getUserLabel(user?: BillingUser) {
  if (!user) return ''
  return user.username || user.display_name || String(user.id)
}

export function Billing() {
  const { t } = useTranslation()
  const authUser = useAuthStore((state) => state.auth.user)
  const isAdmin = (authUser?.role ?? 0) >= ROLE.ADMIN
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [username, setUsername] = useState('')
  const [submittedUsername, setSubmittedUsername] = useState('')
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

  const { data, isLoading } = useQuery({
    queryKey: ['billing', isAdmin, exactUserId],
    queryFn: async () => {
      const res = isAdmin
        ? await getAdminBilling(1, 500, exactUserId)
        : await getSelfBilling()
      if (res.success === false) {
        throw new Error(res.message || t('Failed to load billing history'))
      }
      return readPageItems(res.data)
    },
  })

  const records = useMemo(() => {
    const items = data || []
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
  }, [data, exactUserId, isAdmin, submittedUsername, userMap])

  const applySearch = () => setSubmittedUsername(username.trim())
  const resetSearch = () => {
    setUsername('')
    setSubmittedUsername('')
  }

  const handleDownloadPdf = async (record: BillingRecord) => {
    if (pdfLoading.has(record.id)) return
    setPdfLoading((current) => new Set(current).add(record.id))
    try {
      const response = await getBillingRedemptions(
        isAdmin ? record.user_id : undefined
      )
      if (response.success === false) {
        throw new Error(
          response.message || t('Failed to load redemption codes')
        )
      }
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
      toast.error(
        error instanceof Error ? error.message : t('Failed to download PDF')
      )
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
            <div className='flex flex-wrap items-center gap-2'>
              <Input
                className='w-64'
                placeholder={t('Username or user ID')}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && applySearch()}
              />
              <Button type='button' variant='outline' onClick={applySearch}>
                <Search />
                {t('Search')}
              </Button>
              <Button type='button' variant='ghost' onClick={resetSearch}>
                <X />
                {t('Reset')}
              </Button>
            </div>
          )}

          <Card className='min-h-0 flex-1 overflow-hidden'>
            <CardContent className='h-full overflow-auto p-0'>
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
                  {isLoading ? (
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
                    records.map((record) => {
                      const expanded = expandedId === record.id
                      const breakdown = parseBreakdown(record.model_breakdown)
                      return (
                        <Fragment key={record.id}>
                          <TableRow>
                            <TableCell>
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                disabled={breakdown.length === 0}
                                onClick={() =>
                                  setExpandedId(expanded ? null : record.id)
                                }
                              >
                                {expanded ? <ChevronDown /> : <ChevronRight />}
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
                              {record.topup_total > 0 ? (
                                <div>
                                  <div className='font-mono font-semibold text-green-600'>
                                    +{formatBillingAmount(record.topup_total)}
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
                                </div>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className='text-right font-mono text-red-600'>
                              {formatBillingAmount(record.used_quota)}
                            </TableCell>
                            <TableCell className='text-primary text-right font-mono font-semibold'>
                              {formatBillingAmount(record.closing_quota)}
                            </TableCell>
                            <TableCell className='font-mono text-xs'>
                              {formatTs(record.generated_at)}
                            </TableCell>
                            <TableCell className='text-center'>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                disabled={pdfLoading.has(record.id)}
                                onClick={() => handleDownloadPdf(record)}
                              >
                                <Download />
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
                                            {item.calls.toLocaleString()}
                                          </TableCell>
                                          <TableCell className='text-right'>
                                            {item.promptTokens.toLocaleString()}
                                          </TableCell>
                                          <TableCell className='text-right'>
                                            {item.completionTokens.toLocaleString()}
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
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
