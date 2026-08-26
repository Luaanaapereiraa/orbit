import { Cycle, CycleType } from '../reducers/pomodoro/types'

export function getNextBreakType(
  cycles: Cycle[],
  cyclesUntilLongBreak: number,
): CycleType {
  const completedFocus = cycles.filter(
    (cycle) => cycle.type === 'focus' && cycle.finishedDate,
  ).length

  if (completedFocus === 0 || cyclesUntilLongBreak <= 0) {
    return 'shortBreak'
  }

  if (completedFocus % cyclesUntilLongBreak === 0) {
    return 'longBreak'
  }

  return 'shortBreak'
}
