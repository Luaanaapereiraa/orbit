import {
  type Cycle,
  type PomodoroState,
  type Task,
  initialPomodoroState,
} from '@destravai/core'

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Ler',
    nextAction: null,
    status: 'active',
    estimatedMinutes: null,
    energy: null,
    position: 0,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

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
    dailyPlans: [],
    cycles: [],
    ...overrides,
  }
}
