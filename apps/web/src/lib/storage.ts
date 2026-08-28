import {
  type Cycle,
  type PomodoroState,
  defaultSettings,
  initialPomodoroState,
} from '@destravai/core'

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

export function getBrowserStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined') {
      return null
    }

    const storage = (globalThis as { localStorage?: Storage }).localStorage

    if (!storage) {
      return null
    }

    return storage
  } catch {
    return null
  }
}

export function loadPomodoroState(
  storage: Storage | null = getBrowserStorage(),
): PomodoroState {
  if (!storage) {
    return initialPomodoroState
  }

  const storedV2 = storage.getItem(STORAGE_KEY)

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

  const storedV1 = storage.getItem(STORAGE_KEY_V1)

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

export function persistPomodoroState(
  state: PomodoroState,
  storage: Storage | null = getBrowserStorage(),
) {
  if (!storage) {
    return
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function applyThemeClass(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.classList.toggle('dark', theme === 'dark')
}
