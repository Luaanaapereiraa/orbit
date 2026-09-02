import { describe, expect, it } from 'vitest'
import { focusedMinutesOf } from './index'
import { makeCycle } from '../test/factories'

describe('focusedMinutesOf', () => {
  it('counts full duration of a finished focus cycle', () => {
    const cycle = makeCycle({
      minutesAmount: 25,
      finishedDate: new Date('2026-01-01T10:25:00.000Z'),
    })

    expect(focusedMinutesOf(cycle)).toBe(25)
  })

  it('counts elapsed minutes of an interrupted focus cycle', () => {
    const cycle = makeCycle({
      startDate: new Date('2026-01-01T10:00:00.000Z'),
      interruptedDate: new Date('2026-01-01T10:10:00.000Z'),
    })

    expect(focusedMinutesOf(cycle)).toBe(10)
  })

  it('ignores breaks and cycles still in progress', () => {
    expect(
      focusedMinutesOf(makeCycle({ type: 'shortBreak', minutesAmount: 5 })),
    ).toBe(0)
    expect(focusedMinutesOf(makeCycle())).toBe(0)
  })
})
