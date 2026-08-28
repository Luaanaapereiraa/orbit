import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  msUntilNextLocalMidnight,
  toLocalDateKey,
  useLocalDateKey,
} from './local-date'

describe('toLocalDateKey', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats from local calendar parts instead of UTC ISO slicing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 23, 30, 0))

    const date = new Date()
    expect(toLocalDateKey(date)).toBe('2026-01-15')
    expect(toLocalDateKey(date)).toBe(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(date.getDate()).padStart(2, '0')}`,
    )
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('measures the next local midnight rather than a 24h interval', () => {
    const now = new Date(2026, 0, 15, 23, 59, 50)
    expect(msUntilNextLocalMidnight(now)).toBe(10_000)
  })
})

describe('useLocalDateKey', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stays empty until enabled to avoid a server date mismatch', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0))

    const { result } = renderHook(() => useLocalDateKey(false))
    expect(result.current).toBeNull()
  })

  it('uses the device local date after it is enabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0))

    const { result } = renderHook(() => useLocalDateKey(true))
    expect(result.current).toBe('2026-01-15')
  })

  it('rolls over at the next local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 23, 59, 50))

    const { result } = renderHook(() => useLocalDateKey(true))
    expect(result.current).toBe('2026-01-15')

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(result.current).toBe('2026-01-16')
  })

  it('recalculates on visibilitychange and focus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0))

    const { result } = renderHook(() => useLocalDateKey(true))
    expect(result.current).toBe('2026-01-15')

    act(() => {
      vi.setSystemTime(new Date(2026, 0, 16, 0, 10, 0))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe('2026-01-16')

    act(() => {
      vi.setSystemTime(new Date(2026, 0, 17, 8, 0, 0))
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toBe('2026-01-17')
  })
})
