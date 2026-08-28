import type { BuildTaskInput, LegacyTask, Task, TaskEnergy, TaskStatus } from './types'

export type { BuildTaskInput, LegacyTask, Task, TaskEnergy, TaskStatus }

const TASK_STATUSES: TaskStatus[] = ['inbox', 'active', 'done', 'archived']
const TASK_ENERGIES: TaskEnergy[] = ['low', 'medium', 'high']
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

export function isTaskEnergy(value: unknown): value is TaskEnergy {
  return TASK_ENERGIES.includes(value as TaskEnergy)
}

export function normalizeTitle(title: string) {
  return title.trim()
}

export function normalizeNextAction(nextAction: string | null) {
  if (nextAction === null) {
    return null
  }

  const trimmed = nextAction.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isValidEstimatedMinutes(value: number | null) {
  if (value === null) {
    return true
  }

  return Number.isInteger(value) && value > 0
}

export function isValidPosition(value: number) {
  return Number.isInteger(value) && value >= 0
}

export function isIsoTimestamp(value: string) {
  return ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))
}

export function toIsoTimestamp(
  value: Date | string | null | undefined,
  fallbackNow: string,
) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackNow : value.toISOString()
  }

  if (typeof value === 'string' && isIsoTimestamp(value)) {
    return value
  }

  return fallbackNow
}

export function nextTaskPosition(tasks: Task[]) {
  if (tasks.length === 0) {
    return 0
  }

  return Math.max(...tasks.map((task) => task.position)) + 1
}

export function buildTask(input: BuildTaskInput): Task | null {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    return null
  }

  const title = normalizeTitle(input.title)

  if (!title) {
    return null
  }

  const estimatedMinutes = input.estimatedMinutes ?? null

  if (!isValidEstimatedMinutes(estimatedMinutes)) {
    return null
  }

  const position = input.position ?? 0

  if (!isValidPosition(position)) {
    return null
  }

  const status: TaskStatus =
    input.status === 'inbox' ? 'inbox' : 'active'

  const energy =
    input.energy === undefined || input.energy === null
      ? null
      : isTaskEnergy(input.energy)
        ? input.energy
        : null

  if (input.energy !== undefined && input.energy !== null && energy === null) {
    return null
  }

  return {
    id: input.id,
    title,
    nextAction: normalizeNextAction(input.nextAction ?? null),
    status,
    estimatedMinutes,
    energy,
    position,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
  }
}

export function migrateLegacyTask(
  task: LegacyTask,
  index: number,
  fallbackNow: string,
): Task {
  const title = normalizeTitle(task.name) || 'Tarefa'
  const createdAt = toIsoTimestamp(task.createdAt, fallbackNow)

  return {
    id: task.id,
    title,
    nextAction: null,
    status: 'active',
    estimatedMinutes: null,
    energy: null,
    position: index,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  }
}

export function migrateLegacyTasks(
  tasks: LegacyTask[],
  fallbackNow: string,
): Task[] {
  return tasks.map((task, index) => migrateLegacyTask(task, index, fallbackNow))
}

export function tasksByStatus(tasks: Task[], status: TaskStatus) {
  return tasks.filter((task) => task.status === status)
}

export function sortTasksByPosition(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position
    }

    return left.id.localeCompare(right.id)
  })
}

export function tasksForCommonList(tasks: Task[]) {
  return sortTasksByPosition(
    tasks.filter((task) => task.status === 'inbox' || task.status === 'active'),
  )
}

export function patchTask(
  tasks: Task[],
  taskId: string,
  now: string,
  patch: (task: Task) => Task | null,
): Task[] {
  let changed = false
  const next = tasks.map((task) => {
    if (task.id !== taskId) {
      return task
    }

    const updated = patch(task)

    if (!updated || updated === task) {
      return task
    }

    changed = true
    return { ...updated, updatedAt: now }
  })

  return changed ? next : tasks
}

export function addTaskToList(
  tasks: Task[],
  input: BuildTaskInput,
): Task[] | null {
  if (tasks.some((task) => task.id === input.id)) {
    return null
  }

  const task = buildTask({
    ...input,
    position: input.position ?? nextTaskPosition(tasks),
  })

  if (!task) {
    return null
  }

  return [...tasks, task]
}

export function updateTaskTitle(
  tasks: Task[],
  taskId: string,
  title: string,
  now: string,
) {
  const normalized = normalizeTitle(title)

  if (!normalized) {
    return tasks
  }

  return patchTask(tasks, taskId, now, (task) =>
    task.title === normalized ? task : { ...task, title: normalized },
  )
}

export function updateTaskNextAction(
  tasks: Task[],
  taskId: string,
  nextAction: string | null,
  now: string,
) {
  const normalized = normalizeNextAction(nextAction)

  return patchTask(tasks, taskId, now, (task) =>
    task.nextAction === normalized ? task : { ...task, nextAction: normalized },
  )
}

export function updateTaskEstimatedMinutes(
  tasks: Task[],
  taskId: string,
  estimatedMinutes: number | null,
  now: string,
) {
  if (!isValidEstimatedMinutes(estimatedMinutes)) {
    return tasks
  }

  return patchTask(tasks, taskId, now, (task) =>
    task.estimatedMinutes === estimatedMinutes
      ? task
      : { ...task, estimatedMinutes },
  )
}

export function updateTaskEnergy(
  tasks: Task[],
  taskId: string,
  energy: TaskEnergy | null,
  now: string,
) {
  if (energy !== null && !isTaskEnergy(energy)) {
    return tasks
  }

  return patchTask(tasks, taskId, now, (task) =>
    task.energy === energy ? task : { ...task, energy },
  )
}

export function moveTaskBetweenInboxAndActive(
  tasks: Task[],
  taskId: string,
  status: 'inbox' | 'active',
  now: string,
) {
  return patchTask(tasks, taskId, now, (task) => {
    if (task.status !== 'inbox' && task.status !== 'active') {
      return task
    }

    if (task.status === status) {
      return task
    }

    return { ...task, status }
  })
}

export function reorderTasksByIds(
  tasks: Task[],
  orderedIds: string[],
  now: string,
) {
  const existingIds = new Set(tasks.map((task) => task.id))
  const positionById = new Map<string, number>()

  orderedIds.forEach((id) => {
    if (!existingIds.has(id) || positionById.has(id)) {
      return
    }

    positionById.set(id, positionById.size)
  })

  let changed = false
  const next = tasks.map((task) => {
    const position = positionById.get(task.id)

    if (position === undefined || task.position === position) {
      return task
    }

    changed = true
    return { ...task, position, updatedAt: now }
  })

  return changed ? next : tasks
}

export function completeTaskInList(
  tasks: Task[],
  taskId: string,
  now: string,
) {
  return patchTask(tasks, taskId, now, (task) => {
    if (task.status === 'done' || task.status === 'archived') {
      return task
    }

    return { ...task, status: 'done', completedAt: now }
  })
}

export function reopenTaskInList(
  tasks: Task[],
  taskId: string,
  now: string,
  destination: 'active' | 'inbox',
) {
  if (destination !== 'active' && destination !== 'inbox') {
    return tasks
  }

  return patchTask(tasks, taskId, now, (task) => {
    if (task.status !== 'done') {
      return task
    }

    return { ...task, status: destination, completedAt: null }
  })
}

export function archiveTaskInList(
  tasks: Task[],
  taskId: string,
  now: string,
) {
  return patchTask(tasks, taskId, now, (task) => {
    if (task.status === 'archived') {
      return task
    }

    return { ...task, status: 'archived' }
  })
}

export function deleteTaskFromList(tasks: Task[], taskId: string) {
  const next = tasks.filter((task) => task.id !== taskId)
  return next.length === tasks.length ? tasks : next
}

export function normalizeStoredTask(
  value: {
    id: string
    title: string
    nextAction?: string | null
    status?: string
    estimatedMinutes?: number | null
    energy?: string | null
    position?: number
    createdAt?: string
    updatedAt?: string
    completedAt?: string | null
  },
  fallbackNow: string,
  positionFallback = 0,
): Task | null {
  const title = normalizeTitle(value.title)

  if (!title || !value.id) {
    return null
  }

  const status = isTaskStatus(value.status) ? value.status : 'active'
  const estimatedMinutes = isValidEstimatedMinutes(value.estimatedMinutes ?? null)
    ? value.estimatedMinutes ?? null
    : null
  const energy =
    value.energy === null || value.energy === undefined
      ? null
      : isTaskEnergy(value.energy)
        ? value.energy
        : null
  const position = isValidPosition(value.position ?? positionFallback)
    ? (value.position ?? positionFallback)
    : positionFallback
  const createdAt = toIsoTimestamp(value.createdAt, fallbackNow)
  const updatedAt = toIsoTimestamp(value.updatedAt, createdAt)
  const completedAt =
    status === 'done'
      ? toIsoTimestamp(value.completedAt, fallbackNow)
      : null

  return {
    id: value.id,
    title,
    nextAction: normalizeNextAction(value.nextAction ?? null),
    status,
    estimatedMinutes,
    energy,
    position,
    createdAt,
    updatedAt,
    completedAt,
  }
}
