import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it('only returns the Today route', () => {
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath('https://evil.test')).toBe('/')
    expect(safeNextPath('//evil.test')).toBe('/')
    expect(safeNextPath('/focus')).toBe('/')
    expect(safeNextPath('/login?next=https://evil.test')).toBe('/')
  })
})
