import { Cycle } from '../pomodoro/types'
import { getElapsedSeconds } from '../time'

export function focusedMinutesOf(cycle: Cycle) {
  if (cycle.type !== 'focus') {
    return 0
  }

  if (cycle.finishedDate) {
    return cycle.minutesAmount
  }

  if (cycle.interruptedDate) {
    return Math.round(
      getElapsedSeconds(cycle, new Date(cycle.interruptedDate).getTime()) / 60,
    )
  }

  return 0
}
