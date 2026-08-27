import { describe, expect, it } from 'vitest'
import { cn } from '../lib/cn'

describe('cn', () => {
  it('merges class names and drops conflicts', () => {
    expect(cn('px-2', 'px-4', false && 'hidden')).toBe('px-4')
  })
})
