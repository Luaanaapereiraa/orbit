import {
  type Cycle,
  type PomodoroState,
  initialPomodoroState,
} from '@destravai/core'

export function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: 'cycle-1',
    type: 'focus',
    task: 'Escrever testes',
    minutesAmount: 25,
    startDate: new Date('2026-01-01T10:00:00.000Z'),
    pausedMs: 0,
    ...overrides,
  }
}

export function makeState(
  overrides: Partial<PomodoroState> = {},
): PomodoroState {
  return {
    ...initialPomodoroState,
    settings: { ...initialPomodoroState.settings },
    tasks: [],
    cycles: [],
    ...overrides,
  }
}
