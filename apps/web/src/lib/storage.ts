import {
  type Cycle,
  type CycleType,
  type DailyPlan,
  type PomodoroState,
  type Settings,
  type Task,
  defaultSettings,
  initialPomodoroState,
  isValidLocalDateKey,
  migrateLegacyTask,
  normalizeStoredTask,
  sanitizeDailyPlan,
} from '@destravai/core'

export const STORAGE_KEY_V1 = '@pomodorodev:cycles-state-1.0.0'
export const STORAGE_KEY = '@pomodorodev:cycles-state-2.0.0'
export const STORAGE_KEY_DESTRAVAI = '@destravai:state-1.0.0'

export interface PersistedDestravaiState {
  version: 1
  state: PomodoroState
}

interface LegacyCycle {
  id: string
  task: string
  minutesAmount: number
  startDate: Date | string
  interruptedDate?: Date | string
  finishedDate?: Date | string
}

interface LegacyState {
  cycles: LegacyCycle[]
  activeCycleId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function reviveDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)

    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  return undefined
}

function reviveCycle(value: unknown): Cycle | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  if (typeof value.task !== 'string') {
    return null
  }

  if (
    typeof value.minutesAmount !== 'number' ||
    !Number.isFinite(value.minutesAmount)
  ) {
    return null
  }

  const startDate = reviveDate(value.startDate)

  if (!startDate) {
    return null
  }

  const type: CycleType =
    value.type === 'shortBreak' ||
    value.type === 'longBreak' ||
    value.type === 'focus'
      ? value.type
      : 'focus'

  const cycle: Cycle = {
    id: value.id,
    type,
    task: value.task,
    minutesAmount: value.minutesAmount,
    startDate,
    pausedMs:
      typeof value.pausedMs === 'number' && Number.isFinite(value.pausedMs)
        ? value.pausedMs
        : 0,
  }

  if (typeof value.taskId === 'string') {
    cycle.taskId = value.taskId
  }

  const pausedAt = reviveDate(value.pausedAt)
  if (pausedAt) {
    cycle.pausedAt = pausedAt
  }

  const interruptedDate = reviveDate(value.interruptedDate)
  if (interruptedDate) {
    cycle.interruptedDate = interruptedDate
  }

  const finishedDate = reviveDate(value.finishedDate)
  if (finishedDate) {
    cycle.finishedDate = finishedDate
  }

  return cycle
}

function reviveCycles(value: unknown): Cycle[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => reviveCycle(item))
    .filter((cycle): cycle is Cycle => cycle !== null)
}

function migrateLegacyCycle(cycle: LegacyCycle): Cycle | null {
  return reviveCycle({
    ...cycle,
    type: 'focus',
    pausedMs: 0,
  })
}

function tasksFromUnknown(value: unknown, fallbackNow: string): Task[] {
  if (!Array.isArray(value)) {
    return []
  }

  const tasks: Task[] = []

  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      return
    }

    if (typeof item.title === 'string') {
      const task = normalizeStoredTask(
        {
          id: item.id,
          title: item.title,
          nextAction: asNullableString(item.nextAction),
          status: asString(item.status, 'active'),
          estimatedMinutes:
            typeof item.estimatedMinutes === 'number'
              ? item.estimatedMinutes
              : null,
          energy: asNullableString(item.energy),
          position: typeof item.position === 'number' ? item.position : index,
          createdAt: asString(item.createdAt, fallbackNow),
          updatedAt: asString(item.updatedAt, fallbackNow),
          completedAt: asNullableString(item.completedAt),
        },
        fallbackNow,
        index,
      )

      if (task) {
        tasks.push(task)
      }

      return
    }

    if (typeof item.name === 'string') {
      tasks.push(
        migrateLegacyTask(
          {
            id: item.id,
            name: item.name,
            createdAt:
              item.createdAt instanceof Date ||
              typeof item.createdAt === 'string'
                ? item.createdAt
                : fallbackNow,
          },
          index,
          fallbackNow,
        ),
      )
    }
  })

  return tasks
}

function dailyPlansFromUnknown(
  value: unknown,
  tasks: Task[],
  fallbackNow: string,
): DailyPlan[] {
  if (!Array.isArray(value)) {
    return []
  }

  const byDate = new Map<string, DailyPlan>()

  value.forEach((item) => {
    if (!isRecord(item) || typeof item.date !== 'string') {
      return
    }

    if (!isValidLocalDateKey(item.date) || byDate.has(item.date)) {
      return
    }

    const secondaryTaskIds = Array.isArray(item.secondaryTaskIds)
      ? item.secondaryTaskIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : []

    byDate.set(
      item.date,
      sanitizeDailyPlan(
        {
          date: item.date,
          essentialTaskId: asNullableString(item.essentialTaskId),
          secondaryTaskIds,
          createdAt: asString(item.createdAt, fallbackNow),
          updatedAt: asString(item.updatedAt, fallbackNow),
        },
        tasks,
      ),
    )
  })

  return [...byDate.values()]
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    return defaultSettings
  }

  const theme =
    value.theme === 'light' || value.theme === 'dark'
      ? value.theme
      : defaultSettings.theme

  return {
    ...defaultSettings,
    focusMinutes:
      typeof value.focusMinutes === 'number'
        ? value.focusMinutes
        : defaultSettings.focusMinutes,
    shortBreakMinutes:
      typeof value.shortBreakMinutes === 'number'
        ? value.shortBreakMinutes
        : defaultSettings.shortBreakMinutes,
    longBreakMinutes:
      typeof value.longBreakMinutes === 'number'
        ? value.longBreakMinutes
        : defaultSettings.longBreakMinutes,
    cyclesUntilLongBreak:
      typeof value.cyclesUntilLongBreak === 'number'
        ? value.cyclesUntilLongBreak
        : defaultSettings.cyclesUntilLongBreak,
    autoStartBreaks:
      typeof value.autoStartBreaks === 'boolean'
        ? value.autoStartBreaks
        : defaultSettings.autoStartBreaks,
    soundEnabled:
      typeof value.soundEnabled === 'boolean'
        ? value.soundEnabled
        : defaultSettings.soundEnabled,
    notificationsEnabled:
      typeof value.notificationsEnabled === 'boolean'
        ? value.notificationsEnabled
        : defaultSettings.notificationsEnabled,
    theme,
  }
}

function normalizePomodoroState(
  value: unknown,
  fallbackNow: string,
): PomodoroState {
  const parsed = isRecord(value) ? value : {}
  const tasks = tasksFromUnknown(parsed.tasks, fallbackNow)

  return {
    ...initialPomodoroState,
    cycles: reviveCycles(parsed.cycles),
    activeCycleId: asNullableString(parsed.activeCycleId),
    selectedTaskId: asNullableString(parsed.selectedTaskId),
    tasks,
    dailyPlans: dailyPlansFromUnknown(parsed.dailyPlans, tasks, fallbackNow),
    settings: normalizeSettings(parsed.settings),
  }
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function parseDestravaiState(
  raw: string,
  fallbackNow: string,
): PomodoroState | null {
  const parsed = parseJson(raw)

  if (!isRecord(parsed) || parsed.version !== 1) {
    return null
  }

  return normalizePomodoroState(parsed.state, fallbackNow)
}

function parseV2State(raw: string, fallbackNow: string): PomodoroState | null {
  const parsed = parseJson(raw)

  if (!parsed) {
    return null
  }

  return normalizePomodoroState(parsed, fallbackNow)
}

function uniqueCycleTaskNames(cycles: Cycle[]) {
  const names: string[] = []
  const seen = new Set<string>()

  for (const cycle of cycles) {
    if (!cycle.task || seen.has(cycle.task)) {
      continue
    }

    seen.add(cycle.task)
    names.push(cycle.task)
  }

  return names
}

function stableNameHash(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function migratedV1TaskId(name: string, uniqueIndex: number) {
  const normalized = name.trim() || name

  return `v1:${uniqueIndex}:${stableNameHash(normalized)}`
}

function tasksFromCycles(cycles: Cycle[], fallbackNow: string): Task[] {
  return uniqueCycleTaskNames(cycles).map((name, index) =>
    migrateLegacyTask(
      {
        id: migratedV1TaskId(name, index),
        name,
        createdAt: fallbackNow,
      },
      index,
      fallbackNow,
    ),
  )
}

function withMigratedCycleTaskIds(cycles: Cycle[], tasks: Task[]): Cycle[] {
  const names = uniqueCycleTaskNames(cycles)
  const taskIdByName = new Map(
    names.map((name, index) => [name, tasks[index]?.id]),
  )

  return cycles.map((cycle) => {
    const taskId = taskIdByName.get(cycle.task)

    if (!taskId) {
      return cycle
    }

    return { ...cycle, taskId }
  })
}

function parseV1State(raw: string, fallbackNow: string): PomodoroState | null {
  const parsed = parseJson(raw)

  if (!isRecord(parsed)) {
    return null
  }

  const legacy = parsed as unknown as LegacyState
  const cycles = (legacy.cycles ?? [])
    .map((cycle) => migrateLegacyCycle(cycle))
    .filter((cycle): cycle is Cycle => cycle !== null)
  const tasks = tasksFromCycles(cycles, fallbackNow)

  return {
    cycles: withMigratedCycleTaskIds(cycles, tasks),
    activeCycleId: asNullableString(legacy.activeCycleId),
    selectedTaskId: tasks[0]?.id ?? null,
    tasks,
    dailyPlans: [],
    settings: defaultSettings,
  }
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
  fallbackNow = new Date().toISOString(),
): PomodoroState {
  if (!storage) {
    return initialPomodoroState
  }

  const storedDestravai = storage.getItem(STORAGE_KEY_DESTRAVAI)

  if (storedDestravai) {
    const loaded = parseDestravaiState(storedDestravai, fallbackNow)

    if (loaded) {
      return loaded
    }
  }

  const storedV2 = storage.getItem(STORAGE_KEY)

  if (storedV2) {
    const loaded = parseV2State(storedV2, fallbackNow)

    if (loaded) {
      return loaded
    }
  }

  const storedV1 = storage.getItem(STORAGE_KEY_V1)

  if (storedV1) {
    const loaded = parseV1State(storedV1, fallbackNow)

    if (loaded) {
      return loaded
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

  const envelope: PersistedDestravaiState = {
    version: 1,
    state,
  }

  storage.setItem(STORAGE_KEY_DESTRAVAI, JSON.stringify(envelope))
}

export function applyThemeClass(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.classList.toggle('dark', theme === 'dark')
}
