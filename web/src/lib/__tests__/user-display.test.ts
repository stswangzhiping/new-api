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
import { describe, expect, it } from 'vitest'

import { resolveUsername } from '../user-display'

describe('resolveUsername', () => {
  const users = new Map([
    [1, { id: 1, username: 'alice', display_name: 'Alice' }],
    [2, { id: 2, display_name: 'Bob' }],
  ])

  it('uses the account username when the user exists', () => {
    expect(resolveUsername(users, 1)).toBe('alice')
  })

  it('falls back to the display name and then the user ID', () => {
    expect(resolveUsername(users, 2)).toBe('Bob')
    expect(resolveUsername(users, 3)).toBe('3')
  })

  it('shows a dash when no user is associated', () => {
    expect(resolveUsername(users, 0)).toBe('-')
  })
})
