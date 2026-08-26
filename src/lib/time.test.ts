import { describe, expect, it } from 'vitest'
import { formatClock, getElapsedSeconds } from '../lib/time'

describe('formatClock', () => {
  it('formats minutes and seconds with two digits', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(5)).toBe('00:05')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(25 * 60)).toBe('25:00')
  })

  it('never shows a negative clock', () => {
    expect(formatClock(-40)).toBe('00:00')
  })
})

describe('getElapsedSeconds', () => {
  const start = new Date('2026-01-01T10:00:00.000Z')

  it('counts wall-clock time since start', () => {
    const now = start.getTime() + 90_000

    expect(
      getElapsedSeconds({ startDate: start, pausedMs: 0 }, now),
    ).toBe(90)
  })

  it('subtracts accumulated pause time', () => {
    const now = start.getTime() + 120_000

    expect(
      getElapsedSeconds({ startDate: start, pausedMs: 30_000 }, now),
    ).toBe(90)
  })

  it('freezes elapsed time while currently paused', () => {
    const pausedAt = new Date(start.getTime() + 40_000)
    const now = start.getTime() + 100_000

    expect(
      getElapsedSeconds(
        { startDate: start, pausedMs: 0, pausedAt },
        now,
      ),
    ).toBe(40)
  })
})
