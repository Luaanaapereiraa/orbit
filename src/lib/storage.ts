import {
  Cycle,
  PomodoroState,
  defaultSettings,
  initialPomodoroState,
} from '../reducers/pomodoro/types'

export const STORAGE_KEY_V1 = '@pomodorodev:cycles-state-1.0.0'
export const STORAGE_KEY = '@pomodorodev:cycles-state-2.0.0'

interface LegacyCycle {
  id: string
  task: string
  minutesAmount: number
  startDate: Date
  interruptedDate?: Date
  finishedDate?: Date
}

interface LegacyState {
  cycles: LegacyCycle[]
  activeCycleId: string | null
}

function migrateLegacyCycle(cycle: LegacyCycle): Cycle {
  return {
    ...cycle,
    type: 'focus',
    pausedMs: 0,
  }
}

function tasksFromCycles(cycles: Cycle[]) {
  const uniqueNames = Array.from(
    new Set(cycles.map((cycle) => cycle.task).filter(Boolean)),
  )

  return uniqueNames.map((name) => ({
    id: crypto.randomUUID(),
    name,
    createdAt: new Date(),
  }))
}

export function loadPomodoroState(): PomodoroState {
  const storedV2 = localStorage.getItem(STORAGE_KEY)

  if (storedV2) {
    try {
      const parsed = JSON.parse(storedV2) as PomodoroState

      return {
        ...initialPomodoroState,
        ...parsed,
        settings: {
          ...defaultSettings,
          ...parsed.settings,
        },
        tasks: parsed.tasks ?? [],
        cycles: parsed.cycles ?? [],
      }
    } catch {
      return initialPomodoroState
    }
  }

  const storedV1 = localStorage.getItem(STORAGE_KEY_V1)

  if (storedV1) {
    try {
      const parsed = JSON.parse(storedV1) as LegacyState
      const cycles = (parsed.cycles ?? []).map(migrateLegacyCycle)
      const tasks = tasksFromCycles(cycles)

      return {
        cycles,
        activeCycleId: parsed.activeCycleId ?? null,
        selectedTaskId: tasks[0]?.id ?? null,
        tasks,
        settings: defaultSettings,
      }
    } catch {
      return initialPomodoroState
    }
  }

  return initialPomodoroState
}

export function persistPomodoroState(state: PomodoroState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function applyThemeClass(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
