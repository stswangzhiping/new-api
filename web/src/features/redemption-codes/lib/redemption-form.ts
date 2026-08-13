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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import {
  parseQuotaFromDollars,
  quotaUnitsToEditableAmount,
} from '@/lib/format'

import {
  REDEMPTION_SOURCE,
  REDEMPTION_VALIDATION,
  getRedemptionFormErrorMessages,
} from '../constants'
import type { RedemptionFormData, Redemption } from '../types'

// ============================================================================
// Form Schema (use getRedemptionFormSchema(t) in components for i18n messages)
// ============================================================================

export function getRedemptionFormSchema(t: TFunction) {
  const msg = getRedemptionFormErrorMessages(t)
  return z
    .object({
      name: z
        .string()
        .min(REDEMPTION_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
        .max(REDEMPTION_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
      quota_dollars: z.number(),
      expired_time: z.date().optional(),
      cc_source: z.number(),
      cc_order_id: z.string(),
      cc_refundable: z.boolean(),
      cc_remark: z.string(),
      count: z
        .number()
        .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
        .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.cc_source === REDEMPTION_SOURCE.ADJUSTMENT) {
        if (data.quota_dollars === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['quota_dollars'],
            message: t('Adjustment quota cannot be zero'),
          })
        }
        return
      }

      if (data.quota_dollars <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quota_dollars'],
          message: t('Quota must be a positive number'),
        })
      }
    })
}

export type RedemptionFormValues = {
  name: string
  quota_dollars: number
  expired_time?: Date
  cc_source: number
  cc_order_id: string
  cc_refundable: boolean
  cc_remark: string
  count?: number
}

// ============================================================================
// Form Defaults
// ============================================================================

export const REDEMPTION_FORM_DEFAULT_VALUES: RedemptionFormValues = {
  name: '',
  quota_dollars: 100,
  expired_time: undefined,
  cc_source: REDEMPTION_SOURCE.UNKNOWN,
  cc_order_id: '',
  cc_refundable: false,
  cc_remark: '',
  count: 1,
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: RedemptionFormValues
): RedemptionFormData {
  return {
    name: data.name,
    quota: parseQuotaFromDollars(data.quota_dollars),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    cc_source: data.cc_source,
    cc_order_id: data.cc_order_id || '',
    cc_refundable: data.cc_refundable,
    cc_remark: data.cc_remark || '',
    count: data.count || 1,
  }
}

/**
 * Transform redemption data to form defaults
 */
export function transformRedemptionToFormDefaults(
  redemption: Redemption
): RedemptionFormValues {
  return {
    name: redemption.name,
    quota_dollars: quotaUnitsToEditableAmount(redemption.quota),
    expired_time:
      redemption.expired_time > 0
        ? new Date(redemption.expired_time * 1000)
        : undefined,
    cc_source: redemption.cc_source ?? REDEMPTION_SOURCE.UNKNOWN,
    cc_order_id: redemption.cc_order_id ?? '',
    cc_refundable: redemption.cc_refundable ?? false,
    cc_remark: redemption.cc_remark ?? '',
    count: 1,
  }
}
