import {
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
  UnlockTaskRunRequestSchema,
  type BlockageReason,
  type TodayPlanRole,
  type UnlockTaskRunRequest,
} from '@destravai/contracts'
import {
  getDailyPlanByDate,
  type DailyPlan,
  type Task,
  type TaskEnergy,
} from '@destravai/core'

export const BLOCKAGE_OPTIONS: { value: BlockageReason; label: string }[] = [
  { value: 'dont_know_where_to_start', label: 'Não sei por onde começar' },
  { value: 'procrastinating', label: 'Estou procrastinando' },
  { value: 'low_energy', label: 'Estou com pouca energia' },
  { value: 'overwhelmed', label: 'Estou sobrecarregada' },
  { value: 'other', label: 'Outro motivo' },
]

export function canRequestUnlock(task: Task) {
  return task.status === 'inbox' || task.status === 'active'
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
  return Math.min(MAX_AVAILABLE_MINUTES, Math.max(MIN_AVAILABLE_MINUTES, Math.round(value)))
}

export function buildUnlockTaskRequest(input: {
  clientRequestId: string
  task: Task
  blockageReason: BlockageReason
  blockageDetails: string | null
  availableMinutes: number
  currentEnergy: TaskEnergy | null
  dateKey: string
  role: TodayPlanRole
  plannedTaskCount: number
  locale?: 'pt-BR' | 'en-US'
}): UnlockTaskRunRequest {
  if (!canRequestUnlock(input.task)) {
    throw new Error('Esta tarefa não pode receber ajuda do agente.')
  }

  const details = input.blockageDetails?.trim() || null

  return UnlockTaskRunRequestSchema.parse({
    clientRequestId: input.clientRequestId,
    task: {
      id: input.task.id,
      title: input.task.title,
      nextAction: input.task.nextAction,
      energy: input.task.energy,
      estimatedMinutes: input.task.estimatedMinutes,
      status: input.task.status,
    },
    blockageReason: input.blockageReason,
    blockageDetails: details,
    availableMinutes: clampAvailableMinutes(input.availableMinutes),
    currentEnergy: input.currentEnergy,
    today: {
      date: input.dateKey,
      role: input.role,
      plannedTaskCount: input.plannedTaskCount,
    },
    locale: input.locale ?? 'pt-BR',
  })
}
