import {
  BLOCKAGE_DETAILS_MAX_LENGTH,
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
  UnlockTaskRunRequestSchema,
  type BlockageReason,
  type TodayPlanRole,
  type UnlockTaskRunRequest,
} from '@destravai/contracts'
import {
  getDailyPlanByDate,
  resolvePlanTasks,
  type DailyPlan,
  type Task,
  type TaskEnergy,
} from '@destravai/core'

export const BLOCKAGE_OPTIONS: { value: BlockageReason; label: string }[] = [
  { value: 'dont_know_where_to_start', label: 'Não sei por onde começar' },
  { value: 'overwhelmed', label: 'A tarefa parece grande demais' },
  { value: 'procrastinating', label: 'Estou procrastinando' },
  { value: 'low_energy', label: 'Estou sem energia' },
  { value: 'other', label: 'Outro' },
]

export const ENERGY_OPTIONS: { value: TaskEnergy; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]

export const AVAILABLE_MINUTE_CHIPS = [5, 10, 15, 25, 45] as const

export type UnlockFormFields = {
  taskId: string
  blockageReason: BlockageReason
  blockageDetails: string
  currentEnergy: TaskEnergy | ''
  availableMinutes: number
  clientRequestId: string
}

export function canRequestUnlock(task: Task) {
  return task.status === 'inbox' || task.status === 'active'
}

export function eligibleUnlockTasks(tasks: readonly Task[]) {
  return tasks.filter(canRequestUnlock)
}

export function todayRoleForTask(
  taskId: string,
  dateKey: string,
  plans: readonly DailyPlan[],
): TodayPlanRole {
  const plan = getDailyPlanByDate(plans, dateKey)
  if (!plan) {
    return 'unplanned'
  }
  if (plan.essentialTaskId === taskId) {
    return 'essential'
  }
  if (plan.secondaryTaskIds.includes(taskId)) {
    return 'secondary'
  }
  return 'unplanned'
}

export function plannedTaskCountForDate(
  dateKey: string,
  plans: readonly DailyPlan[],
) {
  const plan = getDailyPlanByDate(plans, dateKey)
  if (!plan) {
    return 0
  }
  return (plan.essentialTaskId ? 1 : 0) + plan.secondaryTaskIds.length
}

export function clampAvailableMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return 25
  }
  return Math.min(
    MAX_AVAILABLE_MINUTES,
    Math.max(MIN_AVAILABLE_MINUTES, Math.round(value)),
  )
}

export function createUnlockFormFields(
  taskId: string,
  availableMinutes: number,
): UnlockFormFields {
  return {
    taskId,
    blockageReason: 'dont_know_where_to_start',
    blockageDetails: '',
    currentEnergy: '',
    availableMinutes: clampAvailableMinutes(availableMinutes),
    clientRequestId: crypto.randomUUID(),
  }
}

export function suggestUnlockTask(input: {
  tasks: readonly Task[]
  dailyPlans: readonly DailyPlan[]
  dateKey: string
  selectedTaskId: string | null
  preferredTaskId?: string | null
}): Task | null {
  const eligible = eligibleUnlockTasks(input.tasks)
  if (input.preferredTaskId) {
    const preferred = eligible.find((task) => task.id === input.preferredTaskId)
    if (preferred) {
      return preferred
    }
  }

  const plan = getDailyPlanByDate(input.dailyPlans, input.dateKey)
  const resolved = plan
    ? resolvePlanTasks(plan, [...input.tasks])
    : { essential: null, secondaries: [] }

  if (resolved.essential && canRequestUnlock(resolved.essential)) {
    return resolved.essential
  }

  const secondary = resolved.secondaries.find(canRequestUnlock)
  if (secondary) {
    return secondary
  }

  const selected = eligible.find((task) => task.id === input.selectedTaskId)
  if (selected) {
    return selected
  }

  return eligible[0] ?? null
}

export function buildUnlockTaskRequest(input: {
  fields: UnlockFormFields
  task: Task
  dateKey: string
  dailyPlans: readonly DailyPlan[]
}): UnlockTaskRunRequest {
  if (!canRequestUnlock(input.task)) {
    throw new Error('Esta tarefa não pode receber ajuda do agente.')
  }

  const details = input.fields.blockageDetails.trim()
  if (details.length > BLOCKAGE_DETAILS_MAX_LENGTH) {
    throw new Error('O detalhe do bloqueio está longo demais.')
  }

  return UnlockTaskRunRequestSchema.parse({
    clientRequestId: input.fields.clientRequestId,
    task: {
      id: input.task.id,
      title: input.task.title,
      nextAction: input.task.nextAction,
      energy: input.task.energy,
      estimatedMinutes: input.task.estimatedMinutes,
      status: input.task.status,
    },
    blockageReason: input.fields.blockageReason,
    blockageDetails: details.length > 0 ? details : null,
    availableMinutes: clampAvailableMinutes(input.fields.availableMinutes),
    currentEnergy: input.fields.currentEnergy || null,
    today: {
      date: input.dateKey,
      role: todayRoleForTask(input.task.id, input.dateKey, input.dailyPlans),
      plannedTaskCount: plannedTaskCountForDate(
        input.dateKey,
        input.dailyPlans,
      ),
    },
    locale: 'pt-BR',
  })
}
