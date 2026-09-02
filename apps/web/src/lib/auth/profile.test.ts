import { describe, expect, it } from 'vitest'
import {
  isValidCraft,
  isValidDisplayName,
  normalizeCraft,
  normalizeDisplayName,
  profileFromMetadata,
} from './profile'

describe('auth profile', () => {
  it('normalizes and validates display names', () => {
    expect(normalizeDisplayName('  Ana  Silva  ')).toBe('Ana Silva')
    expect(isValidDisplayName('A')).toBe(false)
    expect(isValidDisplayName('Ana')).toBe(true)
  })

  it('accepts a free-text craft', () => {
    expect(normalizeCraft('  Engenharia de software  ')).toBe(
      'Engenharia de software',
    )
    expect(isValidCraft('A')).toBe(false)
    expect(isValidCraft('Produto')).toBe(true)
  })

  it('reads display name and craft from auth metadata', () => {
    expect(
      profileFromMetadata({
        display_name: '  Luana  ',
        craft: '  Produto  ',
      }),
    ).toEqual({ displayName: 'Luana', craft: 'Produto' })
    expect(
      profileFromMetadata({
        full_name: 'Conta Google',
        craft: '   ',
      }),
    ).toEqual({ displayName: 'Conta Google', craft: null })
    expect(profileFromMetadata(null)).toEqual({
      displayName: null,
      craft: null,
    })
  })
})
