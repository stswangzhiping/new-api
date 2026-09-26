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
import { beforeEach, expect, test, vi } from 'vitest'

import { downloadBillingPdf } from '../pdf'

const mocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  html2canvas: vi.fn(),
  save: vi.fn(),
}))

vi.mock('html2canvas', () => ({ default: mocks.html2canvas }))
vi.mock('jspdf', () => ({
  jsPDF: class {
    addImage = mocks.addImage
    addPage = mocks.addPage
    save = mocks.save
  },
}))

beforeEach(() => {
  localStorage.clear()
  mocks.html2canvas.mockResolvedValue({
    width: 794,
    height: 1123,
    toDataURL: () => 'data:image/png;base64,test',
  })
})

test('renders the bill in an isolated document without unsupported colors', async () => {
  await downloadBillingPdf({
    record: {
      id: 1,
      user_id: 7,
      year: 2026,
      month: 9,
      opening_quota: 0,
      closing_quota: 0,
      topup_total: 0,
      topup_purchase: 0,
      topup_gift: 0,
      used_quota: 0,
      model_breakdown: '[]',
      generated_at: 1,
    },
    user: { id: 7, username: 'alice' },
    topups: [],
  })

  const element = mocks.html2canvas.mock.calls[0]?.[0] as HTMLElement
  expect(element.ownerDocument).not.toBe(document)
  expect(element.ownerDocument.head.textContent).not.toContain('oklch')
  expect(document.querySelector('iframe')).toBeNull()
  expect(mocks.save).toHaveBeenCalledWith('月度账单-2026年9月-alice.pdf')
})
