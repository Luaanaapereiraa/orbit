import type { Task } from '../tasks/types'
import { canTaskEnterPlan } from './eligibility'
import { isValidLocalDateKey } from './date-key'
import type { DailyPlan } from './types'

export type { DailyPlan }
export { canTaskEnterPlan } from './eligibility'
export { formatLocalDateKey, isValidLocalDateKey } from './date-key'

export function getDailyPlanByDate(plans: DailyPlan[], date: string) {
  if (!isValidLocalDateKey(date)) {
    return null
  }

  return plans.find((plan) => plan.date === date) ?? null
}

export function normalizePlanIds(plan: DailyPlan): DailyPlan {
  const seen = new Set<string>()
  const secondaryTaskIds: string[] = []

  for (const id of plan.secondaryTaskIds) {
    if (!id || id === plan.essentialTaskId || seen.has(id)) {
      continue
    }

    seen.add(id)
    secondaryTaskIds.push(id)

    if (secondaryTaskIds.length === 2) {
      break
    }
  }

  return {
    ...plan,
    secondaryTaskIds,
  }
}

export function sanitizeDailyPlan(plan: DailyPlan, tasks: Task[]): DailyPlan {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const normalized = normalizePlanIds(plan)
  const essentialTask = normalized.essentialTaskId
    ? byId.get(normalized.essentialTaskId)
    : undefined
  const essentialTaskId = canTaskEnterPlan(essentialTask)
    ? essentialTask.id
    : null
  const secondaryTaskIds = normalized.secondaryTaskIds.filter((id) => {
    if (id === essentialTaskId) {
      return false
    }

    return canTaskEnterPlan(byId.get(id))
  })

  return {
    ...normalized,
    essentialTaskId,
    secondaryTaskIds,
  }
}

export function resolvePlanTasks(plan: DailyPlan, tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const essential = plan.essentialTaskId
    ? byId.get(plan.essentialTaskId) ?? null
    : null
  const secondaries = plan.secondaryTaskIds
    .map((id) => byId.get(id))
    .filter((task): task is Task => !!task)

  return { essential, secondaries }
}

export function removeTaskFromPlans(
  plans: DailyPlan[],
  taskId: string,
  now: string,
) {
  let changed = false
  const next = plans.map((plan) => {
    const essentialTaskId =
      plan.essentialTaskId === taskId ? null : plan.essentialTaskId
    const secondaryTaskIds = plan.secondaryTaskIds.filter((id) => id !== taskId)

    if (
      essentialTaskId === plan.essentialTaskId &&
      secondaryTaskIds.length === plan.secondaryTaskIds.length
    ) {
      return plan
    }

    changed = true
    return {
      ...plan,
      essentialTaskId,
      secondaryTaskIds,
      updatedAt: now,
    }
  })

  return changed ? next : plans
}

export function clearInvalidPlanReferences(
  plans: DailyPlan[],
  tasks: Task[],
  now: string,
) {
  let changed = false
  const next = plans.map((plan) => {
    const sanitized = sanitizeDailyPlan(plan, tasks)

    if (
      sanitized.essentialTaskId === plan.essentialTaskId &&
      sanitized.secondaryTaskIds.length === plan.secondaryTaskIds.length &&
      sanitized.secondaryTaskIds.every(
        (id, index) => id === plan.secondaryTaskIds[index],
      )
    ) {
      return plan
    }

    changed = true
    return {
      ...sanitized,
      updatedAt: now,
    }
  })

  return changed ? next : plans
}

export function upsertDailyPlan(
  plans: DailyPlan[],
  input: {
    date: string
    now: string
    essentialTaskId?: string | null
    secondaryTaskIds?: string[]
  },
  tasks: Task[],
): DailyPlan[] {
  if (!isValidLocalDateKey(input.date)) {
    return plans
  }

  const existing = getDailyPlanByDate(plans, input.date)
  const draft: DailyPlan = {
    date: input.date,
    essentialTaskId:
      input.essentialTaskId !== undefined
        ? input.essentialTaskId
        : existing?.essentialTaskId ?? null,
    secondaryTaskIds:
      input.secondaryTaskIds !== undefined
        ? input.secondaryTaskIds
        : existing?.secondaryTaskIds ?? [],
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  }
  const nextPlan = sanitizeDailyPlan(draft, tasks)

  if (existing) {
    return plans.map((plan) => (plan.date === input.date ? nextPlan : plan))
  }

  return [...plans, nextPlan]
}

export function setDailyPlanEssential(
  plans: DailyPlan[],
  date: string,
  taskId: string | null,
  now: string,
  tasks: Task[],
) {
  if (taskId !== null) {
    const task = tasks.find((item) => item.id === taskId)

    if (!canTaskEnterPlan(task)) {
      return plans
    }
  }

  const existing = getDailyPlanByDate(plans, date)

  if (!existing && !isValidLocalDateKey(date)) {
    return plans
  }

  const secondaries = (existing?.secondaryTaskIds ?? []).filter(
    (id) => id !== taskId,
  )

  return upsertDailyPlan(
    plans,
    {
      date,
      now,
      essentialTaskId: taskId,
      secondaryTaskIds: secondaries,
    },
    tasks,
  )
}

export function addDailyPlanSecondary(
  plans: DailyPlan[],
  date: string,
  taskId: string,
  now: string,
  tasks: Task[],
) {
  const task = tasks.find((item) => item.id === taskId)

  if (!canTaskEnterPlan(task)) {
    return plans
  }

  const existing = getDailyPlanByDate(plans, date)

  if (existing?.essentialTaskId === taskId) {
    return plans
  }

  if (existing?.secondaryTaskIds.includes(taskId)) {
    return plans
  }

  if ((existing?.secondaryTaskIds.length ?? 0) >= 2) {
    return plans
  }

  return upsertDailyPlan(
    plans,
    {
      date,
      now,
      secondaryTaskIds: [...(existing?.secondaryTaskIds ?? []), taskId],
    },
    tasks,
  )
}

export function removeDailyPlanSecondary(
  plans: DailyPlan[],
  date: string,
  taskId: string,
  now: string,
  tasks: Task[],
) {
  const existing = getDailyPlanByDate(plans, date)

  if (!existing || !existing.secondaryTaskIds.includes(taskId)) {
    return plans
  }

  return upsertDailyPlan(
    plans,
    {
      date,
      now,
      secondaryTaskIds: existing.secondaryTaskIds.filter((id) => id !== taskId),
    },
    tasks,
  )
}
