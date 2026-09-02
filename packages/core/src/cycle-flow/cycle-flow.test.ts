import { describe, expect, it } from 'vitest'
import { getNextBreakType } from './index'
import { makeCycle } from '../test/factories'

describe('getNextBreakType', () => {
  it('returns a short break before any focus is finished', () => {
    expect(getNextBreakType([], 4)).toBe('shortBreak')
  })

  it('returns a short break after 1, 2 or 3 completed focuses', () => {
    const cycles = [
      makeCycle({ id: '1', finishedDate: new Date() }),
      makeCycle({ id: '2', finishedDate: new Date() }),
      makeCycle({ id: '3', finishedDate: new Date() }),
    ]

    expect(getNextBreakType(cycles.slice(0, 1), 4)).toBe('shortBreak')
    expect(getNextBreakType(cycles.slice(0, 2), 4)).toBe('shortBreak')
    expect(getNextBreakType(cycles, 4)).toBe('shortBreak')
  })

  it('returns a long break every N completed focuses', () => {
    const cycles = [1, 2, 3, 4].map((id) =>
      makeCycle({ id: String(id), finishedDate: new Date() }),
    )

    expect(getNextBreakType(cycles, 4)).toBe('longBreak')
  })

  it('ignores interrupted and break cycles', () => {
    const cycles = [
      makeCycle({ id: '1', finishedDate: new Date() }),
      makeCycle({ id: '2', interruptedDate: new Date() }),
      makeCycle({
        id: '3',
        type: 'shortBreak',
        finishedDate: new Date(),
      }),
    ]

    expect(getNextBreakType(cycles, 1)).toBe('longBreak')
  })
})
